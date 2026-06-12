// Shared structure geometry: the connected stair core every code-built house lays to
// link its walkable storeys. Extracted from `classic.ts` so the other archetypes
// (gothic / sakura / farmhouse) reuse the same proven circulation WITHOUT depending on a
// concrete sibling type — a `parts` helper, not a cross-type import. It takes the build's
// `RolePalette` and derives every block it needs (stairs, floor fill, air, ladders) from
// the active decoration, so a caller never pre-interns them.
//
// This is the AUTHORITATIVE code-built circulation: the stairwell compile pass only
// REBUILDS broken flights, it never invents one for a hint-less shell, so a code-built
// house seeds its own clean stair core here.
import type { AuthoringOp } from '../../authoring/types';
import type { Box, RolePalette } from './types';

/** Inputs for {@link addStairCore}. Bundled as one options object (rather than the old
 *  12-positional list) so the call sites stay readable and adding a knob doesn't shift
 *  every caller's argument order. */
export interface StairCoreArgs {
  /** The ops list to append the stair geometry to (mutated in place). */
  ops: AuthoringOp[];
  /** The box the stair core sits in — its back-right corner carries the switchback. */
  box: Box;
  /** The y of each walkable floor slab, bottom-up (a flight links each consecutive pair).
   *  Each flight's 45° horizontal run is derived from its own slab gap, so storeys of
   *  DIFFERENT heights (the user's per-floor heights) each get a correctly-sized flight. */
  slabYs: number[];
  /** The active role palette — stairs/floor/air/ladders are resolved from it. */
  palette: RolePalette;
  /** When the house has an in-roof attic: the wall-top y an access LADDER climbs to
   *  (from the top floor up through the attic floor, so no flight ever pierces the roof).
   *  Omit → no attic, no ladder. */
  atticWallTop?: number;
}

/**
 * Lay a **2-wide switchback** stair core in the back-right corner, linking each
 * consecutive walkable storey in `slabYs`. Flights alternate between two adjacent
 * perpendicular rows so the up- and down-flights sit SIDE BY SIDE with a 1-cell landing
 * at each turn (full headroom — never the 1-wide stacked well that blocked the turn).
 * Each flight carves the stairwell hole + headroom through the slab it passes. When
 * `atticWallTop` is set, a ladder climbs from the top floor through the attic floor.
 * Falls back to a flush wall ladder (never a bare fall-through shaft) when the footprint
 * is too tight for a 45° flight.
 *
 * @param args - See {@link StairCoreArgs}.
 */
export function addStairCore(args: StairCoreArgs): void {
  const { ops, box, slabYs, palette, atticWallTop } = args;
  const { x0, z0, x1, z1 } = box;
  const stair = palette.get('roof'); // interior stairs reuse the roof's *_stairs block
  const fill = palette.get('floor');
  const air = palette.air();

  // Horizontal cells = vertical rise (45° flight), per flight — storeys may differ in
  // height, so the well must fit the LONGEST run.
  const runs = slabYs.slice(1).map((y, k) => y - slabYs[k] - 1);
  const maxRun = runs.length ? Math.max(...runs) : 0;
  // A 2-wide well needs `maxRun` along one axis and 2 cells on the perpendicular.
  const fitX = maxRun <= x1 - x0 - 1 && z1 - z0 >= 3;
  const fitZ = !fitX && maxRun <= z1 - z0 - 1 && x1 - x0 >= 3;

  if (!fitX && !fitZ) {
    // No room for a stair → a CONTINUOUS wall ladder (rule: stair if it fits, else a
    // ladder — never a bare fall-through shaft). Hung on the x1 wall (faces west), it
    // runs unbroken from the lowest floor to the top, punching the floor opening at each
    // storey; the stairwell pass then refines it.
    const lx = x1 - 1, lz = z1 - 1;
    const topY = slabYs[slabYs.length - 1];
    const ladder = palette.get('ladder', { facing: 'west' });
    for (let y = slabYs[0] + 1; y <= topY; y++) ops.push({ op: 'block', pos: [lx, y, lz], state: ladder });
    ops.push({ op: 'fill', from: [lx - 1, topY, lz], to: [lx - 1, topY + 1, lz], state: air }); // step-off + headroom
    return;
  }

  for (let k = 0; k < slabYs.length - 1; k++) {
    const by = slabYs[k] + 1; // bottom step
    const ty = slabYs[k + 1]; // top step lands on the upper floor
    const run = runs[k]; // this flight's own 45° run
    const fwd = k % 2 === 0; // alternate direction + row → a side-by-side switchback
    if (fitX) {
      const lo = x1 - 1 - run, hi = x1 - 1;
      const row = fwd ? z1 - 1 : z1 - 2;
      ops.push({ op: 'stairs', from: [fwd ? lo : hi, by, row], to: [fwd ? hi : lo, ty, row], state: stair, fill, clear: air });
    } else {
      const lo = z1 - 1 - run, hi = z1 - 1;
      const row = fwd ? x1 - 1 : x1 - 2;
      ops.push({ op: 'stairs', from: [row, by, fwd ? lo : hi], to: [row, ty, fwd ? hi : lo], state: stair, fill, clear: air });
    }
  }

  // Attic access: a ladder up through the attic floor, against a side wall just outside
  // the stair rows. Vertical → it never carves the roof. A step-off hole is carved in the
  // attic floor IN FRONT of the ladder so its top rung faces open (else the placement pass
  // strips a "buried" fixture) and you can climb out.
  if (atticWallTop !== undefined) {
    const top = slabYs[slabYs.length - 1];
    if (fitX && z1 - 3 >= z0 + 1) {
      const lx = x1 - 1, lz = z1 - 3; // backed by the x1 wall (faces west)
      const ladderW = palette.get('ladder', { facing: 'west' });
      for (let y = top + 1; y <= atticWallTop; y++) ops.push({ op: 'block', pos: [lx, y, lz], state: ladderW });
      ops.push({ op: 'block', pos: [lx - 1, atticWallTop, lz], state: air }); // step-off hole
    } else if (x1 - 3 >= x0 + 1) {
      const lz = z1 - 1, lx = x1 - 3; // backed by the z1 wall (faces north)
      const ladderN = palette.get('ladder', { facing: 'north' });
      for (let y = top + 1; y <= atticWallTop; y++) ops.push({ op: 'block', pos: [lx, y, lz], state: ladderN });
      ops.push({ op: 'block', pos: [lx, atticWallTop, lz - 1], state: air }); // step-off hole
    }
  }
}
