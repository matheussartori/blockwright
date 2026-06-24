// Pure block-editing operations over a structure's {size, palette, blocks}. Each op
// returns the rewritten blocks/palette plus the resulting selection — no Three.js, no
// store, no IO — so the geometry rules are unit-tested in isolation. Orientation is
// preserved for free on move/extrude/stairs because we only ever copy a block's palette
// `state` (its blockstate), never re-derive it — the bug WorldEdit never fully fixed.
import type { PaletteEntry, StructureBlock } from '@/shared/types';
import { transformProps, type PropXform } from '@/shared/structure/orientation';
import { cellKey, parseCell, type Cell } from './cell-key';

export type { PropXform };
export { cellKey, parseCell, type Cell };

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

/** Duplicate the selected blocks `count` times along an axis (sign = direction), each copy
 *  `step` cells further on, overwriting the target cells. `step` 1 = a contiguous run (raise
 *  walls / stack a column); `step` > 1 = a repeating array with gaps. The original selection
 *  stays highlighted so you can extrude again. */
export function extrudeSelection(d: EditData, selection: string[], axis: Axis, count: number, step = 1): OpResult {
  const ai = AXIS[axis];
  const dir = Math.sign(count) || 1;
  const copies = Math.abs(count);
  const span = Math.max(1, step);
  const occ = occupancy(d);
  const seeds = selection.map((k) => occ.get(k)).filter((i): i is number => i != null).map((i) => d.blocks[i]);
  const added: StructureBlock[] = [];
  const targets = new Set<string>();
  for (let n = 1; n <= copies; n++)
    for (const b of seeds) {
      const pos = [...b.pos] as Cell;
      pos[ai] += n * dir * span;
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

/** Where one block lands under a mirror/rotate, and the block it becomes. The block's
 *  PROPERTIES change (a stair flips its facing), so the caller resolves the new model. */
export interface Placement {
  pos: Cell;
  name: string;
  props: Record<string, string>;
}

const bbox = (cells: StructureBlock[]) => {
  const lo: Cell = [Infinity, Infinity, Infinity];
  const hi: Cell = [-Infinity, -Infinity, -Infinity];
  for (const b of cells)
    for (let i = 0; i < 3; i++) {
      lo[i] = Math.min(lo[i], b.pos[i]);
      hi[i] = Math.max(hi[i], b.pos[i]);
    }
  return { lo, hi };
};

/** Plan a mirror/rotate of the selection about its OWN centre (not a corner — the pivot
 *  Litematica gets wrong), rewriting each block's position AND its directional blockstate
 *  (facing/axis/shape/hinge/rotation) via the shared `transformProps`, so stairs/logs/doors
 *  stay physically consistent — the transform WorldEdit never fully fixed. */
export function planTransform(d: EditData, selection: string[], xform: PropXform): Placement[] {
  const occ = occupancy(d);
  const cells = selection.map((k) => occ.get(k)).filter((i): i is number => i != null).map((i) => d.blocks[i]);
  if (!cells.length) return [];
  const { lo, hi } = bbox(cells);
  const cx = (lo[0] + hi[0]) / 2;
  const cz = (lo[2] + hi[2]) / 2;
  const cwTurn = (p: Cell): Cell => [cx - (p[2] - cz), p[1], cz + (p[0] - cx)]; // one 90° CW about +Y

  const placePos = (p: Cell): Cell => {
    if (xform.kind === 'mirror') {
      return xform.axis === 'x' ? [lo[0] + hi[0] - p[0], p[1], p[2]] : [p[0], p[1], lo[2] + hi[2] - p[2]];
    }
    let q = p;
    for (let i = 0, n = (((xform.turns % 4) + 4) % 4); i < n; i++) q = cwTurn(q);
    return [Math.round(q[0]), q[1], Math.round(q[2])];
  };

  return cells.map((b) => {
    const entry = d.palette[b.state];
    return {
      pos: placePos([...b.pos] as Cell),
      name: entry.name,
      props: (transformProps(entry.properties, xform) ?? {}) as Record<string, string>,
    };
  });
}

/** Reflect a cell across the structure's centre plane on an axis (live symmetry). */
export function mirrorCell(cell: Cell, axis: 'x' | 'z', size: [number, number, number]): Cell {
  return axis === 'x' ? [size[0] - 1 - cell[0], cell[1], cell[2]] : [cell[0], cell[1], size[2] - 1 - cell[2]];
}

/** The six axis-aligned neighbours of a cell — the connectivity for flood fill. */
const NEIGHBORS: Cell[] = [
  [1, 0, 0], [-1, 0, 0],
  [0, 1, 0], [0, -1, 0],
  [0, 0, 1], [0, 0, -1],
];

/** A void cell to surface in the editor's "show voids" overlay: its key + which kind. */
export interface VoidMarker {
  key: string;
  kind: 'air' | 'void';
}

/** What a single cell currently holds — for the editor's hover readout, so air / structure
 *  void / empty / a named block can all be told apart on demand. */
export type CellContent =
  | { kind: 'empty' }
  | { kind: 'air' }
  | { kind: 'void' }
  | { kind: 'block'; name: string };

/** Identify what's in a cell (the cursor readout): a real block (by name), explicit `air`,
 *  `structure_void`, or an unset/`empty` cell. */
export function describeCell(d: EditData, cell: Cell): CellContent {
  const k = cellKey(cell);
  const b = d.blocks.find((x) => cellKey(x.pos) === k);
  const entry = b ? d.palette[b.state] : undefined;
  if (!entry) return { kind: 'empty' };
  if (entry.name === 'minecraft:structure_void') return { kind: 'void' };
  if (entry.air) return { kind: 'air' };
  return { kind: 'block', name: entry.name };
}

/** Above this many explicit `minecraft:air` cells, air is treated as BULK (a captured `.nbt`
 *  stores air for the whole empty volume — thousands of cells) and dropped from the overlay,
 *  so it can't bury the build in fog. Below it, air is sparse enough to be intentional. */
const AIR_OVERLAY_CAP = 256;

/** The air / "void" (terrain-preserving) cells to show in the overlay, matching Minecraft's
 *  "show invisible blocks" read: explicit `minecraft:air` is one thing (it CLEARS the cell on
 *  paste), and everything that PRESERVES terrain is "void" — both explicit `minecraft:structure_void`
 *  AND cells simply OMITTED from `blocks` (a structure block drops a structure_void region from the
 *  list, so the carved-out region survives only as omission — the case where a `.nbt` "has void" yet
 *  no void block exists). Three rules:
 *  - `structure_void` (explicit): ALWAYS shown — rare + intentional.
 *  - OMITTED cells (in a DENSE capture, i.e. the build lists its air so it fills most of its box →
 *    an omitted cell is an intentional carve-out, not the empty space around a sparse build): shown
 *    as `void`, boundary-only (their visible face), ALWAYS — this is the user's "void region".
 *  - `minecraft:air` (explicit): bulk (a captured `.nbt` stores it for the whole volume), the fog
 *    risk — shown only when sparse (≤ {@link AIR_OVERLAY_CAP}) or `revealAir` (the Void tool is
 *    active), and then boundary-only. */
export function voidMarkers(d: EditData, revealAir = false): VoidMarker[] {
  const solid = occupancy(d); // non-air cells
  const hasSolidNeighbor = (p: readonly number[]): boolean =>
    NEIGHBORS.some((n) => solid.has(cellKey([p[0] + n[0], p[1] + n[1], p[2] + n[2]])));
  const airCount = d.blocks.filter((b) => d.palette[b.state]?.name === 'minecraft:air').length;
  const showAir = revealAir || airCount <= AIR_OVERLAY_CAP;
  const out: VoidMarker[] = [];
  const present = new Set<string>();
  for (const b of d.blocks) {
    present.add(cellKey(b.pos));
    const entry = d.palette[b.state];
    if (!entry?.air) continue;
    if (entry.name === 'minecraft:structure_void') out.push({ key: cellKey(b.pos), kind: 'void' });
    else if (showAir && hasSolidNeighbor(b.pos)) out.push({ key: cellKey(b.pos), kind: 'air' });
  }
  // Omitted cells in a dense capture = an intentional terrain-preserving (structure_void) region.
  const [W, H, D] = d.size;
  const box = W * H * D;
  if (box > 0 && d.blocks.length / box > 0.5) {
    for (let x = 0; x < W; x++)
      for (let y = 0; y < H; y++)
        for (let z = 0; z < D; z++) {
          const k = `${x},${y},${z}`;
          if (!present.has(k) && hasSolidNeighbor([x, y, z])) out.push({ key: k, kind: 'void' });
        }
  }
  return out;
}

/** A PaletteEntry for an air-like block (`minecraft:air` / `minecraft:structure_void`).
 *  Air never renders, so it has no models and needs no content-pack round-trip — the
 *  editor can build it locally instead of resolving it over IPC. */
export function airEntry(name: string): PaletteEntry {
  return { name, properties: {}, models: [], color: [0, 0, 0], air: true };
}

/** Place several blocks in one edit (one undo step), interning each entry once and
 *  overwriting whatever sat in the target cells. The single primitive every "drop a
 *  block here" op is built on — `placeBlock` (one cell) and the symmetry-mirrored brush
 *  (two) both route through it, so the intern-and-overwrite logic lives in one place. */
export function placeCells(d: EditData, placements: { cell: Cell; entry: PaletteEntry }[]): OpResult {
  let palette = d.palette;
  const interned = placements.map((p) => {
    const r = internEntry(palette, p.entry);
    palette = r.palette;
    return { index: r.index, cell: p.cell };
  });
  const targets = new Set(interned.map((p) => cellKey(p.cell)));
  const kept = d.blocks.filter((b) => !targets.has(cellKey(b.pos)));
  return { blocks: [...kept, ...interned.map((p) => ({ state: p.index, pos: p.cell }))], palette, selection: [...targets] };
}

/** Add (or overwrite) a single block at a cell — the Paint brush's per-cell step. */
export function placeBlock(d: EditData, cell: Cell, entry: PaletteEntry): OpResult {
  return placeCells(d, [{ cell, entry }]);
}

/** Recolor the single block already at a cell (Paint's Recolor mode): swap it for `entry`
 *  in place, keeping its position. Returns null when the cell is empty or holds air —
 *  Recolor only repaints existing solid blocks, it never adds new ones. */
export function recolorCell(d: EditData, cell: Cell, entry: PaletteEntry): OpResult | null {
  const k = cellKey(cell);
  const existing = d.blocks.find((b) => cellKey(b.pos) === k);
  if (!existing || d.palette[existing.state]?.air) return null;
  const { palette, index } = internEntry(d.palette, entry);
  return { blocks: d.blocks.map((b) => (cellKey(b.pos) === k ? { state: index, pos: b.pos } : b)), palette, selection: [] };
}

/** Set a cell to explicit air or structure_void — the Void tool. This NEVER overwrites a solid
 *  block (it returns null so the caller skips the cell), so air/void editing can't destroy real
 *  geometry: `minecraft:air` CLEARS the cell when the structure is pasted, `minecraft:structure_void`
 *  LEAVES the world untouched. (There's no separate "clear to nothing": an omitted cell preserves
 *  terrain exactly like structure_void, so Void already IS that state — repaint with the other kind
 *  to switch, or paint a solid over it.) Returns null when a solid is in the way. */
export function setVoidCell(d: EditData, cell: Cell, kind: 'air' | 'void'): OpResult | null {
  const k = cellKey(cell);
  const existing = d.blocks.find((b) => cellKey(b.pos) === k);
  if (existing && !d.palette[existing.state]?.air) return null; // a real block — protect it
  const entry = airEntry(kind === 'air' ? 'minecraft:air' : 'minecraft:structure_void');
  const { palette, index } = internEntry(d.palette, entry);
  return { blocks: [...d.blocks.filter((b) => cellKey(b.pos) !== k), { state: index, pos: cell }], palette, selection: [] };
}

/** Flood-fill the connected region of blocks that share the clicked block's exact palette
 *  entry with `entry` (Paint's Fill / bucket): 6-connected over solid cells, bounded by a
 *  `cap` for safety on huge contiguous surfaces. Returns null when the start cell is empty.
 *  Pairs with Recolor (per-voxel) so the user has both the bucket and individual edits — the
 *  "fill should change individual voxels too" complaint cuts both ways. */
export function floodFill(d: EditData, start: Cell, entry: PaletteEntry, cap = 8192): OpResult | null {
  const occ = occupancy(d);
  const startIdx = occ.get(cellKey(start));
  if (startIdx == null) return null;
  const target = d.palette[d.blocks[startIdx].state];
  const targetProps = JSON.stringify(target.properties ?? {});
  const stateAt = new Map<string, number>();
  occ.forEach((i, key) => stateAt.set(key, d.blocks[i].state));
  const matches = (key: string): boolean => {
    const st = stateAt.get(key);
    if (st == null) return false;
    const e = d.palette[st];
    return e.name === target.name && JSON.stringify(e.properties ?? {}) === targetProps;
  };
  const region = new Set<string>();
  const queue: Cell[] = [start];
  while (queue.length && region.size < cap) {
    const c = queue.shift()!;
    const ck = cellKey(c);
    if (region.has(ck) || !matches(ck)) continue;
    region.add(ck);
    for (const n of NEIGHBORS) queue.push([c[0] + n[0], c[1] + n[1], c[2] + n[2]]);
  }
  if (!region.size) return null;
  const { palette, index } = internEntry(d.palette, entry);
  const blocks = d.blocks.map((b) => (region.has(cellKey(b.pos)) ? { state: index, pos: b.pos } : b));
  return { blocks, palette, selection: [...region] };
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
