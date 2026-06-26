import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { splitPlan } from '@/shared/domain/split';
import { AIR, blockStateString, type RawPaletteEntry, type RawStructure } from '../raw';
import { splitToJigsaw } from '../split-structure';
import { readAuthoring } from '../../authoring/nbt-decode';
import { DEFAULT_DATA_VERSION } from '../../mc-data-version';

const LIMIT = 48;

/** A dense oversized test structure (50×6×50 → a 2×1×2 grid, 4 pieces / 3 edges) with a
 *  distinctive corner block and a chest block entity placed away from any seam. */
function makeRaw(): RawStructure {
  const size: [number, number, number] = [50, 6, 50];
  const palette: RawPaletteEntry[] = [
    { Name: 'minecraft:air' },
    { Name: 'minecraft:stone' },
    { Name: 'minecraft:oak_log', Properties: { axis: 'y' } },
    { Name: 'minecraft:chest', Properties: { facing: 'north' } },
  ];
  const blocks: RawStructure['blocks'] = [];
  for (let x = 0; x < size[0]; x++) {
    for (let y = 0; y < size[1]; y++) {
      for (let z = 0; z < size[2]; z++) {
        let state = 1; // stone
        if (x === 0 && y === 0 && z === 0) state = 2; // oak_log corner marker
        if (x === 3 && y === 1 && z === 3) state = 3; // chest (BE), away from seams
        blocks.push({ state, pos: [x, y, z] });
      }
    }
  }
  return {
    size,
    palette,
    blocks,
    blockEntities: [{ pos: [3, 1, 3], id: 'minecraft:chest', nbt: { CustomName: '{"text":"loot"}' } }],
  };
}

const key = (x: number, y: number, z: number) => `${x},${y},${z}`;

describe('splitToJigsaw round-trip', () => {
  it('reassembles the structure voxel-perfectly (each seam restored by its final_state)', async () => {
    const raw = makeRaw();
    const plan = splitPlan(raw.size, LIMIT);
    expect(plan.oversized).toBe(true);

    const { files, warnings } = splitToJigsaw(raw, plan, {
      namespace: 'testmod',
      base: 'big',
      version: '1.21.1',
      worldgen: { generate: true, terrainAdaptation: 'beard_thin', biomes: ['minecraft:plains'], spacing: 32, separation: 8 },
      dataVersion: DEFAULT_DATA_VERSION,
    });
    // No block entity sat on a seam (we placed it in a corner), so no loss warning.
    expect(warnings.find((w) => w.code === 'split_block_entity')).toBeUndefined();

    // The jigsaw structure def must load: vanilla rejects it when max_distance_from_center +
    // the terrain-adaptation margin (12 for non-`none`) exceeds 128.
    const structFile = files.find((f) => f.kind === 'structure');
    if (!structFile || !('json' in structFile)) throw new Error('missing structure def');
    const mdfc = (structFile.json as { max_distance_from_center: number }).max_distance_from_center;
    expect(mdfc + 12).toBeLessThanOrEqual(128);

    // Expected original blocks (state string per occupied cell).
    const expected = new Map<string, string>();
    for (const b of raw.blocks) expected.set(key(b.pos[0], b.pos[1], b.pos[2]), blockStateString(raw.palette[b.state]));

    const pieceFiles = files.filter((f) => f.kind === 'piece');
    expect(pieceFiles).toHaveLength(plan.slots.length);

    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bw-split-'));
    const reconstructed = new Map<string, string>();
    const connectorCells = new Set<string>();
    let jigsawCount = 0;
    let chestSurvived = false;

    // Decode every piece (the real encode→decode path) and rebuild it at its slot's origin —
    // which is exactly where the jigsaw assembly places it (offset = M_slot, proven per edge).
    for (let i = 0; i < plan.slots.length; i++) {
      const slot = plan.slots[i];
      const file = pieceFiles[i];
      if (!('buffer' in file)) throw new Error('piece must be a buffer');
      const fp = path.join(dir, `p${i}.nbt`);
      fs.writeFileSync(fp, file.buffer);
      const a = await readAuthoring(fp);
      const palette = a.palette ?? [];
      for (const b of a.blocks ?? []) {
        const k = key(slot.min[0] + b.pos[0], slot.min[1] + b.pos[1], slot.min[2] + b.pos[2]);
        const entry = palette[b.state];
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

    // Every original non-seam cell comes back identical; no extra cells are invented.
    for (const [k, v] of expected) {
      if (connectorCells.has(k)) continue;
      expect(reconstructed.get(k)).toBe(v);
    }
    for (const k of reconstructed.keys()) expect(expected.has(k)).toBe(true);

    // One connector pair per tree edge; the block entity rode along untouched.
    expect(jigsawCount).toBe(2 * plan.edges.length);
    expect(chestSurvived).toBe(true);

    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('handles a vertical (Y-axis) split with up/down connectors', async () => {
    const size: [number, number, number] = [10, 60, 10]; // ny=2 → one vertical edge
    const palette: RawPaletteEntry[] = [{ Name: 'minecraft:stone' }, { Name: 'minecraft:glass' }];
    const blocks: RawStructure['blocks'] = [];
    for (let x = 0; x < size[0]; x++)
      for (let y = 0; y < size[1]; y++)
        for (let z = 0; z < size[2]; z++) blocks.push({ state: y % 2, pos: [x, y, z] });
    const raw: RawStructure = { size, palette, blocks };

    const plan = splitPlan(size, LIMIT);
    expect(plan.divisions).toEqual({ nx: 1, ny: 2, nz: 1 });
    expect(plan.edges.map((e) => e.dir).every((d) => d === 'up' || d === 'down')).toBe(true);

    // splitToJigsaw asserts solveAttachment round-trips for every edge — a vertical mismatch
    // would throw here. Reaching the assertions means the connectors are geometrically valid.
    const { files } = splitToJigsaw(raw, plan, {
      namespace: 'm',
      base: 'tall',
      version: '1.21.1',
      worldgen: { generate: true, terrainAdaptation: 'none', biomes: ['minecraft:plains'], spacing: 16, separation: 6 },
      dataVersion: DEFAULT_DATA_VERSION,
    });

    const expected = new Map<string, string>();
    for (const b of raw.blocks) expected.set(key(b.pos[0], b.pos[1], b.pos[2]), blockStateString(raw.palette[b.state]));

    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bw-split-y-'));
    const reconstructed = new Map<string, string>();
    const connectorCells = new Set<string>();
    const pieceFiles = files.filter((f) => f.kind === 'piece');
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
        if (entry.Name === 'minecraft:jigsaw') {
          connectorCells.add(k);
          expect(String((b.nbt as Record<string, unknown> | undefined)?.final_state ?? AIR)).toBe(expected.get(k) ?? AIR);
          continue;
        }
        reconstructed.set(k, blockStateString(entry as RawPaletteEntry));
      }
    }
    for (const [k, v] of expected) {
      if (connectorCells.has(k)) continue;
      expect(reconstructed.get(k)).toBe(v);
    }
    fs.rmSync(dir, { recursive: true, force: true });
  });
});
