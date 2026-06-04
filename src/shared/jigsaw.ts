// Pure jigsaw geometry + alignment. No IO and no Three.js, so it can run in the
// main process (assembly planning, overlap checks) and the renderer (placing the
// meshes) against the *same* rotation convention — which is what keeps the two
// in agreement. Quarter-turns are rotations about +Y matching Three.js's
// `Object3D.rotation.y = q * π/2`, so the renderer can set a group's rotation
// from `quarterTurns` and its position from `offset` and land exactly here.

import type { JigsawConnector } from './types';

export type Direction = 'down' | 'up' | 'north' | 'south' | 'east' | 'west';
export type QuarterTurns = 0 | 1 | 2 | 3;
export type Vec3 = [number, number, number];

const DIR_VEC: Record<Direction, Vec3> = {
  down: [0, -1, 0],
  up: [0, 1, 0],
  north: [0, 0, -1],
  south: [0, 0, 1],
  east: [1, 0, 0],
  west: [-1, 0, 0],
};

const OPPOSITE: Record<Direction, Direction> = {
  down: 'up',
  up: 'down',
  north: 'south',
  south: 'north',
  east: 'west',
  west: 'east',
};

const ALL_TURNS: QuarterTurns[] = [0, 1, 2, 3];

export function isHorizontal(dir: Direction): boolean {
  return dir !== 'up' && dir !== 'down';
}

export function oppositeDir(dir: Direction): Direction {
  return OPPOSITE[dir];
}

/** Rotate a point about +Y by `q` quarter-turns (Three.js positive convention:
 *  q=1 ⇒ (x,y,z) → (z,y,-x)). Y is untouched. */
export function rotatePointY(p: Vec3, q: QuarterTurns): Vec3 {
  const [x, y, z] = p;
  switch (q) {
    case 1: return [z, y, -x];
    case 2: return [-x, y, -z];
    case 3: return [-z, y, x];
    default: return [x, y, z];
  }
}

/** Rotate a direction by `q` quarter-turns (same convention as rotatePointY). */
export function rotateDirY(dir: Direction, q: QuarterTurns): Direction {
  const [x, y, z] = rotatePointY(DIR_VEC[dir], q);
  return vecToDir([x, y, z]);
}

function vecToDir(v: Vec3): Direction {
  for (const dir of Object.keys(DIR_VEC) as Direction[]) {
    const d = DIR_VEC[dir];
    if (d[0] === v[0] && d[1] === v[1] && d[2] === v[2]) return dir;
  }
  // Unreachable for axis-aligned unit vectors.
  throw new Error(`not an axis direction: ${v.join(',')}`);
}

/** The two parts of a jigsaw `orientation` ("south_up" → front "south", top "up"). */
export function parseOrientation(orientation: string): { front: Direction; top: Direction } {
  const [front, top] = orientation.split('_') as [Direction, Direction];
  return { front, top };
}

/** A piece's placement in the assembly: where its local origin lands (after
 *  rotation) and how many quarter-turns it is rotated about +Y. */
export interface Placement {
  offset: Vec3;
  quarterTurns: QuarterTurns;
}

const ROOT_PLACEMENT: Placement = { offset: [0, 0, 0], quarterTurns: 0 };

/** A fresh root placement — the identity transform (origin, no rotation) the first
 *  assembly piece sits at. Returns a copy so callers can mutate it safely. */
export function rootPlacement(): Placement {
  return { ...ROOT_PLACEMENT, offset: [...ROOT_PLACEMENT.offset] };
}

/** World-space center of a local block position under a placement. */
export function worldCenter(local: Vec3, placement: Placement): Vec3 {
  const c: Vec3 = [local[0] + 0.5, local[1] + 0.5, local[2] + 0.5];
  const r = rotatePointY(c, placement.quarterTurns);
  return [r[0] + placement.offset[0], r[1] + placement.offset[1], r[2] + placement.offset[2]];
}

/** World-facing direction of a connector under a placement. */
export function worldFront(connector: JigsawConnector, placement: Placement): Direction {
  const { front } = parseOrientation(connector.orientation);
  return rotateDirY(front, placement.quarterTurns);
}

/**
 * Work out how to attach `child` (a connector in a candidate piece) so it faces
 * the already-placed `source` connector. Returns the child piece's placement, or
 * null when the two can't connect with horizontal-only rotation (e.g. a vertical
 * front that doesn't already oppose the source).
 *
 * `pickTurn` chooses among equally-valid rotations (only the "rollable" vertical
 * case has more than one); it receives the candidate turns and returns one.
 */
