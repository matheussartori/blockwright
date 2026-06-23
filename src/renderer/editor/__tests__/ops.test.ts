import { describe, it, expect } from 'vitest';
import type { PaletteEntry, StructureBlock } from '@/shared/types';
import {
  buildStairs,
  cellKey,
  cuboidCells,
  deleteSelection,
  extrudeSelection,
  internEntry,
  mirrorCell,
  moveSelection,
  occupancy,
  placeBlock,
  planTransform,
  replaceSelection,
  selectBox,
  type EditData,
} from '../ops';

const entry = (name: string, air = false, properties: Record<string, string> = {}): PaletteEntry => ({
  name,
  properties,
  models: [],
  color: [0, 0, 0],
  air,
});
const block = (state: number, pos: [number, number, number]): StructureBlock => ({ state, pos });

/** A 2×1×1 wall of stone with an air palette entry at index 1. */
const data = (): EditData => ({
  size: [3, 3, 3],
  palette: [entry('minecraft:stone'), entry('minecraft:air', true)],
  blocks: [block(0, [0, 0, 0]), block(0, [1, 0, 0])],
});

describe('cuboidCells', () => {
  it('lists every cell in the inclusive box regardless of corner order', () => {
    expect(cuboidCells([0, 0, 0], [1, 1, 0])).toEqual(['0,0,0', '0,1,0', '1,0,0', '1,1,0']);
    expect(cuboidCells([1, 0, 0], [0, 0, 0])).toEqual(['0,0,0', '1,0,0']);
  });
});

describe('occupancy / selectBox', () => {
  it('maps only non-air cells', () => {
    const d = data();
    d.blocks.push(block(1, [2, 0, 0])); // an air block — not selectable
    const occ = occupancy(d);
    expect([...occ.keys()].sort()).toEqual(['0,0,0', '1,0,0']);
  });
  it('box-select keeps only occupied cells in the cuboid', () => {
    expect(selectBox(data(), [0, 0, 0], [2, 0, 0]).sort()).toEqual(['0,0,0', '1,0,0']);
  });
});

describe('moveSelection', () => {
  it('shifts selected blocks and vacates the originals', () => {
    const r = moveSelection(data(), ['0,0,0', '1,0,0'], [0, 1, 0]);
    expect(r.blocks.map((b) => cellKey(b.pos)).sort()).toEqual(['0,1,0', '1,1,0']);
    expect(r.selection.sort()).toEqual(['0,1,0', '1,1,0']);
  });
  it('overwrites a non-selected block sitting in a target cell', () => {
    const d = data();
    d.blocks.push(block(0, [0, 1, 0])); // will be overwritten by the move up
    const r = moveSelection(d, ['0,0,0'], [0, 1, 0]);
    expect(r.blocks.filter((b) => cellKey(b.pos) === '0,1,0')).toHaveLength(1);
  });
});

describe('extrudeSelection', () => {
  it('raises a footprint into a wall (duplicates upward)', () => {
    const r = extrudeSelection(data(), ['0,0,0', '1,0,0'], 'y', 2);
    const keys = r.blocks.map((b) => cellKey(b.pos)).sort();
    expect(keys).toEqual(['0,0,0', '0,1,0', '0,2,0', '1,0,0', '1,1,0', '1,2,0']);
    expect(r.selection.sort()).toEqual(['0,0,0', '1,0,0']); // selection unchanged
  });
  it('extrudes in the negative direction for a negative count', () => {
    const r = extrudeSelection(data(), ['0,0,0'], 'x', -1);
    expect(r.blocks.some((b) => cellKey(b.pos) === '-1,0,0')).toBe(true);
  });
  it('makes a spaced array when step > 1 (gaps between copies)', () => {
    const r = extrudeSelection(data(), ['0,0,0'], 'y', 2, 3); // 2 copies, 3 cells apart
    const ys = r.blocks.filter((b) => b.pos[0] === 0).map((b) => b.pos[1]).sort((a, b) => a - b);
    expect(ys).toEqual([0, 3, 6]); // original + two copies at +3, +6
  });
});

