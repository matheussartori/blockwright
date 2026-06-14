// Clean up vertical circulation the way the rest of the pipeline can't: the model
// (and, before the roof fix, the stair passes) leave behind broken LADDERS and orphan
// FLOOR HOLES that read as bugs in-game:
//   • a single floating ladder rung in mid-air, or a 1-tall stub you can't climb;
//   • a ladder stranded up in the empty roof void (an "attic ladder to nowhere");
//   • a ladder whose base hangs over air, with nothing solid to step onto;
//   • a 1×1 hole punched through a floor that no stair/ladder actually uses — the
//     "the stairs left a hole and never filled it" defect (image: a gap in the ceiling).
// This pass runs AFTER placement (so a ladder's wall-backing is already settled) and
// BEFORE the interior air-fill. It is conservative on both fronts:
//   1. It only DROPS a ladder run that is genuinely non-functional (too short, entirely
//      above the ceiling plane, or floating with no solid base) — a real climbable ladder
//      is left alone.
//   2. It only CAPS a hole that is unmistakably an orphan: a single empty cell sitting in
//      a floor plane, fenced on all four sides by that plane's DOMINANT floor block, with
//      no ladder/stair anywhere in its column (so a real stairwell/ladder shaft — and a
//      chimney flue, which is ringed by brick, not the plank/stone floor — is never plugged).
import { posKey } from '../geometry';
import { bareId, isAir, makeIntern } from '../palette';
import { isStructuralFull, topCeilingY } from './flights';
import { isSolidSupport } from './placement-rules';
import type { AuthoringBlock } from '../types';
import type { Pass } from './types';

const isLadder = (name: string): boolean => bareId(name) === 'ladder';
const isStair = (name: string): boolean => bareId(name).endsWith('_stairs');
/** The four lateral neighbours of a cell — used to spot a step-off landing at a ladder top. */
const LATERAL: readonly [number, number][] = [[1, 0], [-1, 0], [0, 1], [0, -1]];
// How far below a floor hole a stair/ladder still counts as "this column's shaft": a
// carved stairwell can break the floor a couple of cells above its top tread.
const SHAFT_REACH = 4;

