// The DEFINITIVE vertical-circulation pass. Repairing the model's hand-placed
// stairs in situ (the old inset → ladder → carve → cap chain) was endlessly
// fragile: every patch spawned a fresh defect — a missing top step, a hole punched
// in the floor that nothing filled, two flights colliding where one ended and the
// next began. So code now OWNS the stairwell. The model only tells us WHERE it
// wanted to go up; this pass throws away the broken geometry and rebuilds ONE clean,
// guaranteed-correct connector per storey-gap:
//   • a straight staircase when a 45° flight fits in the interior with clearance —
//     a full run whose TOP STEP always reaches the upper floor, an opening cut
//     exactly to the run's footprint, 2 blocks of headroom over every tread, and a
//     standing landing at both ends;
//   • else a flush WALL LADDER hung on a solid wall, with a carved step-off above.
// Connectors reserve their cells, so two of them can never collide. A gap it can't
// solve keeps the model's geometry untouched and warns (so nothing is ever left
// without access). Roof slopes — gables built from stairs — are excluded by
// `findFlights` (they top out above the ceiling plane), so the roof is never touched.
//
// Replaces carveStairwells / insetStairs / stairsToLadder. Runs first in the
// pipeline; `fixCirculation` still follows as a generic safety net for any stray
// ladder/hole the model left elsewhere.
import { posKey } from '../geometry';
import { bareId, makeIntern } from '../palette';
import { computeEnvelope } from './envelope';
import { findFlights, isStructuralFull } from './flights';
import { FACINGS, isSolidSupport } from './placement-rules';
import type { AuthoringBlock, AuthoringPaletteEntry } from '../types';
import type { Pass } from './types';

/** Detect the build's STOREY FLOOR planes: the y of each solid horizontal slab that
 *  spans most of the footprint. A real floor covers ~the whole plan, while interior
 *  partitions/furniture and a tapering gable roof fall below the 60%-of-busiest cut.
 *  Runs of consecutive plane-ys (a double-thick floor) collapse to their top y — the
 *  block you actually walk on. Returned ascending. */
function floorPlanes(blocks: AuthoringBlock[], palette: AuthoringPaletteEntry[]): number[] {
  const perY = new Map<number, number>();
  for (const b of blocks) {
    if (!isStructuralFull(palette, b.state)) continue;
    perY.set(b.pos[1], (perY.get(b.pos[1]) ?? 0) + 1);
  }
  if (perY.size === 0) return [];
  const max = Math.max(...perY.values());
  const raw = [...perY.entries()].filter(([, c]) => c >= 0.6 * max).map(([y]) => y).sort((a, b) => a - b);
  // Collapse consecutive ys to the top of each run (the walkable surface block).
  const planes: number[] = [];
  for (let i = 0; i < raw.length; i++) {
    if (i + 1 < raw.length && raw[i + 1] === raw[i] + 1) continue;
    planes.push(raw[i]);
  }
  return planes;
}

/** The dominant (most common) full block of each given plane — its real floor
 *  material, reused for stringers and any cap so a rebuild blends in. */
function planeMaterials(
  blocks: AuthoringBlock[], palette: AuthoringPaletteEntry[], planes: Set<number>,
): Map<number, number> {
  const tally = new Map<number, Map<number, number>>();
  for (const b of blocks) {
    const y = b.pos[1];
    if (!planes.has(y) || !isStructuralFull(palette, b.state)) continue;
    const m = tally.get(y) ?? new Map<number, number>();
    m.set(b.state, (m.get(b.state) ?? 0) + 1);
    tally.set(y, m);
  }
  const out = new Map<number, number>();
  for (const [y, m] of tally) {
    let best = -1, bestCount = -1;
    for (const [state, c] of m) if (c > bestCount) { bestCount = c; best = state; }
    out.set(y, best);
  }
  return out;
}

interface LadderRun { cells: AuthoringBlock[]; }

/** Walk every vertical ladder column (a stack of `ladder` cells), bottom-up. */
function findLadderRuns(blocks: AuthoringBlock[], palette: AuthoringPaletteEntry[]): LadderRun[] {
  const isLadder = (s: number): boolean => bareId(palette[s]?.Name ?? '') === 'ladder';
  const at = new Map<string, AuthoringBlock>();
  for (const b of blocks) at.set(posKey(...b.pos), b);
  const ladderAt = (x: number, y: number, z: number): boolean => {
    const b = at.get(posKey(x, y, z));
    return !!b && isLadder(b.state);
  };
  const runs: LadderRun[] = [];
  for (const b of blocks) {
    if (!isLadder(b.state)) continue;
    const [x, y, z] = b.pos;
    if (ladderAt(x, y - 1, z)) continue; // only start from the bottom rung
    const cells: AuthoringBlock[] = [];
    for (let yy = y; ladderAt(x, yy, z); yy++) cells.push(at.get(posKey(x, yy, z)) as AuthoringBlock);
    runs.push({ cells });
  }
  return runs;
}

