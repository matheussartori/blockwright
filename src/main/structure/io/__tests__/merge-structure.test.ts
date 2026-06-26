import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pieceName, splitManifest, splitPlan, parseSplitManifest, type Vec3 } from '@/shared/domain/split';
import { blockStateString, type RawPaletteEntry, type RawStructure } from '../raw';
import { splitToJigsaw } from '../split-structure';
import { mergeFromPieces, reassemble, type PlacedPiece } from '../merge-structure';
import { readRaw } from '../convert';
import { DEFAULT_DATA_VERSION } from '../../mc-data-version';

const LIMIT = 48;
const WORLDGEN = { generate: true, terrainAdaptation: 'beard_thin' as const, biomes: ['minecraft:plains'], spacing: 32, separation: 8 };
const key = (x: number, y: number, z: number) => `${x},${y},${z}`;

/** Split `raw`, persist the piece buffers to temp files, then reassemble through the public
 *  `reassemble` (manifest → piece files → merge) and decode the result. Returns the merged
 *  RawStructure for voxel comparison. */
async function roundTrip(raw: RawStructure): Promise<RawStructure> {
  const plan = splitPlan(raw.size, LIMIT);
  const { files } = splitToJigsaw(raw, plan, {
    namespace: 'm',
    base: 'big',
    version: '1.21.1',
    worldgen: WORLDGEN,
    dataVersion: DEFAULT_DATA_VERSION,
  });
  const pieceFiles = files.filter((f) => f.kind === 'piece');
  expect(pieceFiles).toHaveLength(plan.slots.length);

  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bw-merge-'));
  const index = new Map<string, string>();
  for (let i = 0; i < plan.slots.length; i++) {
    const file = pieceFiles[i];
    if (!('buffer' in file)) throw new Error('piece must be a buffer');
    const name = pieceName(plan.slots[i]);
    const fp = path.join(dir, `${name}.nbt`);
    fs.writeFileSync(fp, file.buffer);
    index.set(name, fp);
  }

  const manifest = splitManifest({ namespace: 'm', base: 'big', size: raw.size, limit: LIMIT, dataVersion: DEFAULT_DATA_VERSION });
  const { raw: merged, missing } = await reassemble(manifest, (name) => index.get(name) ?? null);
  expect(missing).toEqual([]);

  // Re-encode + decode the merged result through the real `.nbt` path, proving the stitched
  // structure is a writable, reopenable file (not just an in-memory object).
  const out = path.join(dir, 'merged.nbt');
  const { encodeMergedNbt } = await import('../merge-structure');
  fs.writeFileSync(out, encodeMergedNbt(merged, DEFAULT_DATA_VERSION));
  const reread = await readRaw(out);
  fs.rmSync(dir, { recursive: true, force: true });
  return reread;
}

/** A map of world-pos → block-state string for every cell in a structure. */
function cellMap(raw: RawStructure): Map<string, string> {
  const m = new Map<string, string>();
  for (const b of raw.blocks) m.set(key(b.pos[0], b.pos[1], b.pos[2]), blockStateString(raw.palette[b.state]));
  return m;
}

