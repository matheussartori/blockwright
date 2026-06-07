// The DEFINITIVE vertical-circulation pass. Repairing the model's hand-placed
// stairs in situ was endlessly fragile, so code now OWNS the stairwell: the model
// only tells us WHERE it wanted to climb; this pass throws away the broken geometry
// and rebuilds ONE clean, guaranteed-correct connector per storey-gap.
//
// The rules (from the user's repeated feedback on stairs):
//   1. ALWAYS prefer a real 45° staircase. A clean straight flight whose TOP STEP
//      reaches the upper floor, with the stairwell opening cut through that floor,
//      2 blocks of headroom over every tread, and a standing landing at both ends.
//   2. NO ROOM FOR A STAIR → a flush WALL LADDER, hung on any solid block, running
//      CONTINUOUSLY from the lower floor to the upper floor with no interruptions.
//   3. NEVER break a STRUCTURE block to fit a connector. A connector may only occupy
//      empty cells (or thin decorations it clears) and cut the stairwell opening
//      through the floor plane above — it must never replace a wall/full block. If a
//      stair would run into a wall it simply doesn't fit there → fall back to a ladder.
//   4. NO REMNANTS / NO DOUBLES. Every flight + ladder the model placed for a gap is
//      stripped before the single clean connector is laid, so two climbs can never
//      survive side by side and no broken stub is ever left behind.
//
// The fit test is AIR-BASED, not shell-based: it asks "is this cell empty (or a thin
// decoration / the floor plane I'm opening)?", never "is this the exterior skin?".
// The old envelope/`isShell` test leaked through the model's many window openings on
// porous builds and marked interior circulation cells as shell, so every plan bailed
// and the model's mess was left fully intact — the recurring defect. Roof slopes
// (gables built from stairs) are still excluded via `findFlights` (they top out above
// the ceiling plane), so the roof is never touched.
//
// Runs first in the pipeline; `fixCirculation` still follows as a generic safety net.
import { posKey } from '../geometry';
import { bareId, isAir, makeIntern } from '../palette';
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
 *  material, reused for stringers so a rebuilt stair blends in. */
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
  /** How many cells the hint climbed — used to rank hints per gap. */
  rise: number;
}

/** All the model's circulation geometry that serves one storey-gap: every hint
 *  (a column the player might climb at) plus the union of every cell to strip. */
interface GapWork { hints: Hint[]; strip: Set<string>; }

const DIRS: [number, number][] = [[1, 0], [-1, 0], [0, 1], [0, -1]];

