import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { writeStructureFile } from '../compile';
import { readAuthoring } from '../nbt-decode';
import type { AuthoringStructure } from '../types';

describe('nbt encode → decode round-trip', () => {
  it('preserves size, block count, names and string-typed properties', async () => {
    const s: AuthoringStructure = {
      size: [2, 1, 2],
      palette: [
        { Name: 'minecraft:stone' },
        { Name: 'minecraft:oak_stairs', Properties: { facing: 'east', half: 'bottom', shape: 'straight', waterlogged: 'false' } },
      ],
      ops: [
        { op: 'fill', from: [0, 0, 0], to: [1, 0, 1], state: 0 }, // 4-cell floor (no vertical gaps)
        { op: 'block', pos: [0, 0, 0], state: 1 },                 // one stair overlay
      ],
    };
    const file = path.join(os.tmpdir(), `bw-roundtrip-${Date.now()}.nbt`);
    await writeStructureFile(s, file);
    const back = await readAuthoring(file);
    await fs.unlink(file);

    expect(back.size).toEqual([2, 1, 2]);
    expect(back.blocks?.length).toBe(4);
    const names = new Set((back.palette ?? []).map((p) => p.Name));
    expect(names.has('minecraft:stone')).toBe(true);
    expect(names.has('minecraft:oak_stairs')).toBe(true);
    const stair = (back.blocks ?? []).find((b) => (back.palette ?? [])[b.state].Name === 'minecraft:oak_stairs');
    expect(stair).toBeDefined();
    expect((back.palette ?? [])[stair!.state].Properties?.facing).toBe('east');
  });

  it('encodes mixed-type arrays in free-form block nbt as homogeneous NBT lists', async () => {
    // NBT lists are homogeneous: [1, 1.5] must promote to all-double; ['a', 2] keeps
    // only the string elements — never a corrupt list with values under the wrong tag.
    const s: AuthoringStructure = {
      size: [1, 1, 1],
      palette: [{ Name: 'minecraft:chest' }],
      blocks: [{ state: 0, pos: [0, 0, 0], nbt: { Weights: [1, 1.5], Tags: ['a', 2] } }],
    };
    const file = path.join(os.tmpdir(), `bw-mixed-list-${Date.now()}.nbt`);
    await writeStructureFile(s, file);
    const back = await readAuthoring(file);
    await fs.unlink(file);

    const chest = (back.blocks ?? [])[0];
    expect(chest?.nbt?.Weights).toEqual([1, 1.5]);
    expect(chest?.nbt?.Tags).toEqual(['a']);
  });
});