describe('mergeFromPieces / reassemble round-trip', () => {
  it('reassembles a dense 2×1×2 grid voxel-perfectly, restoring seams + a block entity', async () => {
    const palette: RawPaletteEntry[] = [
      { Name: 'minecraft:air' },
      { Name: 'minecraft:stone' },
      { Name: 'minecraft:oak_log', Properties: { axis: 'y' } },
      { Name: 'minecraft:chest', Properties: { facing: 'north' } },
    ];
    const size: Vec3 = [50, 6, 50];
    const blocks: RawStructure['blocks'] = [];
    for (let x = 0; x < size[0]; x++)
      for (let y = 0; y < size[1]; y++)
        for (let z = 0; z < size[2]; z++) {
          let state = 1;
          if (x === 0 && y === 0 && z === 0) state = 2;
          if (x === 3 && y === 1 && z === 3) state = 3;
          blocks.push({ state, pos: [x, y, z] });
        }
    const raw: RawStructure = {
      size,
      palette,
      blocks,
      blockEntities: [{ pos: [3, 1, 3], id: 'minecraft:chest', nbt: { CustomName: '{"text":"loot"}' } }],
    };

    const merged = await roundTrip(raw);

    // Every original cell comes back identical, and no cells are invented.
    const expected = cellMap(raw);
    const got = cellMap(merged);
    expect(got.size).toBe(expected.size);
    for (const [k, v] of expected) expect(got.get(k)).toBe(v);

    // The chest block entity survived the split → merge with its NBT intact.
    const chest = (merged.blockEntities ?? []).find((be) => be.id === 'minecraft:chest');
    expect(chest).toBeDefined();
    expect(chest!.pos).toEqual([3, 1, 3]);
    expect(chest!.nbt.CustomName).toBe('{"text":"loot"}');
    // No jigsaw connectors leak into the reassembled structure.
    expect(merged.palette.some((p) => p.Name === 'minecraft:jigsaw')).toBe(false);
  });

  it('reassembles a vertical (Y) split', async () => {
    const size: Vec3 = [10, 60, 10];
    const palette: RawPaletteEntry[] = [{ Name: 'minecraft:stone' }, { Name: 'minecraft:glass' }];
    const blocks: RawStructure['blocks'] = [];
    for (let x = 0; x < size[0]; x++)
      for (let y = 0; y < size[1]; y++)
        for (let z = 0; z < size[2]; z++) blocks.push({ state: y % 2, pos: [x, y, z] });
    const raw: RawStructure = { size, palette, blocks };

    const merged = await roundTrip(raw);
    const expected = cellMap(raw);
    const got = cellMap(merged);
    expect(got.size).toBe(expected.size);
    for (const [k, v] of expected) expect(got.get(k)).toBe(v);
  });

  it('carries entities back to their world position', async () => {
    const size: Vec3 = [50, 6, 10];
    const blocks: RawStructure['blocks'] = [];
    for (let x = 0; x < size[0]; x++) for (let y = 0; y < size[1]; y++) for (let z = 0; z < size[2]; z++) blocks.push({ state: 0, pos: [x, y, z] });
    const raw: RawStructure = {
      size,
      palette: [{ Name: 'minecraft:stone' }],
      blocks,
      entities: [{ pos: [40.5, 2, 5.5], blockPos: [40, 2, 5], nbt: { id: 'minecraft:armor_stand' } }],
    };

    const merged = await roundTrip(raw);
    expect(merged.entities).toHaveLength(1);
    expect(merged.entities![0].blockPos).toEqual([40, 2, 5]);
    expect(merged.entities![0].pos).toEqual([40.5, 2, 5.5]);
  });

  it('places connector-free pieces verbatim (the world-resave case)', () => {
    // Two disjoint slabs, no jigsaw blocks — like regions a player saved with structure blocks.
    const pieces: PlacedPiece[] = [
      { origin: [0, 0, 0], raw: { size: [2, 1, 1], palette: [{ Name: 'minecraft:stone' }], blocks: [{ state: 0, pos: [0, 0, 0] }, { state: 0, pos: [1, 0, 0] }] } },
      { origin: [2, 0, 0], raw: { size: [2, 1, 1], palette: [{ Name: 'minecraft:dirt' }], blocks: [{ state: 0, pos: [0, 0, 0] }, { state: 0, pos: [1, 0, 0] }] } },
    ];
    const merged = mergeFromPieces(pieces, [4, 1, 1]);
    const got = cellMap(merged);
    expect(got.get('0,0,0')).toBe('minecraft:stone');
    expect(got.get('2,0,0')).toBe('minecraft:dirt');
    expect(got.size).toBe(4);
  });
});

describe('parseSplitManifest', () => {
  it('round-trips a valid manifest', () => {
    const m = splitManifest({ namespace: 'm', base: 'big', size: [50, 6, 50], limit: 48, dataVersion: DEFAULT_DATA_VERSION });
    expect(parseSplitManifest(JSON.parse(JSON.stringify(m)))).toEqual(m);
  });
  it('rejects non-manifests', () => {
    expect(parseSplitManifest(null)).toBeNull();
    expect(parseSplitManifest({})).toBeNull();
    expect(parseSplitManifest({ blockwright: 'split', v: 2, size: [1, 1, 1] })).toBeNull();
    expect(parseSplitManifest({ blockwright: 'split', v: 1, namespace: 'm', base: 'b', size: [1, 1], limit: 48, dataVersion: 1 })).toBeNull();
  });
});