export const rebuildStairwells: Pass = (blocks, palette) => {
  const planes = floorPlanes(blocks, palette);
  if (planes.length < 2) return { blocks, palette }; // single storey — nothing to connect

  const planeSet = new Set(planes);
  const at = new Map<string, AuthoringBlock>();
  let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
  for (const b of blocks) {
    if (isAir(palette[b.state]?.Name ?? '')) continue;
    at.set(posKey(...b.pos), b);
    const [x, , z] = b.pos;
    if (x < minX) minX = x; if (x > maxX) maxX = x;
    if (z < minZ) minZ = z; if (z > maxZ) maxZ = z;
  }
  const nameAt = (x: number, y: number, z: number): string | undefined => {
    const b = at.get(posKey(x, y, z));
    return b ? palette[b.state]?.Name : undefined;
  };
  const mats = planeMaterials(blocks, palette, planeSet);
  // A stair material to reuse for a DERIVED stair (one the model gave only a ladder
  // for): the build's own stairs if it has any, else plain oak.
  const fallbackStairName = palette.find((p) => bareId(p.Name).endsWith('_stairs'))?.Name ?? 'minecraft:oak_stairs';

  // ── Collect every circulation hint, grouped by the storey-gap it serves ─────────
  const byGap = new Map<number, GapWork>();
  const addHint = (h: Hint, strip: string[], gap: { lowerY: number; upperY: number }): void => {
    const H = gap.upperY - gap.lowerY;
    if (H < 3) return;                       // not a real storey (mezzanine/thin gap)
    if (h.rise < Math.max(2, H - 3)) return; // a decorative stub, not a storey climb
    const w = byGap.get(gap.lowerY) ?? { hints: [], strip: new Set<string>() };
    w.hints.push(h);
    for (const k of strip) w.strip.add(k);
    byGap.set(gap.lowerY, w);
  };

  for (const f of findFlights(blocks, palette)) {
    const bottom = f.chain[0].pos;
    const top = f.chain[f.chain.length - 1].pos;
    const gap = gapFor(planes, bottom[1] - 1);
    if (!gap) continue;
    const strip = f.chain.map((t) => posKey(...t.pos));
    // Strip each tread's stringer too (the solid cell directly beneath it, if it's an
    // interior support and not the floor) so a shifted rebuild leaves no diagonal.
    for (const t of f.chain) {
      const [sx, sy, sz] = [t.pos[0], t.pos[1] - 1, t.pos[2]];
      const below = at.get(posKey(sx, sy, sz));
      if (below && !planeSet.has(sy) && isStructuralFull(palette, below.state)) strip.push(posKey(sx, sy, sz));
    }
    addHint({ x: bottom[0], z: bottom[2], dir: f.dir, stairState: f.chain[0].state, rise: top[1] - bottom[1] }, strip, gap);
  }
  for (const run of findLadderRuns(blocks, palette)) {
    const bottom = run.cells[0].pos;
    const top = run.cells[run.cells.length - 1].pos;
    const gap = gapFor(planes, bottom[1] - 1);
    if (!gap) continue;
    addHint(
      { x: bottom[0], z: bottom[2], rise: top[1] - bottom[1] },
      run.cells.map((c) => posKey(...c.pos)), gap,
    );
  }

  if (byGap.size === 0) return { blocks, palette }; // no real storey climb to rebuild

  // ── Rebuild one clean connector per gap ─────────────────────────────────────────
  const outPalette = palette.slice();
  const intern = makeIntern(outPalette);
  const reserved = new Set<string>(); // every cell any connector occupies — never overlap
  const stripKeys = new Set<string>();
  const removeKeys = new Set<string>(); // existing cells to carve (the floor opening / thin decor)
  const added: AuthoringBlock[] = [];
  let stairs = 0, ladders = 0;
  const warnings: string[] = [];

  // What a cell is, from the connector's point of view. A connector may freely occupy
  // or carve anything that is NOT a wall and NOT already claimed by another connector:
  //   air   — empty
  //   plane — a floor-plane block (carving it IS the stairwell opening / top step)
  //   thin  — a non-structural block (decoration / the model's own old stairs+ladders)
  //   wall  — a structural full block NOT on a floor plane → must never be broken
  const cellKind = (x: number, y: number, z: number): 'air' | 'plane' | 'thin' | 'wall' | 'reserved' => {
    const k = posKey(x, y, z);
    if (reserved.has(k)) return 'reserved';
    const b = at.get(k);
    if (!b) return 'air';
    if (isAir(palette[b.state]?.Name ?? '')) return 'air';
    if (planeSet.has(y)) return 'plane';
    if (!isStructuralFull(palette, b.state)) return 'thin';
    return 'wall';
  };
  const passable = (x: number, y: number, z: number): boolean => {
    const k = cellKind(x, y, z);
    return k !== 'wall' && k !== 'reserved';
  };
  const occupied = (x: number, y: number, z: number): boolean => at.has(posKey(x, y, z));

  // Plan a straight staircase rising lowerY→upperY, anchored at (ax,az) ascending
  // (fx,fz). Returns the build plan, or null when it can't fit without breaking a wall.
  const planStair = (ax: number, az: number, dir: [number, number], stairName: string, lowerY: number, upperY: number) => {
    const [fx, fz] = dir;
    const steps = upperY - lowerY;                 // treads from lowerY+1 up to upperY
    const place: AuthoringBlock[] = [];
    const carve: string[] = [];
    const occupy: string[] = [];                   // cells this connector claims (collision reservation)
    const claim = (x: number, y: number, z: number): boolean => {
      if (!passable(x, y, z)) return false;
      occupy.push(posKey(x, y, z));
      if (occupied(x, y, z)) carve.push(posKey(x, y, z)); // a plane/thin block we clear
      return true;
    };
    // Best-effort extra clearance: clear a cell IF it is air/thin or the upper floor we
    // open — never a wall and never a DIFFERENT floor plane. Used for the 3rd block of
    // headroom; never fails the fit, so it only ever enlarges the opening, never blocks it.
    const soften = (x: number, y: number, z: number): void => {
      const k = posKey(x, y, z);
      if (reserved.has(k)) return;
      const kind = cellKind(x, y, z);
      if (kind === 'wall' || kind === 'reserved') return;
      if (kind === 'plane' && y !== upperY) return; // don't punch a floor that isn't the one we open
      occupy.push(k);
      if (occupied(x, y, z)) carve.push(k);
    };
    const stairIdx = intern({
      Name: stairName,
      Properties: { facing: ascentFacing(fx, fz), half: 'bottom', shape: 'straight', waterlogged: 'false' },
    });
    const floorMat = mats.get(lowerY);
    for (let i = 0; i < steps; i++) {
      const x = ax + fx * i, y = lowerY + 1 + i, z = az + fz * i;
      if (!passable(x, y, z)) return null;         // the tread would land in a wall
      occupy.push(posKey(x, y, z));
      place.push({ state: stairIdx, pos: [x, y, z] });
      // Stringer under each tread so the run never floats (only fill empty/thin gaps,
      // never the floor plane and never atop an existing wall/support).
      const sy = y - 1;
      if (floorMat !== undefined && !planeSet.has(sy)) {
        const below = cellKind(x, sy, z);
        if (below === 'air' || below === 'thin') {
          place.push({ state: intern(outPalette[floorMat]), pos: [x, sy, z] });
          occupy.push(posKey(x, sy, z));
          if (occupied(x, sy, z)) carve.push(posKey(x, sy, z));
        }
      }
      // 2 blocks of headroom over every tread are REQUIRED (this cuts the stairwell
      // opening through the upper floor where the run crosses that plane); a 3rd is
      // cleared best-effort so a climbing — or jumping — player never bumps their head
      // on the floor edge as they emerge (the in-game "bate a cabeça" defect). The 3rd
      // enlarges the opening one row exactly where the stairs pierce the floor.
      if (!claim(x, y + 1, z) || !claim(x, y + 2, z)) return null;
      soften(x, y + 3, z);
    }
    // Bottom landing: one cell back of the bottom tread, body + head (+ a soft 3rd).
    if (!claim(ax - fx, lowerY + 1, az - fz) || !claim(ax - fx, lowerY + 2, az - fz)) return null;
    soften(ax - fx, lowerY + 3, az - fz);
    // Top arrival: one cell forward of the top tread, body + head (you step off here) +
    // a soft 3rd so the head clears the ceiling as you walk off onto the upper floor.
    const tx = ax + fx * (steps - 1), ty = upperY, tz = az + fz * (steps - 1);
    if (!claim(tx + fx, ty + 1, tz + fz) || !claim(tx + fx, ty + 2, tz + fz)) return null;
    soften(tx + fx, ty + 3, tz + fz);
    return { place, carve, occupy, kind: 'stair' as const };
  };

  // Plan a CONTINUOUS wall ladder rising lowerY→upperY at column (bx,bz). Returns the
  // build plan or null when no side offers a solid backing for the whole climb or the
  // shaft would run through a wall.
  const planLadder = (bx: number, bz: number, lowerY: number, upperY: number) => {
    // Every rung cell must be free (air / a floor plane we punch / a thin block we clear).
    for (let y = lowerY + 1; y <= upperY; y++) if (!passable(bx, y, bz)) return null;
    // A side with a solid backing for the whole climb — the outer skin OR a continuous
    // interior wall/pillar. (The top rung's backing may be the upper floor block.)
    const wall = FACINGS.find((w) => {
      for (let y = lowerY + 1; y <= upperY; y++) if (!isSolidSupport(nameAt(bx + w.dx, y, bz + w.dz))) return false;
      return true;
    });
    if (!wall) return null;
    const facing = FACINGS.find((d) => d.dx === -wall.dx && d.dz === -wall.dz)!.facing; // lean away from the wall
    const [fx, fz] = [-wall.dx, -wall.dz];
    // Step off: clear body + head one cell forward at the top floor.
    if (!passable(bx + fx, upperY + 1, bz + fz) || !passable(bx + fx, upperY + 2, bz + fz)) return null;
    const place: AuthoringBlock[] = [];
    const occupy: string[] = [];
    const carve: string[] = [];
    const ladderIdx = intern({ Name: 'minecraft:ladder', Properties: { facing } });
    for (let y = lowerY + 1; y <= upperY; y++) {
      place.push({ state: ladderIdx, pos: [bx, y, bz] });
      occupy.push(posKey(bx, y, bz));
      if (occupied(bx, y, bz)) carve.push(posKey(bx, y, bz));
    }
    // Step-off clearance forward of the top: body + head (required) + a soft 3rd, and a
    // soft cell directly above the top rung — so the climber can rise out of the shaft
    // and walk off without clipping the ceiling (the ladder "bate a cabeça" at the exit).
    for (const dy of [1, 2]) {
      const [ex, ey, ez] = [bx + fx, upperY + dy, bz + fz];
      occupy.push(posKey(ex, ey, ez));
      if (occupied(ex, ey, ez)) carve.push(posKey(ex, ey, ez));
    }
    for (const [sx, sy, sz] of [[bx + fx, upperY + 3, bz + fz], [bx, upperY + 1, bz]] as const) {
      const k = posKey(sx, sy, sz);
      if (reserved.has(k)) continue;
      const kind = cellKind(sx, sy, sz);
      if (kind === 'wall' || kind === 'reserved') continue;
      if (kind === 'plane' && sy !== upperY) continue;
      occupy.push(k);
      if (occupied(sx, sy, sz)) carve.push(k);
    }
    return { place, carve, occupy, kind: 'ladder' as const };
  };

  type Plan = NonNullable<ReturnType<typeof planStair>> | NonNullable<ReturnType<typeof planLadder>> | null;
  // Build the single best connector for a gap, preferring a stair (rule 1).
  const planConnector = (work: GapWork, lowerY: number, upperY: number): Plan => {
    const hints = [...work.hints].sort((a, b) => b.rise - a.rise);
    // 1) The model's own stair flights, strongest first (known-good column + facing).
    for (const h of hints) {
      if (!h.dir) continue;
      const p = planStair(h.x, h.z, h.dir, palette[h.stairState ?? 0]?.Name ?? fallbackStairName, lowerY, upperY);
      if (p) return p;
    }
    // 2) DERIVE a stair: try every hint column in all four directions, so we still get a
    //    real staircase even where the model only placed a (cramped) ladder.
    for (const h of hints) for (const d of DIRS) {
      const p = planStair(h.x, h.z, d, fallbackStairName, lowerY, upperY);
      if (p) return p;
    }
    // 3) No stair fits → a continuous wall ladder at the strongest hint column.
    for (const h of hints) {
      const p = planLadder(h.x, h.z, lowerY, upperY);
      if (p) return p;
    }
    // 4) Last resort: scan interior columns (those standing on this storey's floor) for
    //    any column a clean ladder fits, nearest to a hint — so we never bail and leave
    //    the model's broken geometry behind.
    const anchor = hints[0];
    let best: Plan = null, bestD = Infinity;
    for (let x = minX + 1; x <= maxX - 1; x++) for (let z = minZ + 1; z <= maxZ - 1; z++) {
      if (cellKind(x, lowerY, z) !== 'plane') continue; // must stand on this floor
      const d = Math.abs(x - anchor.x) + Math.abs(z - anchor.z);
      if (d >= bestD) continue;
      const p = planLadder(x, z, lowerY, upperY);
      if (p) { best = p; bestD = d; }
    }
    return best;
  };

  // Process gaps bottom-up so a lower connector reserves its cells before a higher one.
  for (const lowerY of [...byGap.keys()].sort((a, b) => a - b)) {
    const work = byGap.get(lowerY) as GapWork;
    const gap = gapFor(planes, lowerY);
    if (!gap) continue;
    const plan = planConnector(work, gap.lowerY, gap.upperY);
    if (!plan) {
      warnings.push(
        `Could not fit a clean staircase or wall ladder between the floors at y=${gap.lowerY} and `
        + `y=${gap.upperY}. Leave a clear interior column for the climb — a stair needs an open `
        + `diagonal run with a landing top and bottom, or a ladder needs a column flush against a wall.`,
      );
      continue; // leave the model's geometry intact so the gap still has SOME access
    }
    // SUCCESS → strip every flight/ladder the model placed for this gap (rule 4: no
    // doubles, no remnants), carve the opening, reserve the connector's cells, and lay it.
    for (const k of work.strip) stripKeys.add(k);
    for (const k of plan.carve) removeKeys.add(k);
    for (const k of plan.occupy) reserved.add(k);
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
  let result = kept.concat(added);

  // ── Refill orphaned stairwell-remnant holes (rule 4, the FLOOR side) ─────────
  // Stripping the model's old climb removes its treads, but the opening it had cut
  // through the floor ABOVE was already air, so it survives as a bare interior hole
  // sitting beside the clean rebuilt connector — the "buraco misterioso" the user
  // kept finding on every storey but the attic. Find each interior floor-plane hole
  // that (a) no connector passes through and (b) still sits over geometry we stripped,
  // and floor it back with that plane's own material.
  const patched = patchOrphanHoles(result, outPalette, planes, mats, reserved, stripKeys, minX, maxX, minZ, maxZ);
  result = patched.blocks;

  const fixes: string[] = [];
  if (stairs) fixes.push(`rebuilt ${stairs} staircase(s) as a clean climbable flight (full top step, headroom, landings, sized stairwell opening)`);
  if (ladders) fixes.push(`rebuilt ${ladders} cramped staircase(s)/ladder(s) as a continuous flush wall ladder`);
  if (patched.filled) fixes.push(`floored over ${patched.filled} orphan stairwell-remnant hole(s) left where the old climb was removed`);
  return { blocks: result, palette: outPalette, fixes, warnings: warnings.length ? warnings : undefined };
};

/** Refill the floor-plane holes left behind when an old climb is stripped. For each
 *  storey plane, flood the footprint from its border through non-floor cells; any open
 *  cell the flood can't reach is an INTERIOR hole. A hole CLUSTER is kept open only when
 *  the rebuilt connector cut it (any cell is in `reserved` — its precise opening). A
 *  cluster the connector never claimed but that still sits over geometry we stripped is
 *  an orphan remnant → floored with the plane's dominant material. (Deliberate voids — an
 *  atrium the model never built a climb into — were never stripped, so they're left.) */
function patchOrphanHoles(
  blocks: AuthoringBlock[],
  palette: AuthoringPaletteEntry[],
  planes: number[],
  mats: Map<number, number>,
  reserved: Set<string>,
  stripKeys: Set<string>,
  minX: number, maxX: number, minZ: number, maxZ: number,
): { blocks: AuthoringBlock[]; filled: number } {
  if (stripKeys.size === 0) return { blocks, filled: 0 };
  const finalAt = new Map<string, AuthoringBlock>();
  for (const b of blocks) finalAt.set(posKey(...b.pos), b);
  const solidPlane = (x: number, y: number, z: number): boolean => {
    const b = finalAt.get(posKey(x, y, z));
    return !!b && isStructuralFull(palette, b.state);
  };
  const fill: AuthoringBlock[] = [];
  for (let pi = 0; pi < planes.length; pi++) {
    const py = planes[pi];
    const mat = mats.get(py);
    if (mat === undefined) continue;
    const prev = pi > 0 ? planes[pi - 1] : py - 1; // scan the column down to (not incl.) the plane beneath
    const open = (x: number, z: number): boolean => !solidPlane(x, py, z);
    // Flood from the bounding-box border; unreached open cells are interior holes.
    const seen = new Set<string>();
    const stack: [number, number][] = [];
    for (let x = minX - 1; x <= maxX + 1; x++) { stack.push([x, minZ - 1]); stack.push([x, maxZ + 1]); }
    for (let z = minZ - 1; z <= maxZ + 1; z++) { stack.push([minX - 1, z]); stack.push([maxX + 1, z]); }
    while (stack.length) {
      const [x, z] = stack.pop() as [number, number];
      if (x < minX - 1 || x > maxX + 1 || z < minZ - 1 || z > maxZ + 1) continue;
      const k = `${x},${z}`;
      if (seen.has(k) || !open(x, z)) continue;
      seen.add(k);
      stack.push([x + 1, z], [x - 1, z], [x, z + 1], [x, z - 1]);
    }
    // Cluster the unreached open cells.
    const hset = new Set<string>();
    for (let x = minX; x <= maxX; x++) for (let z = minZ; z <= maxZ; z++) {
      if (open(x, z) && !seen.has(`${x},${z}`)) hset.add(`${x},${z}`);
    }
    const done = new Set<string>();
    for (const cell of hset) {
      if (done.has(cell)) continue;
      const cluster: [number, number][] = [];
      const st: [number, number][] = [cell.split(',').map(Number) as [number, number]];
      while (st.length) {
        const [x, z] = st.pop() as [number, number];
        const k = `${x},${z}`;
        if (done.has(k) || !hset.has(k)) continue;
        done.add(k);
        cluster.push([x, z]);
        st.push([x + 1, z], [x - 1, z], [x, z + 1], [x, z - 1]);
      }
      let hasConnector = false, overStrip = false;
      for (const [x, z] of cluster) {
        if (reserved.has(posKey(x, py, z))) hasConnector = true;
        for (let y = py; y > prev; y--) if (stripKeys.has(posKey(x, y, z))) overStrip = true;
      }
      if (hasConnector || !overStrip) continue; // active stairwell, or a deliberate void
      for (const [x, z] of cluster) {
        if (reserved.has(posKey(x, py, z))) continue;
        fill.push({ state: mat, pos: [x, py, z] });
      }
    }
  }
  return fill.length ? { blocks: blocks.concat(fill), filled: fill.length } : { blocks, filled: 0 };
}

/** The `facing` a stair ascends toward, from its ascent unit (dx,dz). */
function ascentFacing(fx: number, fz: number): string {
  if (fx > 0) return 'east';
  if (fx < 0) return 'west';
  if (fz > 0) return 'south';
  return 'north';
}
