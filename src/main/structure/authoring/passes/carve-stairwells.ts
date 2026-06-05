// A real staircase needs two kinds of clearance the model routinely forgets:
//  1. an open shaft ABOVE it — 2 blocks of headroom over every tread, and a hole
//     through whatever floor/ceiling sits at the top (else the stairs "lead
//     nowhere", capped by the upper floor with no room to climb);
//  2. a standing LANDING at each END — at the BOTTOM step, a clear cell (body + head)
//     to step onto before ascending; at the TOP step, the same one cell forward where
//     you walk off onto the upper floor. Models often jam the bottom step flush against
//     a wall (nowhere to start the climb) or run the top step straight into the upper
//     wall/ceiling (nowhere to get off) — both look bad and aren't traversable.
// This pass repairs all of it for any flight regardless of how it was authored: it
// finds treads that belong to an actual climbing run (a same-facing stair one step up
// or down along the ascent diagonal), clears the headroom above each, and — at the
// bottom/top step of each run — clears the landing cell back/forward of it. It only
// fires on real flights and never deletes another stair, so decorative single stairs
// (chairs, desks) and open roof slopes are left untouched.
import { posKey } from '../geometry';
import { computeEnvelope } from './envelope';
import { bareId } from '../palette';
import type { AuthoringBlock } from '../types';
import type { Pass } from './types';

const STAIR_DIR: Record<string, [number, number]> = {
  north: [0, -1], south: [0, 1], west: [-1, 0], east: [1, 0],
};

export const carveStairwells: Pass = (blocks, palette) => {
  // The exterior skin is off-limits: carving headroom/landing through the roof or an
  // outer wall is the "stairs destroyed the roof / gutted a structural wall" defect.
  // We skip those cells and warn so the model repositions the flight (e.g. attic
  // stairs under the ridge, interior stairs off the outer wall) on the next emit.
  const { isShell } = computeEnvelope(blocks, palette);
  let blockedByShell = 0;
  const isBottomStair = (state: number): boolean => {
    const p = palette[state];
    if (!p || !bareId(p.Name).endsWith('_stairs')) return false;
    const half = p.Properties?.half;
    return half === undefined || half === 'bottom';
  };
  const facingOf = (state: number): string | undefined => {
    const f = palette[state]?.Properties?.facing;
    return typeof f === 'string' ? f : undefined;
  };
  const at = new Map<string, AuthoringBlock>();
  for (const b of blocks) at.set(posKey(...b.pos), b);
  const stairAt = (x: number, y: number, z: number, facing: string): boolean => {
    const b = at.get(posKey(x, y, z));
    return !!b && isBottomStair(b.state) && facingOf(b.state) === facing;
  };
  const remove = new Set<string>();
  // Carve a cell only if it isn't part of the exterior shell. A shell hit means the
  // flight is jammed against the roof/outer wall — count it for a warning instead of
  // punching a hole.
  const carve = (cx: number, cy: number, cz: number): void => {
    const key = posKey(cx, cy, cz);
    const cell = at.get(key);
    if (!cell || isBottomStair(cell.state)) return; // nothing there, or another stair (keep)
    if (isShell(cx, cy, cz)) { blockedByShell++; return; }
    remove.add(key);
  };
  for (const b of blocks) {
    if (!isBottomStair(b.state)) continue;
    const facing = facingOf(b.state);
    if (!facing) continue;
    const dir = STAIR_DIR[facing];
    if (!dir) continue;
    const [fx, fz] = dir;
    const [x, y, z] = b.pos;
    // A climbing flight has a same-facing tread one step up the ascent diagonal
    // (toward `facing`) or one step down behind it.
    const hasUpperAhead = stairAt(x + fx, y + 1, z + fz, facing);
    const hasLowerBehind = stairAt(x - fx, y - 1, z - fz, facing);
    if (!hasUpperAhead && !hasLowerBehind) continue;
    for (const dy of [1, 2]) carve(x, y + dy, z); // clear the headroom; keep stairs
    // Bottom step of the run (no lower tread behind it) → clear a standing landing
    // one cell back, at body + head height, so there's room to step up to it.
    if (!hasLowerBehind) {
      for (const dy of [0, 1]) carve(x - fx, y + dy, z - fz);
    }
    // Top step of the run (no higher tread ahead) → clear the ARRIVAL landing one
    // cell forward, at body + head height (the floor block you step onto stays).
    // Without it the top step butts into the upper wall/ceiling with no room to walk
    // off the flight — the recurring "no space to climb up/down" defect.
    if (!hasUpperAhead) {
      for (const dy of [1, 2]) carve(x + fx, y + dy, z + fz);
    }
  }
  const out: AuthoringBlock[] =
    remove.size === 0 ? blocks : blocks.filter((b) => !remove.has(posKey(...b.pos)));
  const warnings = blockedByShell > 0
    ? [`A staircase runs into the exterior shell: ${blockedByShell} headroom/landing `
      + `cell(s) would have to be carved out of the roof or an outer wall, so they were `
      + `left intact. Reposition the flight — put attic stairs under the ridge (the tall `
      + `part of the roof) and keep interior stairs at least one cell off the outer walls, `
      + `with a clear landing at top and bottom.`]
    : undefined;
  return { blocks: out, palette, warnings };
};
