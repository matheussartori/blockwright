// A real staircase needs two kinds of clearance the model routinely forgets:
//  1. an open shaft ABOVE it — 2 blocks of headroom over every tread, and a hole
//     through whatever floor/ceiling sits at the top (else the stairs "lead
//     nowhere", capped by the upper floor with no room to climb);
//  2. a standing LANDING in front of the BOTTOM step — at least one clear cell (body
//     + head height) to step onto before ascending. Models often jam the first step
//     flush against a wall, so there's nowhere to stand to start the climb (and it
//     looks bad).
// This pass repairs both for any flight regardless of how it was authored: it finds
// treads that belong to an actual climbing run (a same-facing stair one step up or
// down along the ascent diagonal), clears the headroom above each, and — at the
// bottom step of each run — clears the landing cell directly in front of it. It only
// fires on real flights and never deletes another stair, so decorative single stairs
// (chairs, desks) and open roof slopes are left untouched.
import { posKey } from '../geometry';
import { bareId } from '../palette';
import type { AuthoringBlock } from '../types';
import type { Pass } from './types';

const STAIR_DIR: Record<string, [number, number]> = {
  north: [0, -1], south: [0, 1], west: [-1, 0], east: [1, 0],
};

export const carveStairwells: Pass = (blocks, palette) => {
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
    for (const dy of [1, 2]) {
      const key = posKey(x, y + dy, z);
      const above = at.get(key);
      if (above && !isBottomStair(above.state)) remove.add(key); // clear the headroom; keep stairs
    }
    // Bottom step of the run (no lower tread behind it) → clear a standing landing
    // one cell back, at body + head height, so there's room to step up to it.
    if (!hasLowerBehind) {
      for (const dy of [0, 1]) {
        const key = posKey(x - fx, y + dy, z - fz);
        const cell = at.get(key);
        if (cell && !isBottomStair(cell.state)) remove.add(key);
      }
    }
  }
  const out: AuthoringBlock[] =
    remove.size === 0 ? blocks : blocks.filter((b) => !remove.has(posKey(...b.pos)));
  return { blocks: out, palette };
};
