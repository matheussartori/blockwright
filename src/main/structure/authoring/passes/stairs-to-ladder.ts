// Multi-storey fallback: when a flight simply cannot become a climbable stair without
// gouging the shell, turn it into a flush WALL LADDER. The model keeps jamming a flight
// into a tight corner (e.g. a 9×9 two-storey house): `insetStairs` can't nudge it off
// both walls and `carveStairwells` can't open its headroom/landing without punching the
// roof or an outer wall — so it stays cramped and broken, with no breathing room to start
// the climb. A ladder needs a single column against a solid wall, so it fits where a flight
// can't. This pass detects those irreparable flights and replaces each with a ladder
// column plus a 1×1 carved exit above it.
//
// Conservative: it only fires on a flight that is boxed against the shell on both flanks
// OR whose required clearance hits the shell — exactly the flights the other two passes
// flag and can't fix; a normal repairable flight is left for them. Runs AFTER `insetStairs`
// (so a flight that COULD be nudged off the wall already was) and BEFORE `carveStairwells`
// (so a converted flight has no stairs left for carve to flag). Gated to storeyed
// structures via the 'stairs' finalizer.
import { posKey } from '../geometry';
import { computeEnvelope } from './envelope';
import { makeIntern } from '../palette';
import { FACINGS } from './placement-rules';
import { findFlights } from './flights';
import type { AuthoringBlock } from '../types';
import type { Pass } from './types';

export const stairsToLadder: Pass = (blocks, palette) => {
  const { isShell } = computeEnvelope(blocks, palette);
  const removeKeys = new Set<string>();
  const added: AuthoringBlock[] = [];
  const intern = makeIntern(palette);
  let converted = 0;
  let stuck = 0;

  for (const { chain, dir } of findFlights(blocks, palette)) {
    const [fx, fz] = dir;
    // Perpendicular axis (the flank direction): the non-ascent horizontal axis.
    const [px, pz] = fx !== 0 ? [0, 1] : [1, 0];
    const flankIsShell = (sx: number, sz: number): boolean =>
      chain.some((t) => isShell(t.pos[0] + sx, t.pos[1], t.pos[2] + sz));
    const plusShell = flankIsShell(px, pz);
    const minusShell = flankIsShell(-px, -pz);
    const boxed = plusShell && minusShell; // walled on both flanks — insetStairs couldn't move it

    // The clearance `carveStairwells` would need (headroom over each tread + a landing at
    // each end). If any of it lands on the shell, the flight can't be made climbable here.
    let shellBlocked = false;
    chain.forEach((t, i) => {
      const [x, y, z] = t.pos;
      const cells: [number, number, number][] = [[x, y + 1, z], [x, y + 2, z]];
      if (i === 0) cells.push([x - fx, y, z - fz], [x - fx, y + 1, z - fz]);
      if (i === chain.length - 1) cells.push([x + fx, y + 1, z + fz], [x + fx, y + 2, z + fz]);
      for (const [cx, cy, cz] of cells) if (isShell(cx, cy, cz)) shellBlocked = true;
    });

    if (!boxed && !shellBlocked) continue; // a normal, repairable flight — leave it for the others

    // The ladder rides the bottom step's column, from the bottom tread up to the top.
    const [bx, by, bz] = chain[0].pos;
    const topY = chain[chain.length - 1].pos[1];
    // Hang it on any one of the four adjacent walls that is solid shell for the whole
    // climb (an outer wall runs continuously up, so it's a valid ladder support). The
    // ladder leans AWAY from that wall (its support sits opposite its `facing`).
    const wall = FACINGS.find((f) => {
      for (let y = by; y <= topY; y++) if (!isShell(bx + f.dx, y, bz + f.dz)) return false;
      return true;
    });
    if (!wall) { stuck++; continue; } // boxed only by interior blocks — no wall to hang on
    const facing = FACINGS.find((f) => f.dx === -wall.dx && f.dz === -wall.dz)!.facing;

    // Convert. Drop the whole flight…
    for (const t of chain) removeKeys.add(posKey(...t.pos));
    // …clear the stringer ramp under the treads (above the bottom floor) so the old flight
    // doesn't leave a solid diagonal behind the ladder; keep the bottom floor + the shell.
    chain.forEach((t, i) => {
      if (i === 0) return;
      const [sx, sy, sz] = [t.pos[0], t.pos[1] - 1, t.pos[2]];
      if (!isShell(sx, sy, sz)) removeKeys.add(posKey(sx, sy, sz));
    });
    // …lay the ladder column (it punches through any floor/ceiling in its own cell)…
    const ladderIdx = intern({ Name: 'minecraft:ladder', Properties: { facing } });
    for (let y = by; y <= topY; y++) {
      removeKeys.add(posKey(bx, y, bz));
      added.push({ state: ladderIdx, pos: [bx, y, bz] });
    }
    // …and carve the exit: two cells above the top ladder so you can step off onto the
    // upper floor (never punch the roof — skip the shell).
    for (const dy of [1, 2]) {
      const ey = topY + dy;
      if (!isShell(bx, ey, bz)) removeKeys.add(posKey(bx, ey, bz));
    }
    converted++;
  }

  if (converted === 0 && stuck === 0) return { blocks, palette };
  const out = blocks.filter((b) => !removeKeys.has(posKey(...b.pos))).concat(added);
  const fixes = converted
    ? [`Converted ${converted} cramped staircase(s) to a wall ladder so it climbs without gouging the shell.`]
    : undefined;
  const warnings = stuck
    ? [`A staircase is boxed in with no wall to hang a ladder on — open up the interior so a `
      + `flight (or a ladder against an outer wall) fits.`]
    : undefined;
  return { blocks: out, palette, fixes, warnings };
};