export function solveAttachment(
  source: JigsawConnector,
  sourcePlacement: Placement,
  child: JigsawConnector,
  pickTurn: (turns: QuarterTurns[]) => QuarterTurns = (t) => t[0],
): Placement | null {
  const sourceFront = worldFront(source, sourcePlacement);
  const desired = oppositeDir(sourceFront); // child must face back at the source
  const childFront = parseOrientation(child.orientation).front;

  const turns = compatibleTurns(child, childFront, desired, source, sourcePlacement);
  if (turns.length === 0) return null;
  const quarterTurns = pickTurn(turns);

  // Place the child so its connector cell is the neighbour in front of the source.
  const sourceCenter = worldCenter(source.pos, sourcePlacement);
  const target: Vec3 = [
    sourceCenter[0] + DIR_VEC[sourceFront][0],
    sourceCenter[1] + DIR_VEC[sourceFront][1],
    sourceCenter[2] + DIR_VEC[sourceFront][2],
  ];
  const rotatedChild = rotatePointY(
    [child.pos[0] + 0.5, child.pos[1] + 0.5, child.pos[2] + 0.5],
    quarterTurns,
  );
  const offset: Vec3 = [
    target[0] - rotatedChild[0],
    target[1] - rotatedChild[1],
    target[2] - rotatedChild[2],
  ];
  return { offset, quarterTurns };
}

/** Which quarter-turns make `childFront` face `desired`, honoring the joint. */
function compatibleTurns(
  child: JigsawConnector,
  childFront: Direction,
  desired: Direction,
  source: JigsawConnector,
  sourcePlacement: Placement,
): QuarterTurns[] {
  // Horizontal connection: pieces rotate horizontally only, so exactly one turn
  // aligns the (horizontal) fronts. A vertical child front can't reach it.
  if (isHorizontal(desired)) {
    if (!isHorizontal(childFront)) return [];
    return ALL_TURNS.filter((q) => rotateDirY(childFront, q) === desired);
  }

  // Vertical connection: rotation can't flip a front up/down, so the child must
  // already face the right way. Then the joint decides the roll.
  if (childFront !== desired) return [];

  if (child.joint === 'rollable') return [...ALL_TURNS]; // any roll is valid
  // "aligned": the tops must line up, which pins a single rotation.
  const topWorld = rotateDirY(parseOrientation(source.orientation).top, sourcePlacement.quarterTurns);
  const childTop = parseOrientation(child.orientation).top;
  return ALL_TURNS.filter((q) => rotateDirY(childTop, q) === topWorld);
}

// --- Bounding boxes (overlap checks) -----------------------------------------

export interface Aabb {
  min: Vec3;
  max: Vec3;
}

/** World-space AABB of a piece of the given size under a placement. */
export function pieceAabb(size: Vec3, placement: Placement): Aabb {
  // Rotating the [0,size] box about the origin only swaps/negates X and Z; it's
  // enough to transform two opposite corners and take the min/max.
  const a = rotatePointY([0, 0, 0], placement.quarterTurns);
  const b = rotatePointY([size[0], size[1], size[2]], placement.quarterTurns);
  const min: Vec3 = [0, 0, 0];
  const max: Vec3 = [0, 0, 0];
  for (let i = 0; i < 3; i++) {
    min[i] = Math.min(a[i], b[i]) + placement.offset[i];
    max[i] = Math.max(a[i], b[i]) + placement.offset[i];
  }
  return { min, max };
}

/** True when two boxes overlap by more than `eps` (face-touching is allowed). */
export function aabbOverlap(a: Aabb, b: Aabb, eps = 1e-3): boolean {
  for (let i = 0; i < 3; i++) {
    if (a.min[i] >= b.max[i] - eps || b.min[i] >= a.max[i] - eps) return false;
  }
  return true;
}

// --- Deterministic RNG -------------------------------------------------------

/** A small seedable PRNG (mulberry32) so a seed reproduces an assembly exactly. */
export function makeRng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Pick an index in [0,n) from a unit float. */
export function pickIndex(rand: number, n: number): number {
  return Math.min(n - 1, Math.floor(rand * n));
}

/** Weighted pick: returns the chosen index given parallel `weights`. */
export function pickWeighted(rand: number, weights: number[]): number {
  const total = weights.reduce((a, w) => a + Math.max(0, w), 0);
  if (total <= 0) return 0;
  let r = rand * total;
  for (let i = 0; i < weights.length; i++) {
    r -= Math.max(0, weights[i]);
    if (r < 0) return i;
  }
  return weights.length - 1;
}
