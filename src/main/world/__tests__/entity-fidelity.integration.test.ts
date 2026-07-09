// §2.2 acceptance: world → extract → place round-trip preserves mobs, armor stands (pose
// included) and chest inventories — the two most-voted unresolved Amulet issues. A synthetic
// save (independent fixtures) is extracted through the production read path, encoded to a real
// `.nbt`, loaded back as the renderer's StructureData, planned as a placement (the renderer's
// pure math), written through the WHOLE safe write pipeline, and read back off disk.
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// encodeRaw/loadStructure reach the content-pack config, which lives in Electron's userData.
// Point it at an empty temp dir (packaged ⇒ no dev-repo content either) — no pack, flat colors.
vi.mock('electron', () => ({
  app: { isPackaged: true, getPath: () => tmpdir(), getAppPath: () => tmpdir() },
}));
import { planPlacement } from '../../../renderer/world/place';
import { encodeRaw } from '../../structure/io/convert';
import { loadStructure } from '../../structure/io/load-structure';
import { decodeChunk, decodeEntities } from '../anvil/chunk-decode';
import { RegionFile } from '../anvil/region-file';
import { regionForChunk } from '../anvil/world-paths';
import { extractRegion, type ChunkGetter } from '../extract';
import { WorldEditSession } from '../edit/world-edit-session';
import type { WorldBlockEdit } from '../edit/chunk-patch';
import {
  byteTag,
  compoundListTag,
  compoundTag,
  doubleListTag,
  floatListTag,
  intArrayTag,
  intTag,
  stringTag,
  type Compound,
} from '../edit/nbt-tree';
import { encodeTagRoot } from '../edit/nbt-tree';
import { chunkTag, regionFixture, sectionTag } from '../edit/__tests__/fixtures';

const DIM = 'minecraft:overworld';
const stone = { Name: 'minecraft:stone' };
const chest = { Name: 'minecraft:chest' };

/** Section cells: all stone except a chest block at (4,2,4). */
function cellsWithChest(): number[] {
  const cells = new Array<number>(4096).fill(0);
  cells[2 * 256 + 4 * 16 + 4] = 1;
  return cells;
}

const chestBe: Compound = {
  id: stringTag('minecraft:chest'),
  x: intTag(4),
  y: intTag(2),
  z: intTag(4),
  keepPacked: byteTag(0),
  Items: compoundListTag([
    { Slot: byteTag(0), id: stringTag('minecraft:diamond'), Count: byteTag(3) },
  ]),
};

const cow: Compound = {
  id: stringTag('minecraft:cow'),
  Pos: doubleListTag([4.5, 3, 4.5]),
  Rotation: floatListTag([90, 0]),
  Health: { type: 'float', value: 10 },
  UUID: intArrayTag([9, 9, 9, 9]),
};

const armorStand: Compound = {
  id: stringTag('minecraft:armor_stand'),
  Pos: doubleListTag([5.5, 3, 5.5]),
  Rotation: floatListTag([-45, 0]),
  Pose: compoundTag({ Head: floatListTag([10, 20, 30]) }),
  UUID: intArrayTag([8, 8, 8, 8]),
};

async function makeWorld(dir: string): Promise<string> {
  const root = path.join(dir, 'world');
  await mkdir(path.join(root, 'region'), { recursive: true });
  await mkdir(path.join(root, 'entities'), { recursive: true });
  await writeFile(path.join(root, 'level.dat'), Buffer.from([0]));

  const chunks = [
    { lx: 0, lz: 0, nbt: encodeTagRoot(chunkTag({ cx: 0, cz: 0, sections: [sectionTag(0, [stone, chest], cellsWithChest())], blockEntities: [chestBe] })) },
    { lx: 1, lz: 0, nbt: encodeTagRoot(chunkTag({ cx: 1, cz: 0, sections: [sectionTag(0, [stone])] })) },
  ];
  await writeFile(path.join(root, 'region', 'r.0.0.mca'), regionFixture(chunks).buffer);

  const entityChunk = compoundTag({
    DataVersion: intTag(3955),
    Position: intArrayTag([0, 0]),
    Entities: compoundListTag([cow, armorStand]),
  });
  const entities = regionFixture([{ lx: 0, lz: 0, nbt: encodeTagRoot(entityChunk) }]);
  await writeFile(path.join(root, 'entities', 'r.0.0.mca'), entities.buffer);
  return root;
}

