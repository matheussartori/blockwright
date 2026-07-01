// Circulation HINTS: the model's own flights/ladders tell us WHERE it wanted to
// climb. This module walks those attempts, attributes each to the storey-gap it
// serves, and carries the small shared helpers (gapFor / ascentFacing / the
// unserved-climb detector behind the silent-bail warning).
import { posKey } from '../../geometry';
import { bareId } from '../../palette';
import { findFlights } from '../flights';
import type { AuthoringBlock, AuthoringPaletteEntry } from '../../types';

interface LadderRun { cells: AuthoringBlock[]; }

/** Walk every vertical ladder column (a stack of `ladder` cells), bottom-up. */
export function findLadderRuns(blocks: AuthoringBlock[], palette: AuthoringPaletteEntry[]): LadderRun[] {
  const isLadder = (s: number): boolean => bareId(palette[s]?.Name ?? '') === 'ladder';
  const at = new Map<string, AuthoringBlock>();
  for (const b of blocks) at.set(posKey(...b.pos), b);
  const ladderAt = (x: number, y: number, z: number): boolean => {
    const b = at.get(posKey(x, y, z));
    return !!b && isLadder(b.state);
  };
  const runs: LadderRun[] = [];
  for (const b of blocks) {
    if (!isLadder(b.state)) continue;
    const [x, y, z] = b.pos;
    if (ladderAt(x, y - 1, z)) continue; // only start from the bottom rung
    const cells: AuthoringBlock[] = [];
    for (let yy = y; ladderAt(x, yy, z); yy++) cells.push(at.get(posKey(x, yy, z)) as AuthoringBlock);
    runs.push({ cells });
  }
  return runs;
}

/** The floor plane at or just below `y` (the storey a connector starts on), and the
 *  next plane above it. Returns null when there's no storey above to climb to. */
export function gapFor(planes: number[], y: number): { lowerY: number; upperY: number } | null {
  let lowerY = -Infinity;
  for (const p of planes) if (p <= y && p > lowerY) lowerY = p;
  if (lowerY === -Infinity) return null;
  const upperY = planes.find((p) => p > lowerY);
  if (upperY === undefined) return null;
  return { lowerY, upperY };
}

export interface Hint {
  /** Footprint column the model anchored the climb at. */
  x: number; z: number;
  /** Ascent unit for a stair hint (undefined for a ladder). */
  dir?: [number, number];
  /** Stair palette state to reuse the material (undefined for a ladder). */
  stairState?: number;
  /** How many cells the hint climbed — used to rank hints per gap. */
  rise: number;
}

/** Split one continuous climb across every storey gap it rises through. A single
 *  ladder from the cellar to the attic serves SEVERAL gaps, and each gap must get
 *  its own hint + strip segment — attributing the whole run to its bottom gap let
 *  the cellar rebuild strip the run wholesale and DELETE the upper floors' only
 *  climb (the "no stairs between floor 1 and 2" defect on tall builds). Cells
 *  below the lowest plane fold into the first gap; cells above the top plane are
 *  dropped (roof decor, never storey circulation). */
export function segmentByGap<T extends { pos: [number, number, number] }>(
  cells: T[], planes: number[],
): { gap: { lowerY: number; upperY: number }; cells: T[] }[] {
  const segs = new Map<number, { gap: { lowerY: number; upperY: number }; cells: T[] }>();
  for (const c of cells) {
    const gap = gapFor(planes, Math.max(c.pos[1] - 1, planes[0]));
    if (!gap) continue;
    const s = segs.get(gap.lowerY) ?? { gap, cells: [] };
    s.cells.push(c);
    segs.set(gap.lowerY, s);
  }
  return [...segs.values()];
}

/** Whether the build carries a climb that LOOKS like real storey circulation — a ladder
 *  rising ≥3, or a NARROW stair flight rising ≥3 (≤3 parallel rows; a roof slope is a
 *  WIDE bank of parallel same-facing chains, a staircase is 1–3 wide). Used only for the
 *  silent-bail warning, so the ceiling-plane roof exclusion (which depends on the very
 *  plane detection that failed) is deliberately bypassed. */
export function hasUnservedClimb(blocks: AuthoringBlock[], palette: AuthoringPaletteEntry[]): boolean {
  if (findLadderRuns(blocks, palette).some((r) => r.cells.length >= 4)) return true;
  // Group climbing chains by (facing, bottom y, bottom along-axis coord): the parallel
  // rows of one slope/flight land in the same group, so the group size is its width.
  const widths = new Map<string, number>();
  for (const f of findFlights(blocks, palette, { ignoreCeiling: true })) {
    const rise = f.chain[f.chain.length - 1].pos[1] - f.chain[0].pos[1];
    if (rise < 3) continue;
    const [x, y, z] = f.chain[0].pos;
    const along = f.dir[0] !== 0 ? x : z;
    const key = `${f.facing}|${y}|${along}`;
    widths.set(key, (widths.get(key) ?? 0) + 1);
  }
  return [...widths.values()].some((w) => w <= 3);
}

/** The `facing` a stair ascends toward, from its ascent unit (dx,dz). */
export function ascentFacing(fx: number, fz: number): string {
  if (fx > 0) return 'east';
  if (fx < 0) return 'west';
  if (fz > 0) return 'south';
  return 'north';
}
