// Seeded footprint shapes — the antidote to the "every basement is a square box"
// mode collapse. Instead of asking the model to invent a non-rectangular plan
// (which it rarely does), a template carves a varied footprint out of its box
// deterministically from a seed: an L, a T, a U, a plus, or a plain rectangle.
// Pure (box + shape + seed) → a column mask the template builds over.
import { mulberry32 } from './rng';

export type FootprintShape = 'rect' | 'l' | 't' | 'u' | 'plus' | 'auto';

/** Every concrete (non-`auto`) shape — the valid set for an explicit `shape` param. */
export const FOOTPRINT_SHAPES: Exclude<FootprintShape, 'auto'>[] = ['rect', 'l', 't', 'u', 'plus'];

/** The pool `auto` draws from. `plus` is intentionally excluded — a plus/cross
 *  footprint reads as odd/unrealistic for a room, so it's available only when the
 *  caller asks for it explicitly (`shape: 'plus'`). */
export const AUTO_SHAPES: Exclude<FootprintShape, 'auto'>[] = ['rect', 'l', 't', 'u'];

export function isFootprintShape(v: unknown): v is FootprintShape {
  return v === 'auto' || (typeof v === 'string' && (FOOTPRINT_SHAPES as string[]).includes(v));
}

export interface FootprintBox {
  x0: number; z0: number; x1: number; z1: number;
}

export interface Footprint {
  /** The resolved shape (never `auto`). */
  shape: Exclude<FootprintShape, 'auto'>;
  /** Is this (x,z) column inside the footprint? */
  has(x: number, z: number): boolean;
  /** A footprint column on the perimeter (an orthogonal neighbour is outside) —
   *  i.e. a column that should carry a wall. */
  isEdge(x: number, z: number): boolean;
  /** Every (x,z) column inside the footprint. */
  columns(): Array<[number, number]>;
}

const key = (x: number, z: number): string => `${x},${z}`;
const inRect = (x: number, z: number, ax: number, az: number, bx: number, bz: number): boolean =>
  x >= ax && x <= bx && z >= az && z <= bz;

/** A predicate marking which columns are CARVED OUT of the box for a given shape. */
function removalTest(
  shape: Exclude<FootprintShape, 'rect'>,
  box: FootprintBox,
  cx: number,
  cz: number,
  turn: number,
): (x: number, z: number) => boolean {
  const { x0, z0, x1, z1 } = box;
  const t = ((turn % 4) + 4) % 4;
  if (shape === 'l') {
    // Remove one corner quadrant.
    const corners: [number, number, number, number][] = [
      [x0, z0, x0 + cx - 1, z0 + cz - 1],          // NW
      [x1 - cx + 1, z0, x1, z0 + cz - 1],          // NE
      [x0, z1 - cz + 1, x0 + cx - 1, z1],          // SW
      [x1 - cx + 1, z1 - cz + 1, x1, z1],          // SE
    ];
    const c = corners[t];
    return (x, z) => inRect(x, z, c[0], c[1], c[2], c[3]);
  }
  if (shape === 't') {
    // Remove two adjacent corners → a bar on one side with a central stem.
    const pairs: [number, number, number, number][][] = [
      [[x0, z1 - cz + 1, x0 + cx - 1, z1], [x1 - cx + 1, z1 - cz + 1, x1, z1]], // bar north
      [[x0, z0, x0 + cx - 1, z0 + cz - 1], [x1 - cx + 1, z0, x1, z0 + cz - 1]], // bar south
      [[x1 - cx + 1, z0, x1, z0 + cz - 1], [x1 - cx + 1, z1 - cz + 1, x1, z1]], // bar west
      [[x0, z0, x0 + cx - 1, z0 + cz - 1], [x0, z1 - cz + 1, x0 + cx - 1, z1]], // bar east
    ];
    const [a, b] = pairs[t];
    return (x, z) => inRect(x, z, ...a) || inRect(x, z, ...b);
  }
  if (shape === 'u') {
    // A central notch cut inward from one edge (never reaching the far edge).
    const notches: [number, number, number, number][] = [
      [x0 + cx, z1 - cz + 1, x1 - cx, z1],         // opening south
      [x0 + cx, z0, x1 - cx, z0 + cz - 1],         // opening north
      [x1 - cx + 1, z0 + cz, x1, z1 - cz],         // opening east
      [x0, z0 + cz, x0 + cx - 1, z1 - cz],         // opening west
    ];
    const n = notches[t];
    return (x, z) => inRect(x, z, n[0], n[1], n[2], n[3]);
  }
  // plus: keep a central cross — remove anything outside both bars.
  const vx0 = x0 + cx, vx1 = x1 - cx; // vertical bar x-range
  const hz0 = z0 + cz, hz1 = z1 - cz; // horizontal bar z-range
  return (x, z) => !((x >= vx0 && x <= vx1) || (z >= hz0 && z <= hz1));
}

export function makeFootprint(box: FootprintBox, shape: FootprintShape, seed: number): Footprint {
  const { x0, z0, x1, z1 } = box;
  const W = x1 - x0 + 1, D = z1 - z0 + 1;
  const rnd = mulberry32(seed >>> 0);

  let chosen: Exclude<FootprintShape, 'auto'> =
    shape === 'auto' ? AUTO_SHAPES[Math.floor(rnd() * AUTO_SHAPES.length)] : shape;
  // Too small to carve a believable shape without slivering — keep it a rectangle.
  if (W < 5 || D < 5) chosen = 'rect';

  const inside = new Set<string>();
  if (chosen === 'rect') {
    for (let x = x0; x <= x1; x++) for (let z = z0; z <= z1; z++) inside.add(key(x, z));
  } else {
    // Cut 30–45% of each dimension, seeded; bounded so the room stays connected.
    const cut = (n: number): number => Math.max(1, Math.min(n - 2, Math.round(n * (0.3 + rnd() * 0.15))));
    const removed = removalTest(chosen, box, cut(W), cut(D), Math.floor(rnd() * 4));
    for (let x = x0; x <= x1; x++) {
      for (let z = z0; z <= z1; z++) if (!removed(x, z)) inside.add(key(x, z));
    }
    // Never let a degenerate cut empty the footprint.
    if (inside.size === 0) {
      for (let x = x0; x <= x1; x++) for (let z = z0; z <= z1; z++) inside.add(key(x, z));
    }
  }

  const has = (x: number, z: number): boolean => inside.has(key(x, z));
  return {
    shape: chosen,
    has,
    isEdge: (x, z) => has(x, z) && (!has(x - 1, z) || !has(x + 1, z) || !has(x, z - 1) || !has(x, z + 1)),
    columns: () => [...inside].map((k) => k.split(',').map(Number) as [number, number]),
  };
}