/** The production read merge (block chunk + sibling entities record) on the bare files. */
function chunkGetterFor(root: string): ChunkGetter {
  return async (_dim, cx, cz) => {
    const { rx, rz, lx, lz } = regionForChunk(cx, cz);
    let nbt: Record<string, unknown> | null;
    try {
      const region = await RegionFile.open(path.join(root, 'region', `r.${rx}.${rz}.mca`));
      nbt = await region.readChunkNBT(lx, lz);
    } catch {
      return null;
    }
    if (!nbt) return null;
    const column = decodeChunk(nbt);
    if (column && column.entities.length === 0) {
      try {
        const er = await RegionFile.open(path.join(root, 'entities', `r.${rx}.${rz}.mca`));
        const enbt = await er.readChunkNBT(lx, lz);
        if (enbt) column.entities = decodeEntities(enbt);
      } catch {
        /* no entities file */
      }
    }
    return column;
  };
}

describe('entity/container fidelity round-trip (§2.2)', () => {
  let dir: string;
  let root: string;
  let session: WorldEditSession | null = null;

  beforeEach(async () => {
    dir = await mkdtemp(path.join(tmpdir(), 'bw-fidelity-'));
    root = await makeWorld(dir);
  });
  afterEach(async () => {
    await session?.close();
    session = null;
    await rm(dir, { recursive: true, force: true });
  });

  it('extract → .nbt → place preserves the mob, the posed armor stand and the chest contents', async () => {
    // 1. Extract the 8×8×8 corner holding the chest + both entities.
    const raw = await extractRegion({ dim: DIM, min: [0, 0, 0], max: [7, 7, 7] }, chunkGetterFor(root));
    expect(raw.blockEntities).toHaveLength(1);
    expect(raw.entities).toHaveLength(2);

    // 2. Through a real file: encode, then load as the renderer's StructureData.
    const nbtPath = path.join(dir, 'extract.nbt');
    await writeFile(nbtPath, encodeRaw(raw, nbtPath, 1751800000000));
    const data = await loadStructure(nbtPath);
    expect(data.blockEntities).toHaveLength(1);
    expect(data.blockEntities?.[0]).toMatchObject({ pos: [4, 2, 4], id: 'minecraft:chest' });
    expect(data.rawEntities).toHaveLength(2);

    // 3. Plan the placement at an anchor in chunk (1,0) and write it through the pipeline.
    const plan = planPlacement(data, [20, 0, 4], 0);
    const mapped: WorldBlockEdit[] = plan.edits.map((e) => ({
      x: e.x,
      y: e.y,
      z: e.z,
      state: e.properties && Object.keys(e.properties).length ? { Name: e.name, Properties: e.properties } : { Name: e.name },
      ...(e.blockEntity ? { blockEntity: e.blockEntity } : {}),
    }));
    session = await WorldEditSession.open(root, DIM);
    const report = await session.applyEdits(mapped, plan.entities, 1751800000000);
    expect(report.refused).toHaveLength(0);
    expect(report.placedEntities).toBe(2);

    // 4. Read the world back: the chest block + its inventory landed at anchor+rel = (24,2,8)…
    const column = await chunkGetterFor(root)(DIM, 1, 0);
    if (!column) throw new Error('placed chunk unreadable');
    const placedBe = column.blockEntities.find((be) => be.pos[0] === 24 && be.pos[1] === 2 && be.pos[2] === 8);
    expect(placedBe?.id).toBe('minecraft:chest');
    expect(placedBe?.nbt.Items).toEqual([{ Slot: 0, id: 'minecraft:diamond', Count: 3 }]);

    // …and both entities followed, with rotation/pose intact and UUIDs regenerated.
    const placedCow = column.entities.find((e) => e.nbt.id === 'minecraft:cow');
    expect(placedCow?.pos).toEqual([24.5, 3, 8.5]);
    expect(placedCow?.nbt.Rotation).toEqual([90, 0]);
    expect(placedCow?.nbt.Health).toBe(10);
    expect(placedCow?.nbt.UUID).not.toEqual([9, 9, 9, 9]);
    const placedStand = column.entities.find((e) => e.nbt.id === 'minecraft:armor_stand');
    expect(placedStand?.pos).toEqual([25.5, 3, 9.5]);
    expect(placedStand?.nbt.Rotation).toEqual([-45, 0]);
    expect((placedStand?.nbt.Pose as { Head: number[] }).Head).toEqual([10, 20, 30]);

    // The source chest/entities are untouched (the paste ADDS — it never rewrites the origin).
    const origin = await chunkGetterFor(root)(DIM, 0, 0);
    expect(origin?.blockEntities[0]?.pos).toEqual([4, 2, 4]);
    expect(origin?.entities).toHaveLength(2);
  });
});
