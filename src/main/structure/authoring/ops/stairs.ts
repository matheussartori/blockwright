import { inBounds, posKey } from '../geometry';
import type { Horiz } from '../orientation';
import type { AuthoringOp } from '../types';
import type { OpCtx } from './context';

/** Build a real, climbable staircase from `from` (the BOTTOM step) up to `to`
 *  (the TOP step). The run is axis-aligned: it travels along whichever horizontal
 *  axis differs between `from`/`to`, gaining one block of height per cell, so a
 *  flight that rises N blocks is N+1 steps long. `state` must be a `*_stairs`
 *  block; every step is placed `half:bottom` with `facing` set to the ASCENT
 *  direction (so the player walks up it — never an inverted/blocking step, and
 *  never a missing top step, the two failure modes of hand-placed stairs). Width
 *  comes from the perpendicular extent of the box (give `from`/`to` a spread on
 *  the other horizontal axis for a wider flight). Optional `fill` puts a solid
 *  support block under each tread (a stringer, so the run never floats); optional
 *  `clear` (an air index) carves 2 blocks of headroom above every tread (cutting
 *  the stairwell hole through any floor/ceiling above) AND the arrival landing one
 *  cell past the top tread, so the climb isn't blocked at either end. */
export function applyStairs(op: Extract<AuthoringOp, { op: 'stairs' }>, ctx: OpCtx): void {
  const { cells, palette, intern, size } = ctx;
  const [ax, ay, az] = op.from;
  const [bx, by, bz] = op.to;
  const dx = bx - ax, dz = bz - az, dy = by - ay;
  const runX = Math.abs(dx) >= Math.abs(dz); // run along x, else along z
  const runLen = runX ? Math.abs(dx) : Math.abs(dz);
  const steps = runLen + 1; // inclusive of both ends
  const runSign = (runX ? Math.sign(dx) : Math.sign(dz)) || 1;
  const ySign = Math.sign(dy) || 1;
  // facing = the horizontal direction the flight ascends toward.
  const facing: Horiz = runX ? (runSign >= 0 ? 'east' : 'west') : (runSign >= 0 ? 'south' : 'north');
  // Perpendicular (width) extent — the flight is this many cells wide.
  const wMin = runX ? Math.min(az, bz) : Math.min(ax, bx);
  const wMax = runX ? Math.max(az, bz) : Math.max(ax, bx);
  const runStart = runX ? ax : az;
  const baseName = palette[op.state]?.Name ?? 'minecraft:oak_stairs';
  const stairIdx = intern({ Name: baseName, Properties: { facing, half: 'bottom', shape: 'straight', waterlogged: 'false' } });
  const set = (x: number, y: number, z: number, st: number): void => {
    if (inBounds([x, y, z], size)) cells.set(posKey(x, y, z), { state: st, pos: [x, y, z] });
  };
  for (let i = 0; i < steps; i++) {
    const along = runStart + runSign * i;
    const y = ay + ySign * i;
    for (let w = wMin; w <= wMax; w++) {
      const x = runX ? along : w;
      const z = runX ? w : along;
      set(x, y, z, stairIdx);
      if (op.fill !== undefined) set(x, y - 1, z, op.fill); // solid tread support (stringer)
      if (op.clear !== undefined) { set(x, y + 1, z, op.clear); set(x, y + 2, z, op.clear); } // headroom + stairwell hole
    }
  }
  // Clear the arrival LANDING: the cell one step PAST the top tread, at walking
  // height + head. Standing on the top tread your feet are at yTop+1, and you step
  // forward onto the upper floor — without this the top step butts straight into
  // the upper wall/ceiling and there's no room to walk off the flight.
  if (op.clear !== undefined) {
    const topAlong = runStart + runSign * steps; // one past the last tread
    const topY = ay + ySign * (steps - 1);
    for (let w = wMin; w <= wMax; w++) {
      const x = runX ? topAlong : w;
      const z = runX ? w : topAlong;
      set(x, topY + 1, z, op.clear);
      set(x, topY + 2, z, op.clear);
    }
  }
}
