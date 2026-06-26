import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { splitPlan, type SplitPlan, type Vec3 } from '@/shared/domain/split';
import { AIR, blockStateString, type RawPaletteEntry, type RawStructure } from '../raw';
import { splitToJigsaw, type SplitFile } from '../split-structure';
import { readAuthoring } from '../../authoring/nbt-decode';
import { DEFAULT_DATA_VERSION } from '../../mc-data-version';

const LIMIT = 48;
const key = (x: number, y: number, z: number) => `${x},${y},${z}`;

const WORLDGEN = { generate: true, terrainAdaptation: 'beard_thin' as const, biomes: ['minecraft:plains'], spacing: 32, separation: 8 };

function split(raw: RawStructure) {
  return splitToJigsaw(raw, splitPlan(raw.size, LIMIT), { namespace: 'm', base: 'big', version: '1.21.1', worldgen: WORLDGEN, dataVersion: DEFAULT_DATA_VERSION });
}

/** Decode every piece (the real encode→decode path) and rebuild it at its slot's origin —
 *  which is exactly where the jigsaw assembly places it (offset = M_slot, proven per edge).
 *  Asserts each seam connector restores the original block via its `final_state`, and returns
 *  the reconstructed non-seam cells + the connector cells so callers can compare to the source. */
async function reconstruct(raw: RawStructure, plan: SplitPlan, files: SplitFile[]) {
  const expected = new Map<string, string>();
  for (const b of raw.blocks) expected.set(key(b.pos[0], b.pos[1], b.pos[2]), blockStateString(raw.palette[b.state]));

  const pieceFiles = files.filter((f) => f.kind === 'piece');
  expect(pieceFiles).toHaveLength(plan.slots.length);

  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bw-split-'));
  const reconstructed = new Map<string, string>();
  const connectorCells = new Set<string>();
  let jigsawCount = 0;
  let chestSurvived = false;

  for (let i = 0; i < plan.slots.length; i++) {
    const slot = plan.slots[i];
    const file = pieceFiles[i];
    if (!('buffer' in file)) throw new Error('piece must be a buffer');
    const fp = path.join(dir, `p${i}.nbt`);
    fs.writeFileSync(fp, file.buffer);
    const a = await readAuthoring(fp);
    for (const b of a.blocks ?? []) {
      const k = key(slot.min[0] + b.pos[0], slot.min[1] + b.pos[1], slot.min[2] + b.pos[2]);
      const entry = (a.palette ?? [])[b.state];
      const nbt = b.nbt as Record<string, unknown> | undefined;
      if (entry.Name === 'minecraft:jigsaw') {
        jigsawCount++;
        connectorCells.add(k);
        expect(String(nbt?.final_state ?? AIR)).toBe(expected.get(k) ?? AIR); // seam restored exactly
        continue;
      }
      reconstructed.set(k, blockStateString(entry as RawPaletteEntry));
      if (entry.Name === 'minecraft:chest' && nbt?.id === 'minecraft:chest') chestSurvived = true;
    }
  }
  fs.rmSync(dir, { recursive: true, force: true });

  // Every original non-seam cell comes back identical; no extra cells are invented.
  for (const [k, v] of expected) {
    if (connectorCells.has(k)) continue;
    expect(reconstructed.get(k)).toBe(v);
  }
  for (const k of reconstructed.keys()) expect(expected.has(k)).toBe(true);

  return { jigsawCount, chestSurvived };
}

describe('splitToJigsaw round-trip', () => {
  it('reassembles a structure voxel-perfectly (a dense 2×1×2 grid with a corner block entity)', async () => {
    // 50×6×50 → a 2×1×2 grid (4 pieces / 3 edges); a chest BE sits in a corner, off any seam.
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
    const raw: RawStructure = { size, palette, blocks, blockEntities: [{ pos: [3, 1, 3], id: 'minecraft:chest', nbt: { CustomName: '{"text":"loot"}' } }] };

    const plan = splitPlan(size, LIMIT);
    expect(plan.oversized).toBe(true);
    const { files, warnings } = split(raw);
    expect(warnings.find((w) => w.code === 'split_block_entity')).toBeUndefined(); // corner BE, no loss

    // The jigsaw structure def must load: vanilla rejects it when max_distance_from_center +
    // the terrain-adaptation margin (12 for non-`none`) exceeds 128.
    const structFile = files.find((f) => f.kind === 'structure');
    if (!structFile || !('json' in structFile)) throw new Error('missing structure def');
    expect((structFile.json as { max_distance_from_center: number }).max_distance_from_center + 12).toBeLessThanOrEqual(128);

    const { jigsawCount, chestSurvived } = await reconstruct(raw, plan, files);
    expect(jigsawCount).toBe(2 * plan.edges.length); // one connector pair per tree edge
    expect(chestSurvived).toBe(true);
  });

  it('handles a vertical (Y-axis) split with up/down connectors', async () => {
    const size: Vec3 = [10, 60, 10]; // ny=2 → one vertical edge
    const palette: RawPaletteEntry[] = [{ Name: 'minecraft:stone' }, { Name: 'minecraft:glass' }];
    const blocks: RawStructure['blocks'] = [];
    for (let x = 0; x < size[0]; x++)
      for (let y = 0; y < size[1]; y++)
        for (let z = 0; z < size[2]; z++) blocks.push({ state: y % 2, pos: [x, y, z] });
    const raw: RawStructure = { size, palette, blocks };

    const plan = splitPlan(size, LIMIT);
    expect(plan.divisions).toEqual({ nx: 1, ny: 2, nz: 1 });
    expect(plan.edges.every((e) => e.dir === 'up' || e.dir === 'down')).toBe(true);

    // splitToJigsaw asserts solveAttachment round-trips for every edge — a vertical mismatch
    // would throw inside split(). Reaching reconstruct() means the connectors are valid.
    const { files } = split(raw);
    await reconstruct(raw, plan, files);
  });

  it('carries an entity into the piece that contains it (rebased), not dropping it on split', async () => {
    const size: Vec3 = [50, 6, 10]; // 2 pieces along X (0..24, 25..49)
    const blocks: RawStructure['blocks'] = [];
    for (let x = 0; x < size[0]; x++) for (let y = 0; y < size[1]; y++) for (let z = 0; z < size[2]; z++) blocks.push({ state: 0, pos: [x, y, z] });
    const raw: RawStructure = {
      size,
      palette: [{ Name: 'minecraft:stone' }],
      blocks,
      entities: [{ pos: [40.5, 2, 5.5], blockPos: [40, 2, 5], nbt: { id: 'minecraft:armor_stand' } }],
    };

    const plan = splitPlan(size, LIMIT);
    const { files } = split(raw);

    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bw-split-ent-'));
    const found: { blockPos: number[]; pos: number[] }[] = [];
    const pieceFiles = files.filter((f) => f.kind === 'piece');
    for (let i = 0; i < plan.slots.length; i++) {
      const file = pieceFiles[i];
      if (!('buffer' in file)) throw new Error('piece must be a buffer');
      const fp = path.join(dir, `p${i}.nbt`);
      fs.writeFileSync(fp, file.buffer);
      const a = await readAuthoring(fp);
      for (const e of a.entities ?? []) found.push({ blockPos: e.blockPos, pos: e.pos });
    }
    fs.rmSync(dir, { recursive: true, force: true });

    expect(found).toHaveLength(1); // exactly once, in the piece that owns x=40 (min x=25)
    expect(found[0].blockPos).toEqual([15, 2, 5]);
    expect(found[0].pos).toEqual([15.5, 2, 5.5]);
  });
});
