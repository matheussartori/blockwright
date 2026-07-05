import { describe, expect, it } from 'vitest';
import type { PaletteEntry, StructureBlock } from '@/shared/types';
import { diffStructures, type DiffInput } from '../diff';

const entry = (name: string, properties: Record<string, string> = {}, air = false): PaletteEntry => ({
  name,
  properties,
  models: [],
  color: [0, 0, 0],
  air,
});
const block = (state: number, pos: [number, number, number]): StructureBlock => ({ state, pos });

const struct = (palette: PaletteEntry[], blocks: StructureBlock[], size: [number, number, number] = [4, 4, 4]): DiffInput => ({
  size,
  palette,
  blocks,
});

describe('diffStructures', () => {
  it('classifies added / removed / changed / same', () => {
    const a = struct(
      [entry('minecraft:stone'), entry('minecraft:dirt')],
      [block(0, [0, 0, 0]), block(0, [1, 0, 0]), block(1, [2, 0, 0])],
    );
    const b = struct(
      [entry('minecraft:stone'), entry('minecraft:oak_planks')],
      [block(0, [0, 0, 0]), block(1, [2, 0, 0]), block(0, [3, 0, 0])],
    );
    const d = diffStructures(a, b);
    expect(d.same).toBe(1); // stone at 0,0,0
    expect(d.removed).toBe(1); // stone at 1,0,0 gone
    expect(d.changed).toBe(1); // dirt → oak_planks at 2,0,0
    expect(d.added).toBe(1); // stone at 3,0,0 new
    const byKey = new Map(d.cells.map((c) => [c.key, c.kind]));
    expect(byKey.get('1,0,0')).toBe('removed');
    expect(byKey.get('2,0,0')).toBe('changed');
    expect(byKey.get('3,0,0')).toBe('added');
  });

  it('a blockstate-only difference is CHANGED (stairs that flipped facing)', () => {
    const a = struct([entry('minecraft:oak_stairs', { facing: 'east', half: 'bottom' })], [block(0, [0, 0, 0])]);
    const b = struct([entry('minecraft:oak_stairs', { facing: 'west', half: 'bottom' })], [block(0, [0, 0, 0])]);
    const d = diffStructures(a, b);
    expect(d.changed).toBe(1);
    expect(d.same).toBe(0);
  });

  it('property ORDER never fakes a difference', () => {
    const a = struct([entry('minecraft:oak_stairs', { facing: 'east', half: 'top' })], [block(0, [0, 0, 0])]);
    const b = struct([entry('minecraft:oak_stairs', { half: 'top', facing: 'east' })], [block(0, [0, 0, 0])]);
    expect(diffStructures(a, b).same).toBe(1);
    expect(diffStructures(a, b).cells).toHaveLength(0);
  });

  it('air-like entries read as EMPTY on both sides (no fog of removed-air)', () => {
    const a = struct(
      [entry('minecraft:stone'), entry('minecraft:air', {}, true), entry('minecraft:structure_void', {}, true)],
      [block(0, [0, 0, 0]), block(1, [1, 0, 0]), block(2, [2, 0, 0])],
    );
    const b = struct([entry('minecraft:stone')], [block(0, [0, 0, 0])]);
    const d = diffStructures(a, b);
    expect(d.cells).toHaveLength(0); // air/void ≠ geometry
    expect(d.same).toBe(1);
  });

  it('applies the anchor offset to B', () => {
    const a = struct([entry('minecraft:stone')], [block(0, [5, 0, 5])]);
    const b = struct([entry('minecraft:stone')], [block(0, [0, 0, 0])]);
    const misaligned = diffStructures(a, b);
    expect(misaligned.added + misaligned.removed).toBe(2);
    const aligned = diffStructures(a, b, [5, 0, 5]);
    expect(aligned.same).toBe(1);
    expect(aligned.cells).toHaveLength(0);
  });

  it('rolls differences up by block name, biggest movers first', () => {
    const a = struct(
      [entry('minecraft:stone'), entry('minecraft:dirt')],
      [block(0, [0, 0, 0]), block(0, [1, 0, 0]), block(1, [2, 0, 0])],
    );
    const b = struct([entry('minecraft:glass')], [block(0, [2, 0, 0])]);
    const d = diffStructures(a, b);
    // stone: 2 removed; glass: 1 changed-to; dirt: nothing (it became glass).
    expect(d.byBlock[0]).toEqual({ name: 'minecraft:stone', added: 0, removed: 2, changed: 0 });
    expect(d.byBlock[1]).toEqual({ name: 'minecraft:glass', added: 0, removed: 0, changed: 1 });
  });

  it('handles different sizes (cells outside a box are just empty there)', () => {
    const a = struct([entry('minecraft:stone')], [block(0, [0, 0, 0])], [1, 1, 1]);
    const b = struct([entry('minecraft:stone')], [block(0, [0, 0, 0]), block(0, [7, 7, 7])], [8, 8, 8]);
    const d = diffStructures(a, b);
    expect(d.same).toBe(1);
    expect(d.added).toBe(1);
  });
});
