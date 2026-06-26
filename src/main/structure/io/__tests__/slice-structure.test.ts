import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { splitPlan, type Vec3 } from '@/shared/domain/split';
import { blockStateString, type RawStructure } from '../raw';
import { sliceCleanPieces } from '../slice-structure';
import { mergeFromPieces, type PlacedPiece } from '../merge-structure';
import { readRaw } from '../convert';
import { DEFAULT_DATA_VERSION } from '../../mc-data-version';

const LIMIT = 48;

/** Clean-slice a structure, decode each piece, and stitch it back — the editing-scaffold
 *  round-trip (no jigsaw connectors). The merged structure must equal the original. */
async function roundTrip(raw: RawStructure): Promise<RawStructure> {
  const plan = splitPlan(raw.size, LIMIT);
  const pieces = sliceCleanPieces(raw, plan, DEFAULT_DATA_VERSION);
  expect(pieces).toHaveLength(plan.slots.length);

  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bw-slice-'));
  const placed: PlacedPiece[] = [];
  for (const p of pieces) {
    const fp = path.join(dir, `${p.name}.nbt`);
    fs.writeFileSync(fp, p.buffer);
    placed.push({ origin: p.slot.min, raw: await readRaw(fp) });
  }
  fs.rmSync(dir, { recursive: true, force: true });
  return mergeFromPieces(placed, raw.size);
}

function cellMap(raw: RawStructure): Map<string, string> {
  const m = new Map<string, string>();
  for (const b of raw.blocks) m.set(b.pos.join(','), blockStateString(raw.palette[b.state]));
  return m;
}

describe('sliceCleanPieces (editing scaffold) round-trip', () => {
  it('slices into connector-free pieces that reassemble voxel-perfectly', async () => {
    const palette = [{ Name: 'minecraft:air' }, { Name: 'minecraft:stone' }, { Name: 'minecraft:oak_planks' }];
    const size: Vec3 = [60, 10, 60];
    const blocks: RawStructure['blocks'] = [];
    for (let x = 0; x < size[0]; x++)
      for (let y = 0; y < size[1]; y++)
        for (let z = 0; z < size[2]; z++) blocks.push({ state: (x + z) % 2 ? 1 : 2, pos: [x, y, z] });
    const raw: RawStructure = {
      size,
      palette,
      blocks,
      blockEntities: [{ pos: [10, 0, 10], id: 'minecraft:chest', nbt: { CustomName: '{"text":"x"}' } }],
    };

    const merged = await roundTrip(raw);
    const expected = cellMap(raw);
    const got = cellMap(merged);
    expect(got.size).toBe(expected.size);
    for (const [k, v] of expected) expect(got.get(k)).toBe(v);

    // No jigsaw connectors in a clean slice, and the block entity survives.
    expect(merged.palette.some((p) => p.Name === 'minecraft:jigsaw')).toBe(false);
    expect((merged.blockEntities ?? []).some((be) => be.id === 'minecraft:chest')).toBe(true);
  });
});
