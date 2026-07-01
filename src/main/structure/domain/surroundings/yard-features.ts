// Shared yard SCAFFOLD parts for the surroundings modules that wrap a house in a seeded,
// chamfered plot (garden + graveyard — modern predates this scaffold and keeps its own
// terrace style, deliberately untouched): the rect helpers, the occupancy tracker +
// seeded-outline scaffold every yard `build()` opens with, and the feature builders both
// yards lay (the lamp post, the trees), parameterized where the yards differ.
import type { AuthoringOp } from '../../authoring/types';
import type { SurroundMargins } from '@/shared/domain/surroundings';
import type { Box } from '../structure-types/types';
import { mulberry32 } from '../rng';
import { inCut, seededChamfers, type Chamfers } from './outline';

/** An axis-aligned horizontal region of the yard (inclusive). */
export interface Rect { x0: number; x1: number; z0: number; z1: number }

/** Whether `r` is at least `w`×`d` cells. */
export const fitsRect = (r: Rect, w: number, d: number): boolean => r.x1 - r.x0 + 1 >= w && r.z1 - r.z0 + 1 >= d;
/** The centre x of `r` (floored). */
export const midX = (r: Rect): number => Math.floor((r.x0 + r.x1) / 2);
/** The centre z of `r` (floored). */
export const midZ = (r: Rect): number => Math.floor((r.z0 + r.z1) / 2);

/** The scaffold every yard `build()` opens with: `mark`/`free` track the cells that
 *  paths/features have claimed (so beds and scatter never overlap them), `rnd` is the
 *  yard's seeded PRNG, and `ch`/`cut` are the seeded corner chamfers (drawn from `rnd`
 *  FIRST, before any other draw — determinism depends on that order) plus the
 *  outside-the-outline test the lawn/rim clip to. */
export interface YardScaffold {
  mark: (x: number, z: number) => void;
  free: (x: number, z: number) => boolean;
  rnd: () => number;
  ch: Chamfers;
  cut: (x: number, z: number) => boolean;
}

/**
 * Build the {@link YardScaffold} for a yard module's box.
 *
 * @param b - The full build box the ring wraps.
 * @param m - The ring's resolved margins (the chamfers must stay inside them).
 * @param seed - The build seed (the scaffold owns the yard's PRNG).
 * @param cutMin - The smallest corner cut (see `seededChamfers`).
 * @param cutCap - The largest cut this yard's furniture layout tolerates.
 * @returns The occupancy tracker + PRNG + chamfered-outline helpers.
 */
export function yardScaffold(b: Box, m: SurroundMargins, seed: number, cutMin: number, cutCap: number): YardScaffold {
  const used = new Set<string>();
  const mark = (x: number, z: number): void => { used.add(`${x},${z}`); };
  const free = (x: number, z: number): boolean => !used.has(`${x},${z}`);
  const rnd = mulberry32(seed);
  const ch = seededChamfers(rnd, m, cutMin, cutCap);
  const cut = (x: number, z: number): boolean => inCut(b, ch, x, z);
  return { mark, free, rnd, ch, cut };
}

/** A yard lamp post at (x, z): a `post` column rising `height` cells off the ground layer
 *  `gy`, carrying a lantern on top — the garden's stone-brick piers and the graveyard's
 *  soul-lit posts are the same shape. `clampY` (default identity) keeps a tall yard's
 *  features inside the box (the graveyard's rule). */
export function lampPost(
  x: number,
  z: number,
  gy: number,
  height: number,
  post: number,
  lantern: number,
  clampY: (y: number) => number = (y) => y,
): AuthoringOp[] {
  return [
    { op: 'fill', from: [x, gy + 1, z], to: [x, clampY(gy + height), z], state: post },
    { op: 'block', pos: [x, clampY(gy + height + 1), z], state: lantern },
  ];
}

/** Everything the shared tree builders need from the calling yard. */
export interface TreeCtx {
  /** The ground layer y. */
  gy: number;
  /** The box top (`b.y1`) — trunk/canopy heights clamp to it. */
  yTop: number;
  /** The yard's seeded PRNG (call order is determinism-critical). */
  rnd: () => number;
  /** Claim a cell in the yard's occupancy tracker. */
  mark: (x: number, z: number) => void;
  /** Keep a feature cell inside the box. */
  clampY: (y: number) => number;
  /** The trunk block (an upright log). */
  trunk: number;
  /** The (persistent) leaf block. */
  leaf: number;
}

/** A great weeping tree at (tx, tz): an oak trunk, a broad canopy, and trailing leaf
 *  strands hanging from the rim — a yard's focal point. Marks a 5×5 footprint; a no-op
 *  when the box is too short for a real crown. */
export function weepingTree(ctx: TreeCtx, tx: number, tz: number): AuthoringOp[] {
  const { gy, yTop, rnd, mark, clampY, trunk, leaf } = ctx;
  const ops: AuthoringOp[] = [];
  const th = Math.min(5, yTop - gy - 1);
  if (th < 3) return ops;
  const topY = gy + th;
  ops.push({ op: 'fill', from: [tx, gy + 1, tz], to: [tx, topY, tz], state: trunk });
  // canopy: a 5×5 ring just under the crown, plus a 3×3 crown
  for (let dx = -2; dx <= 2; dx++) for (let dz = -2; dz <= 2; dz++) {
    if (Math.abs(dx) === 2 && Math.abs(dz) === 2) continue; // round the corners
    ops.push({ op: 'block', pos: [tx + dx, topY, tz + dz], state: leaf });
  }
  for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) {
    ops.push({ op: 'block', pos: [tx + dx, clampY(topY + 1), tz + dz], state: leaf });
  }
  // weeping strands: leaves trailing down from the canopy rim
  for (const [wx, wz] of [[-2, 0], [2, 0], [0, -2], [0, 2], [-2, -1], [2, 1], [-1, 2], [1, -2]] as [number, number][]) {
    const drop = 1 + Math.floor(rnd() * 3);
    for (let d = 1; d <= drop; d++) ops.push({ op: 'block', pos: [tx + wx, topY - d, tz + wz], state: leaf });
  }
  for (let dx = -2; dx <= 2; dx++) for (let dz = -2; dz <= 2; dz++) mark(tx + dx, tz + dz);
  return ops;
}

/** A bare dead tree at (tx, tz): a short leafless trunk of seeded height with the odd
 *  clinging leaf — gnarled growth that breaks up a lawn without a full tree's bulk.
 *  `canPlace` gates the trunk cell (free + inside the yard) BEFORE any PRNG draw, so a
 *  blocked cell consumes no randomness. */
export function deadTree(ctx: TreeCtx, tx: number, tz: number, canPlace: (x: number, z: number) => boolean): AuthoringOp[] {
  const { gy, yTop, rnd, mark, clampY, trunk, leaf } = ctx;
  const ops: AuthoringOp[] = [];
  if (!canPlace(tx, tz)) return ops;
  const th = Math.min(2 + Math.floor(rnd() * 3), yTop - gy - 1);
  if (th < 2) return ops;
  mark(tx, tz);
  ops.push({ op: 'fill', from: [tx, gy + 1, tz], to: [tx, clampY(gy + th), tz], state: trunk });
  if (rnd() < 0.6) ops.push({ op: 'block', pos: [tx, clampY(gy + th + 1), tz], state: leaf });
  if (rnd() < 0.4) ops.push({ op: 'block', pos: [tx, clampY(gy + th), tz], state: leaf });
  return ops;
}