describe('deleteSelection', () => {
  it('removes the selected blocks and clears the selection', () => {
    const r = deleteSelection(data(), ['0,0,0']);
    expect(r.blocks.map((b) => cellKey(b.pos))).toEqual(['1,0,0']);
    expect(r.selection).toEqual([]);
  });
});

describe('replaceSelection / internEntry', () => {
  it('interns the entry once and reuses it', () => {
    const p = [entry('minecraft:stone')];
    const a = internEntry(p, entry('minecraft:oak_planks'));
    expect(a.index).toBe(1);
    const b = internEntry(a.palette, entry('minecraft:oak_planks'));
    expect(b.index).toBe(1);
    expect(b.palette).toHaveLength(2);
  });
  it('swaps selected blocks to the new entry', () => {
    const r = replaceSelection(data(), ['0,0,0'], entry('minecraft:oak_planks'));
    const planks = r.palette.findIndex((p) => p.name === 'minecraft:oak_planks');
    expect(r.blocks.find((b) => cellKey(b.pos) === '0,0,0')?.state).toBe(planks);
    expect(r.blocks.find((b) => cellKey(b.pos) === '1,0,0')?.state).toBe(0); // untouched
  });
});

describe('planTransform', () => {
  const stairs = (facing: string): EditData => ({
    size: [3, 1, 3],
    palette: [entry('minecraft:oak_stairs', false, { facing })],
    blocks: [block(0, [0, 0, 0]), block(0, [1, 0, 0]), block(0, [2, 0, 0])],
  });

  it('mirrors across X and flips facing east↔west', () => {
    const out = planTransform(stairs('east'), ['0,0,0', '2,0,0'], { kind: 'mirror', axis: 'x' });
    const facingByPos = new Map(out.map((p) => [cellKey(p.pos), p.props.facing]));
    expect(facingByPos.get('2,0,0')).toBe('west'); // (0,0,0) reflected to x=2
    expect(facingByPos.get('0,0,0')).toBe('west'); // (2,0,0) reflected to x=0
  });

  it('rotates 90° CW about the centre and turns facing east→south', () => {
    const out = planTransform(stairs('east'), ['0,0,0', '1,0,0', '2,0,0'], { kind: 'rotate', turns: 1 });
    expect(out.map((p) => cellKey(p.pos)).sort()).toEqual(['1,0,-1', '1,0,0', '1,0,1']); // X-line → Z-line
    expect(out[0].props.facing).toBe('south');
  });
});

describe('mirrorCell', () => {
  it('reflects a cell across the structure centre on X / Z', () => {
    expect(mirrorCell([0, 0, 0], 'x', [5, 1, 5])).toEqual([4, 0, 0]);
    expect(mirrorCell([0, 0, 1], 'z', [5, 1, 7])).toEqual([0, 0, 5]);
    expect(mirrorCell([1, 2, 3], 'z', [5, 9, 7])).toEqual([1, 2, 3]); // on the centre plane → unchanged
  });
});

describe('placeBlock', () => {
  it('adds (or overwrites) a block at the cell and selects it', () => {
    const r = placeBlock(data(), [2, 0, 0], entry('minecraft:glass'));
    expect(r.blocks.find((b) => cellKey(b.pos) === '2,0,0')?.state).toBe(r.palette.findIndex((p) => p.name === 'minecraft:glass'));
    expect(r.selection).toEqual(['2,0,0']);
  });
});

describe('buildStairs', () => {
  it('places an ascending run, one up + one along per step', () => {
    const r = buildStairs(data(), [0, 0, 1], [1, 0, 0], 3, entry('minecraft:oak_stairs', false, { facing: 'east' }));
    const stairIdx = r.palette.findIndex((p) => p.name === 'minecraft:oak_stairs');
    const placed = r.blocks.filter((b) => b.state === stairIdx).map((b) => cellKey(b.pos));
    expect(placed).toEqual(['0,0,1', '1,1,1', '2,2,1']);
  });
});