export const fixCirculation: Pass = (blocks, palette) => {
  const nameOf = (s: number): string => palette[s]?.Name ?? '';
  const at = new Map<string, AuthoringBlock>();
  for (const b of blocks) at.set(posKey(...b.pos), b);
  const stateAt = (x: number, y: number, z: number): number | undefined => at.get(posKey(x, y, z))?.state;
  const nameAt = (x: number, y: number, z: number): string | undefined => {
    const s = stateAt(x, y, z);
    return s === undefined ? undefined : nameOf(s);
  };

  const ceilY = topCeilingY(blocks, palette);

  // ── 1) Drop non-functional ladder runs ─────────────────────────────────────────
  const ladderCells = blocks.filter((b) => isLadder(nameOf(b.state)) && !isAir(nameOf(b.state)));
  const ladderKeys = new Set(ladderCells.map((b) => posKey(...b.pos)));
  const remove = new Set<string>();
  const seen = new Set<string>();
  let droppedLadders = 0;
  for (const b of ladderCells) {
    const [x, y, z] = b.pos;
    if (seen.has(posKey(x, y, z)) || ladderKeys.has(posKey(x, y - 1, z))) continue; // walk from the bottom rung
    const run: [number, number, number][] = [];
    for (let yy = y; ladderKeys.has(posKey(x, yy, z)); yy++) {
      run.push([x, yy, z]);
      seen.add(posKey(x, yy, z));
    }
    const [bx, by, bz] = run[0];
    const [tx, ty, tz] = run[run.length - 1];
    const tooShort = run.length < 2;                          // a lone rung climbs nothing
    // A run that tops out on a WALKABLE surface is functional even above the ceiling plane:
    // a roof-hatch ladder climbing the top storey up onto a walkable deck (the keep's
    // crown) reaches a deck cell with open air over it to step onto. Only a run with no
    // such landing at its top is the "attic ladder to nowhere" this rule drops. (The
    // ceiling heuristic itself collapses to the ground plane on a big-yard build, so the
    // bare `by > ceilY` test alone would wrongly condemn every legitimate roof hatch.)
    const stepOffAtTop = LATERAL.some(([dx, dz]) =>
      isSolidSupport(nameAt(tx + dx, ty, tz + dz)) && isAir(nameAt(tx + dx, ty + 1, tz + dz) ?? 'minecraft:air'));
    const inRoofVoid = by > ceilY && !stepOffAtTop;           // above the ceiling AND leading nowhere
    const floatingBase = !isSolidSupport(nameAt(bx, by - 1, bz)); // nothing solid to step onto at the foot
    if (tooShort || inRoofVoid || floatingBase) {
      for (const p of run) remove.add(posKey(...p));
      droppedLadders++;
    }
  }
  const kept = remove.size ? blocks.filter((b) => !remove.has(posKey(...b.pos))) : blocks;

  // ── 2) Cap orphan floor holes ───────────────────────────────────────────────────
  // Recompute the lookup over the SURVIVING blocks (a dropped ladder may have vacated a
  // floor-plane cell that should now read as a hole to cap).
  const keptAt = new Map<string, AuthoringBlock>();
  let minX = Infinity, minZ = Infinity, maxX = -Infinity, maxZ = -Infinity;
  const perY = new Map<number, number>();
  for (const b of kept) {
    keptAt.set(posKey(...b.pos), b);
    if (isStructuralFull(palette, b.state)) perY.set(b.pos[1], (perY.get(b.pos[1]) ?? 0) + 1);
    const [x, , z] = b.pos;
    if (x < minX) minX = x; if (x > maxX) maxX = x;
    if (z < minZ) minZ = z; if (z > maxZ) maxZ = z;
  }
  const planes = new Set<number>();
  if (perY.size) {
    const max = Math.max(...perY.values());
    for (const [y, count] of perY) if (count >= 0.7 * max) planes.add(y);
  }
  // The dominant (most common) structural block of each plane — the real floor material.
  // A hole only caps if its ring matches THIS, so a brick chimney flue threading a plank
  // floor (ring ≠ floor) is left open.
  const planeFloorId = new Map<number, string>();
  {
    const tally = new Map<number, Map<string, number>>();
    for (const b of kept) {
      const y = b.pos[1];
      if (!planes.has(y) || !isStructuralFull(palette, b.state)) continue;
      const id = bareId(nameOf(b.state));
      const m = tally.get(y) ?? new Map<string, number>();
      m.set(id, (m.get(id) ?? 0) + 1);
      tally.set(y, m);
    }
    for (const [y, m] of tally) {
      let best = '', bestCount = -1;
      for (const [id, c] of m) if (c > bestCount) { bestCount = c; best = id; }
      planeFloorId.set(y, best);
    }
  }
  const keptState = (x: number, y: number, z: number): number | undefined => keptAt.get(posKey(x, y, z))?.state;
  const keptName = (x: number, y: number, z: number): string | undefined => {
    const s = keptState(x, y, z);
    return s === undefined ? undefined : nameOf(s);
  };
  const columnHasShaft = (x: number, y: number, z: number): boolean => {
    for (let yy = y - SHAFT_REACH; yy <= y + 1; yy++) {
      const n = keptName(x, yy, z);
      if (n !== undefined && (isLadder(n) || isStair(n))) return true;
    }
    return false;
  };

  const fills: AuthoringBlock[] = [];
  const outPalette = palette.slice();
  const intern = makeIntern(outPalette);
  let cappedHoles = 0;
  for (const y of planes) {
    for (let x = minX; x <= maxX; x++) for (let z = minZ; z <= maxZ; z++) {
      if (keptState(x, y, z) !== undefined) continue; // not empty — nothing to cap
      // The four lateral neighbours must be the SAME block, that block must be this plane's
      // dominant floor material (mid-floor, not an edge or a brick-ringed flue), and the
      // column must carry no stair/ladder shaft.
      const sides = [keptState(x + 1, y, z), keptState(x - 1, y, z), keptState(x, y, z + 1), keptState(x, y, z - 1)];
      const ref = sides[0];
      if (ref === undefined || !sides.every((s) => s === ref) || !isStructuralFull(palette, ref)) continue;
      if (bareId(nameOf(ref)) !== planeFloorId.get(y)) continue;
      if (columnHasShaft(x, y, z)) continue;
      fills.push({ state: intern(outPalette[ref]), pos: [x, y, z] });
      cappedHoles++;
    }
  }

  if (droppedLadders === 0 && cappedHoles === 0) return { blocks, palette };
  const fixes: string[] = [];
  if (droppedLadders) fixes.push(`removed ${droppedLadders} non-functional ladder(s) (a stray rung, a floating run, or a ladder stranded in the roof void)`);
  if (cappedHoles) fixes.push(`capped ${cappedHoles} orphan floor hole(s) no staircase uses`);
  return { blocks: kept.concat(fills), palette: outPalette, fixes };
};
