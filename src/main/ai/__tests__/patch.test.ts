import { describe, expect, it } from 'vitest';
import type { AuthoringStructure } from '../../structure/authoring';
import { mergePatch } from '../patch';

const prev: AuthoringStructure = {
  DataVersion: 3955,
  size: [10, 8, 6],
  palette: [{ Name: 'minecraft:air' }, { Name: 'minecraft:oak_planks' }],
  ops: [{ op: 'fill', from: [0, 0, 0], to: [9, 0, 5], state: 1 }],
  blocks: [{ pos: [0, 1, 0], state: 1 }],
  entities: [],
  floors: [{ role: 'ground', from: 0, to: 7 }],
};

describe('mergePatch', () => {
  it('appends the patch palette after the previous one (indices stay valid)', () => {
    const patch: AuthoringStructure = { palette: [{ Name: 'minecraft:glass' }], ops: [], blocks: [] };
    const out = mergePatch(prev, patch);
    expect(out.palette).toEqual([
      { Name: 'minecraft:air' },
      { Name: 'minecraft:oak_planks' },
      { Name: 'minecraft:glass' },
    ]);
  });

  it('concatenates ops and blocks (previous first, then the patch)', () => {
    const patch: AuthoringStructure = {
      palette: [],
      ops: [{ op: 'block', pos: [1, 1, 1], state: 1 }],
      blocks: [{ pos: [2, 1, 2], state: 1 }],
    };
    const out = mergePatch(prev, patch);
    expect(out.ops).toHaveLength(2);
    expect(out.ops?.[1]).toEqual({ op: 'block', pos: [1, 1, 1], state: 1 });
    expect(out.blocks).toHaveLength(2);
  });

  it('dedupes a re-sent palette entry and remaps the patch indices onto the existing one', () => {
    // Models routinely re-send entries the base already has. Entry 0 of the patch
    // duplicates prev[1] (oak_planks); the patch addresses it as prev.length + 0 = 2.
    // It must intern back onto index 1, never append a shifted duplicate.
    const patch: AuthoringStructure = {
      palette: [{ Name: 'minecraft:oak_planks' }, { Name: 'minecraft:glass' }],
      ops: [
        { op: 'fill', from: [0, 1, 0], to: [9, 1, 5], state: 2 },              // the dup → 1
        { op: 'stairs', from: [0, 1, 0], to: [2, 3, 0], state: 3, fill: 2, clear: 0 }, // glass + dup + base air
      ],
      blocks: [{ pos: [0, 2, 0], state: 3 }],                                   // glass
    };
    const out = mergePatch(prev, patch);
    expect(out.palette).toEqual([
      { Name: 'minecraft:air' },
      { Name: 'minecraft:oak_planks' },
      { Name: 'minecraft:glass' },
    ]);
    expect((out.ops?.[1] as { state: number }).state).toBe(1);
    const stairsOp = out.ops?.[2] as { state: number; fill: number; clear: number };
    expect(stairsOp.state).toBe(2); // glass → its interned slot
    expect(stairsOp.fill).toBe(1);  // dup → the existing planks entry
    expect(stairsOp.clear).toBe(0); // a base-palette reference passes through
    expect(out.blocks?.[1].state).toBe(2);
  });

  it('inherits size / DataVersion / floors / entities when the patch omits them', () => {
    const out = mergePatch(prev, { palette: [], ops: [] });
    expect(out.size).toEqual([10, 8, 6]);
    expect(out.DataVersion).toBe(3955);
    expect(out.floors).toEqual(prev.floors);
    expect(out.entities).toEqual([]);
  });

  it('lets the patch restate size / DataVersion / floors / entities', () => {
    const out = mergePatch(prev, {
      DataVersion: 4000,
      size: [12, 9, 7],
      palette: [],
      ops: [],
      floors: [{ role: 'basement', from: 0, to: 3 }],
      entities: [{ pos: [1, 1, 1], blockPos: [1, 1, 1] }],
    });
    expect(out.size).toEqual([12, 9, 7]);
    expect(out.DataVersion).toBe(4000);
    expect(out.floors).toEqual([{ role: 'basement', from: 0, to: 3 }]);
    expect(out.entities).toHaveLength(1);
  });
});
