// Pure block-editing operations over a structure's {size, palette, blocks}. Each op
// returns the rewritten blocks/palette plus the resulting selection — no Three.js, no
// store, no IO — so the geometry rules are unit-tested in isolation. Orientation is
// preserved for free on move/extrude/stairs because we only ever copy a block's palette
// `state` (its blockstate), never re-derive it — the bug WorldEdit never fully fixed.
import type { PaletteEntry, StructureBlock } from '@/shared/types';

export type Cell = [number, number, number];
export type Axis = 'x' | 'y' | 'z';
const AXIS: Record<Axis, 0 | 1 | 2> = { x: 0, y: 1, z: 2 };

/** The four horizontal build directions, as a unit step + the matching stair `facing`. */
export const HORIZONTALS = {
  north: { step: [0, 0, -1] as Cell, facing: 'north' },
  south: { step: [0, 0, 1] as Cell, facing: 'south' },
  east: { step: [1, 0, 0] as Cell, facing: 'east' },
  west: { step: [-1, 0, 0] as Cell, facing: 'west' },
} as const;
export type Horizontal = keyof typeof HORIZONTALS;

export const cellKey = (p: readonly number[]): string => `${p[0]},${p[1]},${p[2]}`;
export const parseCell = (k: string): Cell => {
  const [x, y, z] = k.split(',').map(Number);
  return [x, y, z];
};

/** The mutable slice of a structure an op rewrites. */
export interface EditData {
  size: [number, number, number];
  palette: PaletteEntry[];
  blocks: StructureBlock[];
}

/** What an op produces: the new blocks/palette + the selection to keep highlighted. */
export interface OpResult {
  blocks: StructureBlock[];
  palette: PaletteEntry[];
  selection: string[];
}

/** Every integer cell key in the inclusive box between `a` and `b`. */
export function cuboidCells(a: Cell, b: Cell): string[] {
  const out: string[] = [];
  for (let x = Math.min(a[0], b[0]); x <= Math.max(a[0], b[0]); x++)
    for (let y = Math.min(a[1], b[1]); y <= Math.max(a[1], b[1]); y++)
      for (let z = Math.min(a[2], b[2]); z <= Math.max(a[2], b[2]); z++) out.push(`${x},${y},${z}`);
  return out;
}

/** Map of occupied (non-air) cell → index in blocks[]; the selectable set. */
export function occupancy(d: EditData): Map<string, number> {
  const m = new Map<string, number>();
  d.blocks.forEach((b, i) => {
    if (!d.palette[b.state]?.air) m.set(cellKey(b.pos), i);
  });
  return m;
}

/** Box-select: the cells of the cuboid that actually hold a block. */
export function selectBox(d: EditData, a: Cell, b: Cell): string[] {
  const occ = occupancy(d);
  return cuboidCells(a, b).filter((k) => occ.has(k));
}

/** Find an existing palette entry for a block (name + properties), or append it. */
export function internEntry(palette: PaletteEntry[], entry: PaletteEntry): { palette: PaletteEntry[]; index: number } {
  const propsKey = JSON.stringify(entry.properties ?? {});
  const i = palette.findIndex((p) => p.name === entry.name && JSON.stringify(p.properties ?? {}) === propsKey);
  if (i >= 0) return { palette, index: i };
  return { palette: [...palette, entry], index: palette.length };
}

const offset = (p: readonly number[], d: Cell): Cell => [p[0] + d[0], p[1] + d[1], p[2] + d[2]];

/** Translate the selected blocks by `delta`, overwriting whatever sat in the target
 *  cells and leaving the vacated cells empty. The selection follows the blocks. */
export function moveSelection(d: EditData, selection: string[], delta: Cell): OpResult {
  const sel = new Set(selection);
  const occ = occupancy(d);
  const moving = selection.map((k) => occ.get(k)).filter((i): i is number => i != null).map((i) => d.blocks[i]);
  const targets = new Set(moving.map((b) => cellKey(offset(b.pos, delta))));
  const kept = d.blocks.filter((b) => !sel.has(cellKey(b.pos)) && !targets.has(cellKey(b.pos)));
  const moved = moving.map((b) => ({ state: b.state, pos: offset(b.pos, delta) }));
  return { blocks: [...kept, ...moved], palette: d.palette, selection: moved.map((b) => cellKey(b.pos)) };
}

/** Duplicate the selected blocks `count` cells along an axis (sign = direction),
 *  overwriting the target cells — raise walls from a footprint, stack columns up. The
 *  original selection stays highlighted so you can extrude again. */
export function extrudeSelection(d: EditData, selection: string[], axis: Axis, count: number): OpResult {
  const ai = AXIS[axis];
  const dir = Math.sign(count) || 1;
  const steps = Math.abs(count);
  const occ = occupancy(d);
  const seeds = selection.map((k) => occ.get(k)).filter((i): i is number => i != null).map((i) => d.blocks[i]);
  const added: StructureBlock[] = [];
  const targets = new Set<string>();
  for (let n = 1; n <= steps; n++)
    for (const b of seeds) {
      const pos = [...b.pos] as Cell;
      pos[ai] += n * dir;
      added.push({ state: b.state, pos });
      targets.add(cellKey(pos));
    }
  const kept = d.blocks.filter((b) => !targets.has(cellKey(b.pos)));
  return { blocks: [...kept, ...added], palette: d.palette, selection };
}

/** Remove the selected blocks (carve them away). Clears the selection. */
export function deleteSelection(d: EditData, selection: string[]): OpResult {
  const sel = new Set(selection);
  return { blocks: d.blocks.filter((b) => !sel.has(cellKey(b.pos))), palette: d.palette, selection: [] };
}

/** Swap the selected (non-air) blocks for `entry`, interning it once. */
export function replaceSelection(d: EditData, selection: string[], entry: PaletteEntry): OpResult {
  const { palette, index } = internEntry(d.palette, entry);
  const sel = new Set(selection);
  const blocks = d.blocks.map((b) =>
    sel.has(cellKey(b.pos)) && !d.palette[b.state]?.air ? { state: index, pos: b.pos } : b,
  );
  return { blocks, palette, selection };
}

/** A straight stair run: from `start`, step `dir` horizontally and +1 up each block,
 *  for `steps` blocks. Every step uses the same pre-faced `entry` (resolved with the
 *  ascent `facing`), so the run reads correctly — no per-block orientation to get wrong. */
export function buildStairs(d: EditData, start: Cell, dir: Cell, steps: number, entry: PaletteEntry): OpResult {
  const { palette, index } = internEntry(d.palette, entry);
  const added: StructureBlock[] = [];
  const targets = new Set<string>();
  for (let n = 0; n < steps; n++) {
    const pos: Cell = [start[0] + dir[0] * n, start[1] + n, start[2] + dir[2] * n];
    added.push({ state: index, pos });
    targets.add(cellKey(pos));
  }
  const kept = d.blocks.filter((b) => !targets.has(cellKey(b.pos)));
  return { blocks: [...kept, ...added], palette, selection: added.map((b) => cellKey(b.pos)) };
}
