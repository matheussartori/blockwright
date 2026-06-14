// Shared stair-flight detection. A "flight" is a climbing run of same-facing bottom
// stairs stepping one block up the ascent diagonal. `rebuildStairwells` walks these
// (and `fixCirculation` shares the helpers), so the walk lives here once.
//
// CRITICAL: a gable ROOF is built from stairs and looks identical to a climbing run
// (same-facing bottom stairs stepping up the diagonal). If those count as flights the
// stairwell rebuild wrecks the build — it would treat the roof slope as a staircase,
// carve headroom holes through the roof, and lay an opening into the attic void. So
// findFlights excludes any run topping out ABOVE the build's ceiling plane
// (`topCeilingY`): a real staircase connects interior storeys and never climbs past
// the top floor; a roof slope always does.
import { posKey } from '../geometry';
import { bareId } from '../palette';
import type { AuthoringBlock, AuthoringPaletteEntry } from '../types';

/** Unit (dx,dz) a stair ascends toward, keyed by its `facing`. */
export const STAIR_DIR: Record<string, [number, number]> = {
  north: [0, -1], south: [0, 1], west: [-1, 0], east: [1, 0],
};

/** A bottom-half `*_stairs` block — the climbable tread. Tops/inverted are skipped
 *  (they aren't the rising step of a flight). */
export function isBottomStair(palette: AuthoringPaletteEntry[], state: number): boolean {
  const p = palette[state];
  if (!p || !bareId(p.Name).endsWith('_stairs')) return false;
  const half = p.Properties?.half;
  return half === undefined || half === 'bottom';
}

/** The `facing` of a stair state, or undefined when it isn't a directional stair. */
export function facingOf(palette: AuthoringPaletteEntry[], state: number): string | undefined {
  const f = palette[state]?.Properties?.facing;
  return typeof f === 'string' ? f : undefined;
}

/** Whether a block is a full structural cube — i.e. counts toward a solid horizontal
 *  floor/ceiling plane. Stairs/slabs/ladders and air are NOT (a roof made of stairs
 *  must not read as a floor plane), nor are thin/attached decorations. */
export function isStructuralFull(palette: AuthoringPaletteEntry[], state: number): boolean {
  const id = bareId(palette[state]?.Name ?? '');
  if (!id || id === 'air' || id === 'ladder') return false;
  if (id.endsWith('_stairs') || id.endsWith('_slab')) return false;
  if (id.endsWith('_pane') || id.endsWith('_fence') || id.endsWith('_wall') || id === 'iron_bars') return false;
  return true;
}

/** Heuristic y of the build's topmost solid horizontal plane — its ceiling / top
 *  floor. Anything ABOVE this that looks like a flight is a ROOF SLOPE (a gable made
 *  of stairs), never a climbable staircase, so the stair passes must leave it alone
 *  (carving headroom over it punches the roof; converting it spawns an attic ladder).
 *
 *  Computed as the highest y whose count of full structural blocks is within 70% of
 *  the busiest plane: real floors span the whole footprint, while a gable roof tapers
 *  as it rises, so its planes fall below the cut. Returns +Infinity when there is no
 *  clear plane (a flat/levelless build) — then nothing is treated as roof. */
export function topCeilingY(blocks: AuthoringBlock[], palette: AuthoringPaletteEntry[]): number {
  const perY = new Map<number, number>();
  for (const b of blocks) {
    if (!isStructuralFull(palette, b.state)) continue;
    perY.set(b.pos[1], (perY.get(b.pos[1]) ?? 0) + 1);
  }
  if (perY.size === 0) return Infinity;
  const max = Math.max(...perY.values());
  let ceil = -Infinity;
  for (const [y, count] of perY) if (count >= 0.7 * max && y > ceil) ceil = y;
  return ceil;
}

export interface Flight {
  /** The treads from the bottom step up to the top step (length >= 2). */
  chain: AuthoringBlock[];
  /** The shared `facing` of every tread. */
  facing: string;
  /** Unit (dx,dz) the flight ascends toward. */
  dir: [number, number];
}

/** Walk every climbing flight in the block list: each run of same-facing bottom stairs
 *  stepping one block up the ascent diagonal. Decorative single stairs (chairs/desks —
 *  chains shorter than 2) and open roof slopes are excluded, so callers only ever see a
 *  real, traversable flight. `opts.ignoreCeiling` disables the roof-slope exclusion —
 *  for diagnostics that need to SEE every climbing run even when the ceiling-plane
 *  heuristic itself is what failed (the stairwell pass's silent-bail warning). */
export function findFlights(
  blocks: AuthoringBlock[],
  palette: AuthoringPaletteEntry[],
  opts?: { ignoreCeiling?: boolean; ceilFloor?: number },
): Flight[] {
  // The roof-slope cut is the higher of the geometric ceiling and an AUTHORITATIVE top
  // storey plane (`ceilFloor`), when the caller knows it. The geometric `topCeilingY` is
  // fooled LOW by a build whose busiest plane is a huge surroundings YARD ground (the
  // keep's small interior floors fall under the 70% cut, collapsing the ceiling to grade),
  // which then misreads every real interior staircase as a roof slope and drops it — the
  // "double staircase on a yarded build" defect. Taking the MAX only ever RAISES the
  // ceiling to the real top floor, so genuine roof slopes (above it) stay excluded.
  const ceilY = opts?.ignoreCeiling
    ? Infinity
    : Math.max(topCeilingY(blocks, palette), opts?.ceilFloor ?? -Infinity);
  const at = new Map<string, AuthoringBlock>();
  for (const b of blocks) at.set(posKey(...b.pos), b);
  const stairAt = (x: number, y: number, z: number, facing: string): boolean => {
    const b = at.get(posKey(x, y, z));
    return !!b && isBottomStair(palette, b.state) && facingOf(palette, b.state) === facing;
  };
  const flights: Flight[] = [];
  const seen = new Set<string>();
  for (const b of blocks) {
    if (!isBottomStair(palette, b.state)) continue;
    const facing = facingOf(palette, b.state);
    if (!facing) continue;
    const dir = STAIR_DIR[facing];
    if (!dir) continue;
    const [fx, fz] = dir;
    const [x, y, z] = b.pos;
    if (stairAt(x - fx, y - 1, z - fz, facing)) continue; // only start from the bottom step
    const chain: AuthoringBlock[] = [];
    let cx = x, cy = y, cz = z;
    while (stairAt(cx, cy, cz, facing)) {
      chain.push(at.get(posKey(cx, cy, cz)) as AuthoringBlock);
      cx += fx; cy += 1; cz += fz;
    }
    if (chain.length < 2) continue; // a decorative single stair — not a flight
    // A run topping out ABOVE the ceiling plane is a roof slope (a gable made of
    // stairs), not a climbable flight — leave it to the roof, never carve/convert it.
    if (chain[chain.length - 1].pos[1] > ceilY) continue;
    const startKey = posKey(...chain[0].pos);
    if (seen.has(startKey)) continue;
    seen.add(startKey);
    flights.push({ chain, facing, dir });
  }
  return flights;
}
