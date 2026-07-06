// Integration: a synthetic world in a temp dir goes through the WHOLE write pipeline —
// lock → gate → patch → backup → atomic rewrite → POI invalidation — then is read back through
// the production reader (`RegionFile` + `decodeChunk`) and restored from backup.
import { access, mkdir, mkdtemp, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { blockIndexAt, decodeChunk } from '../../anvil/chunk-decode';
import { RegionFile } from '../../anvil/region-file';
import { listBackups, restoreBackup } from '../backup';
import { encodeTagRoot } from '../nbt-tree';
import { WorldEditSession } from '../world-edit-session';
import { chunkTag, poiChunkTag, regionFixture, sectionTag } from './fixtures';

const DIM = 'minecraft:overworld';
const stone = { Name: 'minecraft:stone' };

async function makeWorld(dir: string): Promise<string> {
  const root = path.join(dir, 'world');
  await mkdir(path.join(root, 'region'), { recursive: true });
  await mkdir(path.join(root, 'poi'), { recursive: true });
  await writeFile(path.join(root, 'level.dat'), Buffer.from([0]));

  // Region r.0.0: chunks (0,0) and (1,0) full; (2,0) is a proto chunk (refused by the gate).
  const chunks = [
    { lx: 0, lz: 0, nbt: encodeTagRoot(chunkTag({ cx: 0, cz: 0, sections: [sectionTag(0, [stone])] })), timestamp: 10 },
    { lx: 1, lz: 0, nbt: encodeTagRoot(chunkTag({ cx: 1, cz: 0, sections: [sectionTag(0, [stone])] })), timestamp: 11 },
    { lx: 2, lz: 0, nbt: encodeTagRoot(chunkTag({ cx: 2, cz: 0, status: 'minecraft:features', sections: [sectionTag(0, [stone])] })), timestamp: 12 },
  ];
  await writeFile(path.join(root, 'region', 'r.0.0.mca'), regionFixture(chunks).buffer);

  // POI region: chunk (0,0) has a valid record in section 0.
  const poi = regionFixture([{ lx: 0, lz: 0, nbt: encodeTagRoot(poiChunkTag([0], 1)), timestamp: 10 }]);
  await writeFile(path.join(root, 'poi', 'r.0.0.mca'), poi.buffer);
  return root;
}

describe('WorldEditSession (integration)', () => {
  let dir: string;
  let root: string;
  let session: WorldEditSession | null = null;

  beforeEach(async () => {
    dir = await mkdtemp(path.join(tmpdir(), 'bw-world-'));
    root = await makeWorld(dir);
  });
  afterEach(async () => {
    await session?.close();
    session = null;
    await rm(dir, { recursive: true, force: true });
  });

  it('refuses a non-world folder', async () => {
    await expect(WorldEditSession.open(dir, DIM)).rejects.toThrow(/level\.dat/);
  });

  it('writes edits end-to-end: gate, backup, atomic rewrite, POI, neighbor relight', async () => {
    session = await WorldEditSession.open(root, DIM);
    expect((await readdir(root)).includes('session.lock')).toBe(true);

    const report = await session.applyEdits(
      [
        { x: 1, y: 2, z: 3, state: { Name: 'minecraft:diamond_block' } }, // chunk (0,0)
        { x: 33, y: 1, z: 1, state: { Name: 'minecraft:gold_block' } }, // chunk (2,0) — proto, refused
      ],
      1751800000000,
    );

    expect(report.changedBlocks).toBe(1);
    expect(report.editedChunks).toEqual([{ cx: 0, cz: 0 }]);
    expect(report.refused).toHaveLength(1);
    expect(report.refused[0]).toMatchObject({ cx: 2, cz: 0 });
    expect(report.refused[0].reason).toMatch(/not fully generated/);

    // The block landed, readable through the production reader.
    const region = await RegionFile.open(path.join(root, 'region', 'r.0.0.mca'));
    const chunk = decodeChunk((await region.readChunkNBT(0, 0)) as Record<string, unknown>);
    const section = chunk?.sections.find((s) => s.sectionY === 0);
    if (!section) throw new Error('section missing');
    expect(section.palette[blockIndexAt(section, 1, 2, 3)].Name).toBe('minecraft:diamond_block');

    // The edited chunk was flagged for relight + heightmap re-prime.
    const editedNbt = (await region.readChunkNBT(0, 0)) as Record<string, unknown>;
    expect(editedNbt.isLightOn).toBe(0);
    expect(editedNbt.Heightmaps).toBeUndefined();

    // The full NEIGHBOR chunk got light-flagged too (blocks untouched); the proto one didn't.
    const neighbor = (await region.readChunkNBT(1, 0)) as Record<string, unknown>;
    expect(neighbor.isLightOn).toBe(0);
    expect(neighbor.Heightmaps).toBeDefined(); // only light staleness for neighbors
    const proto = (await region.readChunkNBT(2, 0)) as Record<string, unknown>;
    expect(proto.isLightOn).toBe(1);

    // POI section invalidated.
    const poiRegion = await RegionFile.open(path.join(root, 'poi', 'r.0.0.mca'));
    const poiChunk = (await poiRegion.readChunkNBT(0, 0)) as { Sections: Record<string, { Valid: number }> };
    expect(poiChunk.Sections['0'].Valid).toBe(0);

    // An enforced backup set exists and holds both files (save-root-relative).
    expect(report.backup).not.toBeNull();
    const sets = await listBackups(root);
    expect(sets).toHaveLength(1);
    expect(sets[0].files).toEqual(expect.arrayContaining([path.join('region', 'r.0.0.mca'), path.join('poi', 'r.0.0.mca')]));
  });

  it('backs up each file only once per session, and restore brings the original back', async () => {
    session = await WorldEditSession.open(root, DIM);
    const first = await session.applyEdits([{ x: 1, y: 2, z: 3, state: { Name: 'minecraft:diamond_block' } }], 1751800000000);
    expect(first.backup).not.toBeNull();

    const second = await session.applyEdits([{ x: 2, y: 2, z: 3, state: { Name: 'minecraft:gold_block' } }], 1751800600000);
    expect(second.backup).toBeNull(); // same files — already backed up this session

    await restoreBackup(root, first.backup!.id);
    const region = await RegionFile.open(path.join(root, 'region', 'r.0.0.mca'));
    const chunk = decodeChunk((await region.readChunkNBT(0, 0)) as Record<string, unknown>);
    const section = chunk?.sections.find((s) => s.sectionY === 0);
    if (!section) throw new Error('section missing');
    // Both edits rolled back: the whole section is stone again.
    expect(section.uniform).toBe(true);
    expect(section.palette[0].Name).toBe('minecraft:stone');
  });

  it('refuses edits on ungenerated chunks (absent region)', async () => {
    session = await WorldEditSession.open(root, DIM);
    const report = await session.applyEdits([{ x: 5000, y: 2, z: 5000, state: stone }]);
    expect(report.changedBlocks).toBe(0);
    expect(report.refused[0].reason).toMatch(/not generated/);
  });

  it('block entities ride through the pipeline with absolute coords', async () => {
    session = await WorldEditSession.open(root, DIM);
    await session.applyEdits([
      { x: 4, y: 5, z: 6, state: { Name: 'minecraft:chest', Properties: { facing: 'south' } }, blockEntity: { id: 'minecraft:chest' } },
    ]);
    const region = await RegionFile.open(path.join(root, 'region', 'r.0.0.mca'));
    const nbt = (await region.readChunkNBT(0, 0)) as { block_entities: Record<string, unknown>[] };
    expect(nbt.block_entities).toHaveLength(1);
    expect(nbt.block_entities[0]).toMatchObject({ id: 'minecraft:chest', x: 4, y: 5, z: 6 });
  });

  it('close releases the lock and further writes are refused', async () => {
    session = await WorldEditSession.open(root, DIM);
    await session.close();
    await expect(session.applyEdits([{ x: 0, y: 0, z: 0, state: stone }])).rejects.toThrow(/closed/);
    await expect(access(path.join(root, 'session.lock'))).resolves.toBeUndefined();
    session = null;
  });
});