/** The floor plane at or just below `y` (the storey a connector starts on), and the
 *  next plane above it. Returns null when there's no storey above to climb to. */
function gapFor(planes: number[], y: number): { lowerY: number; upperY: number } | null {
  let lowerY = -Infinity;
  for (const p of planes) if (p <= y && p > lowerY) lowerY = p;
  if (lowerY === -Infinity) return null;
  const upperY = planes.find((p) => p > lowerY);
  if (upperY === undefined) return null;
  return { lowerY, upperY };
}

interface Hint {
  /** Footprint column the model anchored the climb at. */
  x: number; z: number;
  /** Ascent unit for a stair hint (undefined for a ladder). */
  dir?: [number, number];
  /** Stair palette state to reuse the material (undefined for a ladder). */
  stairState?: number;
  /** How many cells the hint climbed — used to pick the strongest hint per gap. */
  rise: number;
  /** Every cell of the model's geometry to strip once we've rebuilt the gap. */
  strip: string[];
}

export const rebuildStairwells: Pass = (blocks, palette) => {
  const planes = floorPlanes(blocks, palette);
  if (planes.length < 2) return { blocks, palette }; // single storey — nothing to connect

  const planeSet = new Set(planes);
  const at = new Map<string, AuthoringBlock>();
  for (const b of blocks) at.set(posKey(...b.pos), b);
  const present = (x: number, y: number, z: number): boolean => at.has(posKey(x, y, z));
  const nameOf = (x: number, y: number, z: number): string | undefined => {
    const b = at.get(posKey(x, y, z));
    return b ? palette[b.state]?.Name : undefined;
  };
  const { isShell } = computeEnvelope(blocks, palette);
  const mats = planeMaterials(blocks, palette, planeSet);

  // ── Collect circulation hints, grouped by the storey-gap they serve ─────────────
  // A gap is keyed by its lower floor y. We keep only the strongest hint per gap.
  const byGap = new Map<number, Hint>();
  const consider = (h: Hint, gap: { lowerY: number; upperY: number }): void => {
    const H = gap.upperY - gap.lowerY;
    if (H < 3) return;                       // not a real storey (mezzanine/thin gap)
    if (h.rise < Math.max(2, H - 3)) return; // a decorative stub, not a storey climb
    const prev = byGap.get(gap.lowerY);
    if (!prev) { byGap.set(gap.lowerY, h); return; }
    // Two hints serve the same gap: keep the stronger one as the anchor, but strip
    // BOTH so the loser's broken geometry doesn't linger beside the rebuild.
    const winner = h.rise > prev.rise ? h : prev;
    byGap.set(gap.lowerY, { ...winner, strip: [...prev.strip, ...h.strip] });
  };

  for (const f of findFlights(blocks, palette)) {
    const bottom = f.chain[0].pos;
    const top = f.chain[f.chain.length - 1].pos;
    const gap = gapFor(planes, bottom[1] - 1);
    if (!gap) continue;
    const strip = f.chain.map((t) => posKey(...t.pos));
    // Strip each tread's stringer too (the solid cell directly beneath it, if it's an
    // interior support and not the floor/shell) so a shifted rebuild leaves no diagonal.
    for (const t of f.chain) {
      const [sx, sy, sz] = [t.pos[0], t.pos[1] - 1, t.pos[2]];
      if (present(sx, sy, sz) && !isShell(sx, sy, sz) && !planeSet.has(sy)) strip.push(posKey(sx, sy, sz));
    }
    consider({ x: bottom[0], z: bottom[2], dir: f.dir, stairState: f.chain[0].state, rise: top[1] - bottom[1], strip }, gap);
  }
  for (const run of findLadderRuns(blocks, palette)) {
    const bottom = run.cells[0].pos;
    const top = run.cells[run.cells.length - 1].pos;
    const gap = gapFor(planes, bottom[1] - 1);
    if (!gap) continue;
    consider({ x: bottom[0], z: bottom[2], rise: top[1] - bottom[1], strip: run.cells.map((c) => posKey(...c.pos)) }, gap);
  }

  if (byGap.size === 0) return { blocks, palette }; // no real storey climb to rebuild

  // ── Rebuild one clean connector per gap ─────────────────────────────────────────
  const outPalette = palette.slice();
  const intern = makeIntern(outPalette);
  const reserved = new Set<string>(); // every cell any connector occupies/clears — never overlap
  const stripKeys = new Set<string>();
  const removeKeys = new Set<string>(); // existing solid blocks to carve (headroom/openings/landings)
  const added: AuthoringBlock[] = [];
  let stairs = 0, ladders = 0;
  const warnings: string[] = [];

  const free = (x: number, y: number, z: number): boolean =>
    !isShell(x, y, z) && !reserved.has(posKey(x, y, z));

  // Attempt a straight staircase rising from `lowerY` to `upperY`, anchored at the
  // hint's bottom column + ascent direction. Returns the build plan or null if it
  // can't fit with clearance.
  const planStair = (h: Hint, lowerY: number, upperY: number) => {
    if (!h.dir) return null;
    const [fx, fz] = h.dir;
    const steps = upperY - lowerY;              // treads from lowerY+1 up to upperY
    const treads: [number, number, number][] = [];
    for (let i = 0; i < steps; i++) treads.push([h.x + fx * i, lowerY + 1 + i, h.z + fz * i]);
    const carve: string[] = [];
    const place: AuthoringBlock[] = [];
    const occupy: string[] = []; // cells this connector claims (for collision reservation)
    const soft: [number, number, number][] = []; // best-effort clearance (head bonk / approach furniture)
    const wantClear = (x: number, y: number, z: number): boolean => {
      if (!free(x, y, z)) return false;
      carve.push(posKey(x, y, z));
      occupy.push(posKey(x, y, z));
      return true;
    };
    const floorMat = mats.get(lowerY);
    const stairIdx = intern({
      Name: palette[h.stairState ?? 0]?.Name ?? 'minecraft:oak_stairs',
      Properties: { facing: ascentFacing(fx, fz), half: 'bottom', shape: 'straight', waterlogged: 'false' },
    });
    for (let i = 0; i < steps; i++) {
      const [x, y, z] = treads[i];
      if (isShell(x, y, z) || reserved.has(posKey(x, y, z))) return null; // tread can't land on the skin
      occupy.push(posKey(x, y, z));
      place.push({ state: stairIdx, pos: [x, y, z] });
      // Stringer under each tread so the run never floats (skip the floor/shell).
      const [sx, sy, sz] = [x, y - 1, z];
      if (floorMat !== undefined && !isShell(sx, sy, sz) && !planeSet.has(sy)) {
        place.push({ state: intern(outPalette[floorMat]), pos: [sx, sy, sz] });
        occupy.push(posKey(sx, sy, sz));
      }
      // 2 blocks of headroom over every tread (cuts the stairwell hole through the
      // upper floor where it crosses that plane) + a soft 3rd so the player's head
      // never clips the ceiling/underside of the floor above while climbing.
      if (!wantClear(x, y + 1, z) || !wantClear(x, y + 2, z)) return null;
      soft.push([x, y + 3, z]);
    }
    // Bottom landing: one cell back of the bottom tread, body + head — plus a soft 3rd
    // of height and a 2nd cell of walkway so the approach to the foot of the stair is clear.
    if (!wantClear(h.x - fx, lowerY + 1, h.z - fz) || !wantClear(h.x - fx, lowerY + 2, h.z - fz)) return null;
    soft.push(
      [h.x - fx, lowerY + 3, h.z - fz],
      [h.x - fx * 2, lowerY + 1, h.z - fz * 2], [h.x - fx * 2, lowerY + 2, h.z - fz * 2],
    );
    // Top arrival: one cell forward of the top tread, body + head (you step off here) —
    // plus a soft 3rd of height and a 2nd walkway cell so you can actually walk away.
    const [tx, ty, tz] = treads[steps - 1];
    if (!wantClear(tx + fx, ty + 1, tz + fz) || !wantClear(tx + fx, ty + 2, tz + fz)) return null;
    soft.push(
      [tx + fx, ty + 3, tz + fz],
      [tx + fx * 2, ty + 1, tz + fz * 2], [tx + fx * 2, ty + 2, tz + fz * 2],
    );
    return { place, carve, occupy, soft, kind: 'stair' as const };
  };

  // Attempt a wall ladder rising from `lowerY` to `upperY` at the hint's column.
  const planLadder = (h: Hint, lowerY: number, upperY: number) => {
    const bx = h.x, bz = h.z;
    // A wall the column can hang on: any side that is a solid block for the whole
    // climb — the exterior shell OR a continuous interior wall/pillar (the model's
    // ladders routinely lean on an interior brick wall, not the outer skin).
    const wall = FACINGS.find((w) => {
      for (let y = lowerY + 1; y <= upperY; y++) if (!isSolidSupport(nameOf(bx + w.dx, y, bz + w.dz))) return false;
      return true;
    });
    if (!wall) return null;
    // The rung column itself must sit in the interior, never inside the outer skin.
    for (let y = lowerY + 1; y <= upperY; y++) if (isShell(bx, y, bz)) return null;
    const facing = FACINGS.find((d) => d.dx === -wall.dx && d.dz === -wall.dz)!.facing; // lean away from the wall
    const [fx, fz] = [-wall.dx, -wall.dz];
    const place: AuthoringBlock[] = [];
    const occupy: string[] = [];
    const carve: string[] = [];
    const ladderIdx = intern({ Name: 'minecraft:ladder', Properties: { facing } });
    for (let y = lowerY + 1; y <= upperY; y++) {
      if (reserved.has(posKey(bx, y, bz))) return null;
      // The rung replaces whatever floor/ceiling it threads — `place` wins over the
      // original block at this cell in the final merge, so the shaft is open.
      place.push({ state: ladderIdx, pos: [bx, y, bz] });
      occupy.push(posKey(bx, y, bz));
    }
    // Step off: clear body + head one cell forward at the top floor (you stand on the
    // upper floor block in front of the ladder), never carving the shell.
    for (const dy of [1, 2]) {
      const [ex, ey, ez] = [bx + fx, upperY + dy, bz + fz];
      if (!free(ex, ey, ez)) return null;
      carve.push(posKey(ex, ey, ez));
      occupy.push(posKey(ex, ey, ez));
    }
    // Soft clearance at the top step-off: a 3rd block of headroom + a 2nd walkway cell.
    const soft: [number, number, number][] = [
      [bx + fx, upperY + 3, bz + fz],
      [bx + fx * 2, upperY + 1, bz + fz * 2], [bx + fx * 2, upperY + 2, bz + fz * 2],
    ];
    return { place, carve, occupy, soft, kind: 'ladder' as const };
  };

  // Process gaps bottom-up so a lower flight reserves its cells before a higher one.
  for (const lowerY of [...byGap.keys()].sort((a, b) => a - b)) {
    const h = byGap.get(lowerY) as Hint;
    const gap = gapFor(planes, lowerY);
    if (!gap) continue;
    const plan = planStair(h, gap.lowerY, gap.upperY) ?? planLadder(h, gap.lowerY, gap.upperY);
    if (!plan) {
      warnings.push(
        `Could not fit a clean staircase or wall ladder between the floors at y=${gap.lowerY} and `
        + `y=${gap.upperY} (the climb runs into the shell or another stair). Give the stair a clear `
        + `interior run — keep it one cell off the outer walls with a landing top and bottom, or place `
        + `a ladder column flush against an interior/outer wall.`,
      );
      continue; // leave the model's geometry intact so the gap still has SOME access
    }
    for (const k of h.strip) stripKeys.add(k);
    for (const k of plan.carve) removeKeys.add(k);
    for (const k of plan.occupy) reserved.add(k);
    // Best-effort: clear extra headroom + the immediate approach walkway of whatever the
    // model dumped there (furniture, a skull-on-block, a stray bookshelf), so a decoration
    // never blocks the climb. Never touches the outer shell or a structural floor plane
    // (so we don't punch the building open or drop a second floor hole).
    for (const [x, y, z] of plan.soft) {
      const k = posKey(x, y, z);
      if (!present(x, y, z) || isShell(x, y, z) || planeSet.has(y) || reserved.has(k)) continue;
      removeKeys.add(k);
      reserved.add(k);
    }
    for (const b of plan.place) added.push(b);
    if (plan.kind === 'stair') stairs++; else ladders++;
  }

  if (stairs === 0 && ladders === 0 && warnings.length === 0) return { blocks, palette };

  // Apply: drop the stripped/carved cells, then lay the rebuilt connectors. A placed
  // cell wins over a stripped/carved one at the same position.
  const placedAt = new Set(added.map((b) => posKey(...b.pos)));
  const kept = blocks.filter((b) => {
    const k = posKey(...b.pos);
    if (placedAt.has(k)) return false;
    return !stripKeys.has(k) && !removeKeys.has(k);
  });
  const fixes: string[] = [];
  if (stairs) fixes.push(`rebuilt ${stairs} staircase(s) as a clean climbable flight (full top step, headroom, landings, sized stairwell opening)`);
  if (ladders) fixes.push(`rebuilt ${ladders} cramped staircase(s)/ladder(s) as a flush wall ladder with a carved step-off`);
  return { blocks: kept.concat(added), palette: outPalette, fixes, warnings: warnings.length ? warnings : undefined };
};

/** The `facing` a stair ascends toward, from its ascent unit (dx,dz). */
function ascentFacing(fx: number, fz: number): string {
  if (fx > 0) return 'east';
  if (fx < 0) return 'west';
  if (fz > 0) return 'south';
  return 'north';
}
