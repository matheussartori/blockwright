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
// clears the headroom above each tread and — at the bottom/top step of each run — the
// landing cell back/forward of it. It uses the shared flight walk (`findFlights`), so it
// only fires on real climbing runs and never deletes another stair — decorative single
// stairs (chairs, desks) and open roof slopes are left untouched.
import { posKey } from '../geometry';
import { computeEnvelope } from './envelope';
import { findFlights, isBottomStair } from './flights';
import type { AuthoringBlock } from '../types';
import type { Pass } from './types';

export const carveStairwells: Pass = (blocks, palette) => {
  // The exterior skin is off-limits: carving headroom/landing through the roof or an
  // outer wall is the "stairs destroyed the roof / gutted a structural wall" defect.
  // We skip those cells and warn so the model repositions the flight (e.g. attic
  // stairs under the ridge, interior stairs off the outer wall) on the next emit.
  const { isShell } = computeEnvelope(blocks, palette);
  let blockedByShell = 0;
  const at = new Map<string, AuthoringBlock>();
  for (const b of blocks) at.set(posKey(...b.pos), b);
  const remove = new Set<string>();
  // Carve a cell only if it isn't part of the exterior shell. A shell hit means the
  // flight is jammed against the roof/outer wall — count it for a warning instead of
  // punching a hole.
  const carve = (cx: number, cy: number, cz: number): void => {
    const key = posKey(cx, cy, cz);
    const cell = at.get(key);
    if (!cell || isBottomStair(palette, cell.state)) return; // nothing there, or another stair (keep)
    if (isShell(cx, cy, cz)) { blockedByShell++; return; }
    remove.add(key);
  };
  for (const { chain, dir } of findFlights(blocks, palette)) {
    const [fx, fz] = dir;
    chain.forEach((t, i) => {
      const [x, y, z] = t.pos;
      for (const dy of [1, 2]) carve(x, y + dy, z); // clear the headroom; keep stairs
      // Bottom step of the run → clear a standing landing one cell back, at body + head
      // height, so there's room to step up to it.
      if (i === 0) for (const dy of [0, 1]) carve(x - fx, y + dy, z - fz);
      // Top step of the run → clear the ARRIVAL landing one cell forward, at body + head
      // height (the floor block you step onto stays). Without it the top step butts into
      // the upper wall/ceiling with no room to walk off — the "no space to climb" defect.
      if (i === chain.length - 1) for (const dy of [1, 2]) carve(x + fx, y + dy, z + fz);
    });
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
