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
//   5. EVERY STOREY GAP GETS A CONNECTOR — even one the model never attempted a climb
//      for (planned from scratch, stacked over the connector below). The only gap not
//      forced is a topmost one whose upper plane is a bare ceiling deck with no
//      standing room above it (no attic to reach).
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
 *  block you actually walk on — in `planes` (ascending); `runTop` maps EVERY member y
 *  of a run to that top, so a connector knows the lower slab of a double-thick floor
 *  is still carvable floor (not a protected wall) when it cuts its opening. */
function floorPlanes(
  blocks: AuthoringBlock[], palette: AuthoringPaletteEntry[],
): { planes: number[]; runTop: Map<number, number> } {
  const perY = new Map<number, number>();
  for (const b of blocks) {
    if (!isStructuralFull(palette, b.state)) continue;
    perY.set(b.pos[1], (perY.get(b.pos[1]) ?? 0) + 1);
  }
  if (perY.size === 0) return { planes: [], runTop: new Map() };
  const max = Math.max(...perY.values());
  const raw = [...perY.entries()].filter(([, c]) => c >= 0.6 * max).map(([y]) => y).sort((a, b) => a - b);
  // Collapse consecutive ys to the top of each run (the walkable surface block).
  const planes: number[] = [];
  const runTop = new Map<number, number>();
  let run: number[] = [];
  for (let i = 0; i < raw.length; i++) {
    run.push(raw[i]);
    if (i + 1 < raw.length && raw[i + 1] === raw[i] + 1) continue;
    planes.push(raw[i]);
    for (const y of run) runTop.set(y, raw[i]);
    run = [];
  }
  return { planes, runTop };
}

/** Merge the AUTHORITATIVE storey planes (from the build's labelled floors, threaded via
 *  `ctx.floorPlanes`) into the geometric detection — the union, with each added plane
 *  mapped to ITSELF in `runTop` (a single-thickness slab). So a storey the 60%-of-busiest
 *  cut missed — a house with a big yard whose grade plane dwarfs the floors, or any porous
 *  build — is still recognised and connected, without losing the geometric double-thick
 *  floor info the carve logic relies on. No authoritative planes → geometric result as-is. */
function mergedPlanes(
  geo: { planes: number[]; runTop: Map<number, number> },
  authoritative: number[] | undefined,
): { planes: number[]; runTop: Map<number, number> } {
  if (!authoritative?.length) return geo;
  const runTop = new Map(geo.runTop);
  const set = new Set(geo.planes);
  for (const y of authoritative) {
    if (!set.has(y)) set.add(y);
    if (!runTop.has(y)) runTop.set(y, y);
  }
  return { planes: [...set].sort((a, b) => a - b), runTop };
}

/** The largest 4-connected component of the structural-full FLOOR cells on plane `py`,
 *  as a bbox + size. Using the LARGEST component (not the raw bbox) rejects a handful of
 *  stray cells at that level — a stair landing poking out, a yard fixture's top — that
 *  would otherwise balloon the box past the real floor. Null when the plane has no slab. */
function planeFootprint(
  blocks: AuthoringBlock[], palette: AuthoringPaletteEntry[], py: number,
): { minX: number; maxX: number; minZ: number; maxZ: number; size: number } | null {
  const cells = new Set<string>();
  for (const b of blocks) {
    if (b.pos[1] !== py || !isStructuralFull(palette, b.state)) continue;
    cells.add(`${b.pos[0]},${b.pos[2]}`);
  }
  if (cells.size === 0) return null;
  const seen = new Set<string>();
  let best: [number, number][] = [];
  for (const c of cells) {
    if (seen.has(c)) continue;
    const comp: [number, number][] = [];
    const st = [c];
    while (st.length) {
      const k = st.pop() as string;
      if (seen.has(k) || !cells.has(k)) continue;
      seen.add(k);
      const [x, z] = k.split(',').map(Number);
      comp.push([x, z]);
      st.push(`${x + 1},${z}`, `${x - 1},${z}`, `${x},${z + 1}`, `${x},${z - 1}`);
    }
    if (comp.length > best.length) best = comp;
  }
  let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
  for (const [x, z] of best) {
    if (x < minX) minX = x; if (x > maxX) maxX = x; if (z < minZ) minZ = z; if (z > maxZ) maxZ = z;
  }
  return { minX, maxX, minZ, maxZ, size: best.length };
}

/** The HOUSE footprint a connector must stay inside — the union of the ABOVE-GRADE storey
 *  planes' largest floor components. A build with a big SURROUNDINGS yard fills the whole
 *  box at grade (the lawn), so the raw block bounds are the YARD, not the house, and a
 *  derived stair happily climbs out onto the lawn / a graveyard tree (the "escada no
 *  exterior" defect the user kept hitting). Above-grade planes are house-only (the yard is
 *  ground-level landscaping), so their floor footprint is the real house. Falls back to the
 *  raw bounds when nothing above grade is usable — a free-form / yard-less build, where the
 *  raw bounds ARE the house, so the behaviour is unchanged there. */
function houseFootprint(
  blocks: AuthoringBlock[], palette: AuthoringPaletteEntry[], planes: number[], grade: number,
  fallback: { minX: number; maxX: number; minZ: number; maxZ: number },
): { minX: number; maxX: number; minZ: number; maxZ: number } {
  let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
  for (const py of planes) {
    if (py <= grade) continue; // the grade plane carries the yard; above it is house-only
    const fp = planeFootprint(blocks, palette, py);
    if (!fp || fp.size < 9) continue; // ignore a sliver (a partial deck / a stray cluster)
    if (fp.minX < minX) minX = fp.minX; if (fp.maxX > maxX) maxX = fp.maxX;
    if (fp.minZ < minZ) minZ = fp.minZ; if (fp.maxZ > maxZ) maxZ = fp.maxZ;
  }
  return minX === Infinity ? fallback : { minX, maxX, minZ, maxZ };
}

/** Ground / loose-fill blocks that read as TERRAIN, never construction: the surroundings
 *  yard's dirt/grass dominates the grade plane, and reusing it for a stair's treads/stringers
 *  put DIRT in a stone staircase (the "dirt na escada" defect). A derived stair must blend
 *  with the BUILD, so these are skipped when picking a plane's material. */
const GROUND_BLOCKS = new Set([
  'dirt', 'grass_block', 'coarse_dirt', 'rooted_dirt', 'podzol', 'mycelium', 'dirt_path',
  'farmland', 'mud', 'sand', 'red_sand', 'gravel', 'clay', 'snow_block', 'grass_path',
]);
function isGroundMaterial(name: string): boolean {
  return GROUND_BLOCKS.has(bareId(name ?? ''));
}

/** The dominant (most common) full CONSTRUCTION block of each given plane — its real floor
 *  material, reused for stringers so a rebuilt stair blends in. Terrain (dirt/grass/sand…) is
 *  excluded so a stair opening onto the yard's grade plane never inherits its dirt. A plane
 *  with only terrain yields no entry (the caller falls back to the build's stair material). */
function planeMaterials(
  blocks: AuthoringBlock[], palette: AuthoringPaletteEntry[], planes: Set<number>,
): Map<number, number> {
  const tally = new Map<number, Map<number, number>>();
  for (const b of blocks) {
    const y = b.pos[1];
    if (!planes.has(y) || !isStructuralFull(palette, b.state)) continue;
    if (isGroundMaterial(palette[b.state]?.Name ?? '')) continue; // never a terrain block
    const m = tally.get(y) ?? new Map<number, number>();
    m.set(b.state, (m.get(b.state) ?? 0) + 1);
    tally.set(y, m);
  }
  const out = new Map<number, number>();
  for (const [y, m] of tally) {
    let best = -1, bestCount = -1;
    for (const [state, c] of m) if (c > bestCount) { bestCount = c; best = state; }
    if (best >= 0) out.set(y, best);
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

/** Split one continuous climb across every storey gap it rises through. A single
 *  ladder from the cellar to the attic serves SEVERAL gaps, and each gap must get
 *  its own hint + strip segment — attributing the whole run to its bottom gap let
 *  the cellar rebuild strip the run wholesale and DELETE the upper floors' only
 *  climb (the "no stairs between floor 1 and 2" defect on tall builds). Cells
 *  below the lowest plane fold into the first gap; cells above the top plane are
 *  dropped (roof decor, never storey circulation). */
function segmentByGap<T extends { pos: [number, number, number] }>(
  cells: T[], planes: number[],
): { gap: { lowerY: number; upperY: number }; cells: T[] }[] {
  const segs = new Map<number, { gap: { lowerY: number; upperY: number }; cells: T[] }>();
  for (const c of cells) {
    const gap = gapFor(planes, Math.max(c.pos[1] - 1, planes[0]));
    if (!gap) continue;
    const s = segs.get(gap.lowerY) ?? { gap, cells: [] };
    s.cells.push(c);
    segs.set(gap.lowerY, s);
  }
  return [...segs.values()];
}

/** All the model's circulation geometry that serves one storey-gap: every hint
 *  (a column the player might climb at) plus the union of every cell to strip. */
interface GapWork { hints: Hint[]; strip: Set<string>; }

const DIRS: [number, number][] = [[1, 0], [-1, 0], [0, 1], [0, -1]];

export const rebuildStairwells: Pass = (blocks, palette, ctx) => {
  const { planes, runTop } = mergedPlanes(floorPlanes(blocks, palette), ctx.floorPlanes);
  if (planes.length < 2) {
    // Single storey — nothing to connect. But if the build carries a REAL storey climb
    // (a narrow flight or a ladder rising ≥3) the plane detection itself likely failed
    // (one dominant slab dwarfing the real floors under the 60% cut) — say so instead
    // of bailing mutely and leaving broken circulation untouched.
    if (hasUnservedClimb(blocks, palette)) {
      return {
        blocks, palette,
        warnings: [
          'A staircase/ladder climbs 3+ blocks but no two storey floor planes were recognised, so '
          + 'vertical circulation was left as authored. If this build has real storeys, give each one '
          + 'a (mostly) full floor slab spanning the footprint so the storey planes are detectable.',
        ],
      };
    }
    return { blocks, palette };
  }

  // The output palette is declared up front so every lookup below reads it: it shares
  // the input palette's indices (append-only via `intern`), so blocks PLACED by an
  // earlier connector — whose states may be new entries — still resolve for later gaps.
  const outPalette = palette.slice();
  const intern = makeIntern(outPalette);

  const planeSet = new Set(planes);
  const at = new Map<string, AuthoringBlock>();
  let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity, maxY = -Infinity;
  for (const b of blocks) {
    if (isAir(palette[b.state]?.Name ?? '')) continue;
    at.set(posKey(...b.pos), b);
    const [x, y, z] = b.pos;
    if (x < minX) minX = x; if (x > maxX) maxX = x;
    if (z < minZ) minZ = z; if (z > maxZ) maxZ = z;
    if (y > maxY) maxY = y;
  }
  const nameAt = (x: number, y: number, z: number): string | undefined => {
    const b = at.get(posKey(x, y, z));
    return b ? outPalette[b.state]?.Name : undefined;
  };
  // Is there a solid, structural-full block at this exact cell? (Used to tell a real
  // floor surface from a WALL column that merely passes through the floor level.)
  const structuralAt = (x: number, y: number, z: number): boolean => {
    const b = at.get(posKey(x, y, z));
    return !!b && !isAir(outPalette[b.state]?.Name ?? '') && isStructuralFull(outPalette, b.state);
  };
  const mats = planeMaterials(blocks, palette, planeSet);
  // A stair material to reuse for a DERIVED stair (one the model gave only a ladder
  // for): the build's own stairs if it has any, else plain oak.
  const fallbackStairName = palette.find((p) => bareId(p.Name).endsWith('_stairs'))?.Name ?? 'minecraft:oak_stairs';

  // BELOW-GRADE circulation is CODE-OWNED: a structure type's basement vault stack ships
  // its own descent ladder (composeBasementStack), landing inside the house. This pass must
  // NOT detect those basement planes as gaps and rebuild a connector in the wrong column
  // (the "ladder under the yard, levels unreachable" defect). So every gap whose UPPER plane
  // is at or below grade is skipped — the pass owns only the above-grade storeys. `grade` is
  // the ground-floor Y (undefined → nothing below grade, the old behaviour).
  const grade = ctx.grade ?? -Infinity;
  const belowGrade = (gap: { upperY: number }): boolean => gap.upperY <= grade;
  // The authoritative code-built SHELL cells (floor decks/roof/walls/tower). A connector may
  // never occupy or pierce one — the geometric structural test misfires on glass/stairs/slab
  // walls (a stair then marched straight through the exterior wall, P1). A locked cell that
  // is a carvable floor SURFACE is left alone here (cellKind still opens the stairwell through
  // it); only a locked NON-floor block is forced to read as an immovable wall.
  const lockSet = new Set<string>((ctx.lockCells ?? []).map((c) => posKey(...c.pos)));

  // The HOUSE footprint (above-grade storey planes), NOT the raw box — which a surroundings
  // yard inflates to the whole lawn. Every connector's landings/arrival/scan are clamped to
  // this so a stair can never be planned out on the yard (the "escada no exterior" defect).
  // `inHouse` is the strict-interior test (excludes the perimeter wall ring).
  const { minX: hMinX, maxX: hMaxX, minZ: hMinZ, maxZ: hMaxZ } =
    houseFootprint(blocks, palette, planes, grade, { minX, maxX, minZ, maxZ });
  const inHouse = (x: number, z: number): boolean => x > hMinX && x < hMaxX && z > hMinZ && z < hMaxZ;

  // ── Collect every circulation hint, grouped by the storey-gap it serves ─────────
  const byGap = new Map<number, GapWork>();
  const addHint = (h: Hint, strip: string[], gap: { lowerY: number; upperY: number }): void => {
    const H = gap.upperY - gap.lowerY;
    if (H < 3) return; // not a real storey (mezzanine/thin gap)
    if (belowGrade(gap)) return; // code owns below-grade circulation; don't strip/rebuild it
    // A hint must have climbed MOST of its gap — but in a very tall storey a PARTIAL
    // climb (the model ran out of steam) is still clearly a circulation attempt, never
    // decor, so the bar is capped: 6 treads for a stair, 4 rungs for a ladder. Short
    // decorative stubs (porch steps, a bunk-bed ladder) stay below it.
    if (h.rise < Math.min(Math.max(2, H - 3), h.dir ? 6 : 4)) return;
    const w = byGap.get(gap.lowerY) ?? { hints: [], strip: new Set<string>() };
    w.hints.push(h);
    for (const k of strip) w.strip.add(k);
    byGap.set(gap.lowerY, w);
  };

  // The model often ALSO digs its OWN stair down to a code-owned basement, leaving TWO ways
  // down (the user's "duas escadas para o basement; a de stairs está bloqueada"). The central
  // basement ships ONE authoritative descent LADDER (composeBasementStack); below-grade gaps
  // are never rebuilt here, so when a below-grade ladder is present we strip the model's
  // competing below-grade STAIR flights (never a ladder, so the real descent always survives)
  // → exactly one way down. Gated on an existing below-grade ladder so a build whose only
  // basement access IS a stair is never left unreachable.
  const ladderRuns = findLadderRuns(blocks, palette);
  const hasBelowGradeLadder = grade > -Infinity && ladderRuns.some((r) => r.cells.some((c) => c.pos[1] < grade));
  const belowGradeStripStairs = new Set<string>();
  let basementStairsRemoved = 0;

  // The roof-slope cut for flight detection: the top MERGED storey plane (geometric ∪
  // authoritative). This rescues flights on a yarded build, where the geometric ceiling
  // alone collapses to the dominating ground plane and every interior stair is misread as
  // a roof slope (then dropped → the pass adds a SECOND staircase from scratch, doubling).
  const ceilFloor = planes[planes.length - 1];
  for (const f of findFlights(blocks, palette, { ceilFloor })) {
    for (const seg of segmentByGap(f.chain, planes)) {
      const bottom = seg.cells[0].pos;
      const top = seg.cells[seg.cells.length - 1].pos;
      const strip = seg.cells.map((t) => posKey(...t.pos));
      // Strip each tread's stringer too (the solid cell directly beneath it, if it's an
      // interior support and not the floor) so a shifted rebuild leaves no diagonal.
      for (const t of seg.cells) {
        const [sx, sy, sz] = [t.pos[0], t.pos[1] - 1, t.pos[2]];
        const below = at.get(posKey(sx, sy, sz));
        // `runTop` (not the collapsed tops) so the lower slab of a double-thick floor is
        // recognised as floor, never stripped as a stringer.
        if (below && !runTop.has(sy) && isStructuralFull(palette, below.state)) strip.push(posKey(sx, sy, sz));
      }
      // A below-grade stair flight competing with the code descent ladder → strip it.
      if (hasBelowGradeLadder && belowGrade(seg.gap) && top[1] - bottom[1] >= 3) {
        let any = false;
        for (const k of strip) if (!lockSet.has(k)) { belowGradeStripStairs.add(k); any = true; }
        if (any) basementStairsRemoved++;
      }
      addHint({ x: bottom[0], z: bottom[2], dir: f.dir, stairState: seg.cells[0].state, rise: top[1] - bottom[1] }, strip, seg.gap);
    }
  }
  for (const run of ladderRuns) {
    for (const seg of segmentByGap(run.cells, planes)) {
      const bottom = seg.cells[0].pos;
      const top = seg.cells[seg.cells.length - 1].pos;
      addHint(
        { x: bottom[0], z: bottom[2], rise: top[1] - bottom[1] },
        seg.cells.map((c) => posKey(...c.pos)), seg.gap,
      );
    }
  }

  // ── EVERY storey gap must end with a connector (the invariant) ──────────────────
  // A gap the model never attempted ANY climb for still gets an entry — planned from
  // scratch by the column scan in `planConnector` — instead of being silently skipped
  // (storeys with no stairs at all were left unreachable). The TOPMOST gap is only
  // forced when there is real standing room above its upper plane (a usable attic);
  // otherwise that plane is just the ceiling deck and a cottage would get a ladder to
  // its own roof.
  const habitableAbove = (py: number): boolean => {
    let floor = 0, standing = 0;
    for (let x = hMinX; x <= hMaxX; x++) for (let z = hMinZ; z <= hMaxZ; z++) {
      const b = at.get(posKey(x, py, z));
      if (!b || !isStructuralFull(outPalette, b.state)) continue;
      floor++;
      if (at.has(posKey(x, py + 1, z)) || at.has(posKey(x, py + 2, z))) continue; // no headroom
      // ENCLOSED standing room only: some structure higher up the column (a roof over an
      // attic). An uncovered deck is the build's rooftop — open sky doesn't count, or a
      // flat-roofed cottage would grow a ladder to its own roof.
      let covered = false;
      for (let y = py + 3; y <= maxY && !covered; y++) covered = at.has(posKey(x, y, z));
      if (covered) standing++;
    }
    return floor > 0 && standing >= 0.3 * floor;
  };
  for (let i = 0; i + 1 < planes.length; i++) {
    const lowerY = planes[i], upperY = planes[i + 1];
    if (upperY - lowerY < 3 || byGap.has(lowerY)) continue;
    if (belowGrade({ upperY })) continue; // code owns below-grade circulation
    if (upperY === planes[planes.length - 1] && !habitableAbove(upperY)) continue;
    byGap.set(lowerY, { hints: [], strip: new Set() });
  }

  // No above-grade gap needs a connector — but still apply the basement-stair strip below
  // (a build can have only a redundant basement staircase to remove and no other work).
  if (byGap.size === 0 && belowGradeStripStairs.size === 0) return { blocks, palette };

  // ── Rebuild one clean connector per gap ─────────────────────────────────────────
  const reserved = new Set<string>(); // every cell any connector occupies — never overlap
  const stripKeys = new Set<string>();
  const removeKeys = new Set<string>(); // existing cells to carve (the floor opening / thin decor)
  const added: AuthoringBlock[] = [];
  let stairs = 0, ladders = 0, addedStairs = 0, addedLadders = 0;
  const warnings: string[] = [];

  // What a cell is, from the connector's point of view. A connector may freely occupy
  // or carve anything that is NOT a wall and NOT already claimed by another connector:
  //   air   — empty
  //   plane — a floor-plane SURFACE block (carving it IS the stairwell opening / top step)
  //   thin  — a non-structural block (decoration / the model's own old stairs+ladders)
  //   wall  — a structural full block off a floor plane, OR a wall column passing THROUGH a
  //           floor plane (solid above it) → must never be broken
  const cellKind = (x: number, y: number, z: number): 'air' | 'plane' | 'thin' | 'wall' | 'reserved' => {
    // Outside the structure's box = impassable: an absent cell out there reads as "air",
    // and a derived run happily climbed out through a window into the void (treads at
    // x=-21 on the v6 farmhouse). Treat it like a wall so no plan can ever leave the box.
    if (x < 0 || y < 0 || z < 0 || x >= ctx.size[0] || y >= ctx.size[1] || z >= ctx.size[2]) return 'wall';
    const k = posKey(x, y, z);
    if (reserved.has(k)) return 'reserved';
    const b = at.get(k);
    if (!b) return 'air';
    if (isAir(outPalette[b.state]?.Name ?? '')) return 'air';
    if (runTop.has(y)) {
      // On a floor plane a structural-full block is the walkable FLOOR — carving it IS the
      // stairwell opening — BUT the exterior shell and interior partition WALLS also cross
      // the floor level as structural blocks, and those must NEVER be broken (the recurring
      // "stairs destroyed the external wall" defect). Tell them apart by what sits directly
      // above the TOP of this floor's slab run (a double-thick floor is one run, so its
      // lower slab doesn't read as "wall" just because the upper slab sits on it): open
      // room space → a real floor surface ('plane', carvable); another solid block → a
      // WALL column passing through this level ('wall', protected). A non-structural
      // block on the plane (a carpet/rug) stays carvable.
      const top = runTop.get(y) as number;
      if (isStructuralFull(outPalette, b.state) && structuralAt(x, top + 1, z)) return 'wall';
      return 'plane';
    }
    if (!isStructuralFull(outPalette, b.state)) {
      // A locked SHELL block that isn't a full cube (a glass pane, a stairs/slab/wall course
      // forming the exterior) is still the protected exterior — never carvable. Without this
      // a connector treated it as thin decor and pierced the wall (P1).
      return lockSet.has(k) ? 'wall' : 'thin';
    }
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
    // Treads, landing and arrival must stay strictly INSIDE the HOUSE footprint: the
    // perimeter line is the wall — a "passable" cell there is a window/door opening, and a
    // run threading through one would march off into the garden. `inHouse` is the above-grade
    // house box, so a yard-inflated build can't plan a stair out on the lawn.
    const inside = inHouse;
    for (let i = 0; i < steps; i++) {
      const x = ax + fx * i, y = lowerY + 1 + i, z = az + fz * i;
      if (!inside(x, z) || !passable(x, y, z)) return null; // the tread would land in/past a wall
      occupy.push(posKey(x, y, z));
      place.push({ state: stairIdx, pos: [x, y, z] });
      // Stringer under each tread so the run never floats (only fill empty/thin gaps,
      // never the floor plane and never atop an existing wall/support).
      const sy = y - 1;
      if (floorMat !== undefined && !runTop.has(sy)) {
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
    if (!inside(ax - fx, az - fz)) return null;
    if (!claim(ax - fx, lowerY + 1, az - fz) || !claim(ax - fx, lowerY + 2, az - fz)) return null;
    soften(ax - fx, lowerY + 3, az - fz);
    // Top arrival: one cell forward of the top tread, body + head (you step off here) +
    // a soft 3rd so the head clears the ceiling as you walk off onto the upper floor.
    const tx = ax + fx * (steps - 1), ty = upperY, tz = az + fz * (steps - 1);
    if (!inside(tx + fx, tz + fz)) return null;
    if (!claim(tx + fx, ty + 1, tz + fz) || !claim(tx + fx, ty + 2, tz + fz)) return null;
    soften(tx + fx, ty + 3, tz + fz);
    return { place, carve, occupy, kind: 'stair' as const, arrive: [tx + fx, tz + fz] as [number, number] };
  };

  // Plan a CONTINUOUS wall ladder rising lowerY→upperY at column (bx,bz). Returns the
  // build plan or null when no side offers a solid backing for the whole climb or the
  // shaft would run through a wall.
  const planLadder = (bx: number, bz: number, lowerY: number, upperY: number) => {
    if (!inHouse(bx, bz)) return null; // a ladder hangs on a wall INSIDE the house, never the yard
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
    return { place, carve, occupy, kind: 'ladder' as const, arrive: [bx, bz] as [number, number] };
  };

  // LAST-RESORT ladder for a CLUTTERED interior: lean on a LOCKED shell wall and carve any
  // NON-LOCKED obstruction (furniture / a model partition) out of the 1-wide shaft. This is
  // what stops a gap whose interior the model packed with full-block furniture (a morgue's
  // cabinets, a dungeon's cells) from being abandoned to the model's broken, DOUBLED stairs —
  // every gap ends with exactly one clean climb. Never carves a locked wall/roof/floor or
  // leaves the box, so the protected exterior is untouched.
  const planForcedLadder = (bx: number, bz: number, lowerY: number, upperY: number) => {
    if (!inHouse(bx, bz)) return null;
    // A side with a solid backing for the whole climb (the exterior skin or a continuous
    // interior wall/pillar) — same backing rule as `planLadder`; this is its SUPERSET, adding
    // only the ability to carve non-locked clutter out of the shaft (below).
    const wall = FACINGS.find((w) => {
      for (let y = lowerY + 1; y <= upperY; y++) if (!isSolidSupport(nameAt(bx + w.dx, y, bz + w.dz))) return false;
      return true;
    });
    if (!wall) return null;
    const facing = FACINGS.find((d) => d.dx === -wall.dx && d.dz === -wall.dz)!.facing;
    const [fx, fz] = [-wall.dx, -wall.dz];
    // A cell the shaft / step-off may CLEAR: air, a floor-plane opening (the locked floor
    // DECK is carvable here — punching the stairwell through it is the whole point — unless a
    // wall passes through it), thin decor, OR a NON-LOCKED full block (furniture we carve a
    // niche from). A locked OFF-plane block is the protected wall/roof → never carved.
    const carvable = (x: number, y: number, z: number): boolean => {
      if (x < 0 || y < 0 || z < 0 || x >= ctx.size[0] || y >= ctx.size[1] || z >= ctx.size[2]) return false;
      const k = posKey(x, y, z);
      if (reserved.has(k)) return false; // never the active route
      const b = at.get(k);
      if (!b || isAir(outPalette[b.state]?.Name ?? '')) return true;
      if (runTop.has(y)) { // a floor plane: carvable opening unless a WALL passes through it
        const top = runTop.get(y) as number;
        return !(isStructuralFull(outPalette, b.state) && structuralAt(x, top + 1, z));
      }
      if (lockSet.has(k)) return false; // a locked off-plane block is the protected wall/roof
      return true; // thin decor or non-locked furniture → clear it
    };
    for (let y = lowerY + 1; y <= upperY; y++) if (!carvable(bx, y, bz)) return null;
    if (!carvable(bx + fx, upperY + 1, bz + fz) || !carvable(bx + fx, upperY + 2, bz + fz)) return null;
    const place: AuthoringBlock[] = [];
    const occupy: string[] = [];
    const carve: string[] = [];
    const ladderIdx = intern({ Name: 'minecraft:ladder', Properties: { facing } });
    for (let y = lowerY + 1; y <= upperY; y++) {
      place.push({ state: ladderIdx, pos: [bx, y, bz] });
      occupy.push(posKey(bx, y, bz));
      if (occupied(bx, y, bz)) carve.push(posKey(bx, y, bz));
    }
    for (const [ex, ey, ez] of [[bx + fx, upperY + 1, bz + fz], [bx + fx, upperY + 2, bz + fz], [bx, upperY + 1, bz]] as const) {
      occupy.push(posKey(ex, ey, ez));
      if (occupied(ex, ey, ez)) carve.push(posKey(ex, ey, ez));
    }
    return { place, carve, occupy, kind: 'ladder' as const, arrive: [bx, bz] as [number, number] };
  };

  type Plan = NonNullable<ReturnType<typeof planStair>> | NonNullable<ReturnType<typeof planLadder>> | null;
  // Build the single best connector for a gap, preferring a stair (rule 1). `near` is
  // the column the gap below's connector arrives at — a hint-less gap stacks its climb
  // there so the route between storeys stays compact.
  const planConnector = (work: GapWork, lowerY: number, upperY: number, near: { x: number; z: number } | null): Plan => {
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
    // 4) Scan every interior column standing on this storey's floor, nearest the anchor
    //    first (the model's strongest hint, else the connector below, else the footprint
    //    centre): a derived STAIR wherever one fits — rule 1 holds even for a gap the
    //    model never attempted — else a flush wall ladder. So a gap is never left
    //    without a connector while any column can host one.
    const anchor = hints[0] ?? near ?? { x: Math.round((hMinX + hMaxX) / 2), z: Math.round((hMinZ + hMaxZ) / 2) };
    const cols: { x: number; z: number; d: number }[] = [];
    for (let x = hMinX + 1; x <= hMaxX - 1; x++) for (let z = hMinZ + 1; z <= hMaxZ - 1; z++) {
      if (cellKind(x, lowerY, z) !== 'plane') continue; // must stand on this floor
      cols.push({ x, z, d: Math.abs(x - anchor.x) + Math.abs(z - anchor.z) });
    }
    cols.sort((a, b) => a.d - b.d);
    for (const c of cols) for (const d of DIRS) {
      const p = planStair(c.x, c.z, d, fallbackStairName, lowerY, upperY);
      if (p) return p;
    }
    for (const c of cols) {
      const p = planLadder(c.x, c.z, lowerY, upperY);
      if (p) return p;
    }
    // 5) LAST RESORT — a forced ladder against a locked shell wall, carving non-locked
    //    clutter from the shaft. Scan the perimeter-adjacent columns first (nearest a wall),
    //    so a cramped, furniture-packed interior still gets a single clean climb instead of
    //    being left with the model's broken/doubled geometry.
    for (const c of cols) {
      const p = planForcedLadder(c.x, c.z, lowerY, upperY);
      if (p) return p;
    }
    return null;
  };

  // Process gaps bottom-up so a lower connector reserves its cells before a higher one
  // (and so a hint-less gap can stack its climb over the connector just laid below).
  let prevArrival: { x: number; z: number } | null = null;
  const servedGaps: { lowerY: number; upperY: number }[] = []; // gaps that got a clean connector
  for (const lowerY of [...byGap.keys()].sort((a, b) => a - b)) {
    const work = byGap.get(lowerY) as GapWork;
    const gap = gapFor(planes, lowerY);
    if (!gap) continue;
    const plan = planConnector(work, gap.lowerY, gap.upperY, prevArrival);
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
    // The occupancy map is updated in place so the NEXT gap plans against the rebuilt
    // geometry — not the pre-rebuild snapshot (a ladder must never hang on a backing
    // block a lower connector already carved away).
    for (const k of work.strip) { stripKeys.add(k); at.delete(k); }
    for (const k of plan.carve) { removeKeys.add(k); at.delete(k); }
    for (const k of plan.occupy) reserved.add(k);
    for (const b of plan.place) { added.push(b); at.set(posKey(...b.pos), b); }
    if (work.hints.length === 0) { if (plan.kind === 'stair') addedStairs++; else addedLadders++; }
    else if (plan.kind === 'stair') stairs++; else ladders++;
    servedGaps.push({ lowerY: gap.lowerY, upperY: gap.upperY });
    prevArrival = { x: plan.arrive[0], z: plan.arrive[1] };
  }

  // ── One climb per storey (the user's rule): strip GHOST flights ──────────────────
  // Each served gap now has exactly ONE clean connector. Any OTHER climbing stair flight
  // the model left inside that gap — a second staircase that "goes up but leads nowhere",
  // below the per-gap hint threshold or mis-attributed, so it escaped the strip — is a
  // ghost. Remove it so no storey is ever left with two competing stairs (a recurring
  // complaint). Only flights inside a SUCCESSFULLY connected gap are swept (an
  // unconnected gap keeps the model's geometry as its sole access), and never the chosen
  // connector's own cells (`reserved`).
  let ghosts = 0;
  if (servedGaps.length) {
    for (const f of findFlights(blocks, palette, { ceilFloor })) {
      const bY = f.chain[0].pos[1], tY = f.chain[f.chain.length - 1].pos[1];
      if (tY - bY < 3) continue; // a short decorative stub, not a climb
      const gap = servedGaps.find((g) => bY >= g.lowerY && tY <= g.upperY);
      if (!gap) continue;
      const cells = f.chain.map((t) => posKey(...t.pos));
      if (cells.some((k) => reserved.has(k))) continue; // (part of) the real connector — keep
      if (cells.every((k) => stripKeys.has(k))) continue; // already removed with its gap
      for (const k of cells) { stripKeys.add(k); at.delete(k); }
      ghosts++;
    }
  }

  // Drop the model's competing basement stair(s) — the code descent ladder is the one way
  // down. Routed through `stripKeys` so `patchOrphanHoles` floors the opening it cut; the
  // descent ladder column isn't over stripped geometry, so it stays open (never sealed).
  for (const k of belowGradeStripStairs) if (!reserved.has(k)) { stripKeys.add(k); at.delete(k); }

  if (stairs === 0 && ladders === 0 && addedStairs === 0 && addedLadders === 0 && ghosts === 0
      && basementStairsRemoved === 0 && warnings.length === 0) {
    return { blocks, palette };
  }

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
  const patched = patchOrphanHoles(result, outPalette, planes, mats, reserved, stripKeys, hMinX, hMaxX, hMinZ, hMaxZ);
  result = patched.blocks;

  const fixes: string[] = [];
  if (stairs) fixes.push(`rebuilt ${stairs} staircase(s) as a clean climbable flight (full top step, headroom, landings, sized stairwell opening)`);
  if (ladders) fixes.push(`rebuilt ${ladders} cramped staircase(s)/ladder(s) as a continuous flush wall ladder`);
  if (addedStairs) fixes.push(`added ${addedStairs} missing staircase(s) between storeys the build left unconnected`);
  if (addedLadders) fixes.push(`added ${addedLadders} missing wall ladder(s) between storeys the build left unconnected`);
  if (patched.filled) fixes.push(`floored over ${patched.filled} orphan stairwell-remnant hole(s) left where the old climb was removed`);
  if (ghosts) fixes.push(`removed ${ghosts} duplicate/ghost staircase(s) so each storey keeps a single clean climb`);
  if (basementStairsRemoved) fixes.push(`removed ${basementStairsRemoved} redundant basement staircase(s) so the central descent ladder is the single way down`);
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
      // Classify EACH cell of the cluster: is its column an orphan remnant (the old
      // climb was stripped beneath it) and does the rebuilt connector claim its plane
      // cell? A connector's own opening (`reserved`) stays open; every OTHER cell that
      // sits over stripped geometry is floored back. This is what keeps the stairwell
      // opening matched to the CONNECTOR's width: when a 1-wide stair replaces a wider
      // old climb, the extra floor cells beside it (over the stripped old treads) get
      // floored instead of surviving as a fall-through gap next to the stairs.
      let hasConnector = false, anyOverStrip = false;
      const cells: { x: number; z: number; over: boolean }[] = [];
      for (const [x, z] of cluster) {
        if (reserved.has(posKey(x, py, z))) hasConnector = true;
        let over = false;
        for (let y = py; y > prev; y--) if (stripKeys.has(posKey(x, y, z))) { over = true; break; }
        if (over) anyOverStrip = true;
        cells.push({ x, z, over });
      }
      // No connector AND nothing stripped beneath it → a deliberate void (an atrium the
      // model never built a climb into): leave it open.
      if (!hasConnector && !anyOverStrip) continue;
      for (const { x, z, over } of cells) {
        if (reserved.has(posKey(x, py, z))) continue; // the active connector opening stays open
        if (over) fill.push({ state: mat, pos: [x, py, z] }); // orphan remnant beside/within the climb
      }
    }
  }
  return fill.length ? { blocks: blocks.concat(fill), filled: fill.length } : { blocks, filled: 0 };
}

/** Whether the build carries a climb that LOOKS like real storey circulation — a ladder
 *  rising ≥3, or a NARROW stair flight rising ≥3 (≤3 parallel rows; a roof slope is a
 *  WIDE bank of parallel same-facing chains, a staircase is 1–3 wide). Used only for the
 *  silent-bail warning, so the ceiling-plane roof exclusion (which depends on the very
 *  plane detection that failed) is deliberately bypassed. */
function hasUnservedClimb(blocks: AuthoringBlock[], palette: AuthoringPaletteEntry[]): boolean {
  if (findLadderRuns(blocks, palette).some((r) => r.cells.length >= 4)) return true;
  // Group climbing chains by (facing, bottom y, bottom along-axis coord): the parallel
  // rows of one slope/flight land in the same group, so the group size is its width.
  const widths = new Map<string, number>();
  for (const f of findFlights(blocks, palette, { ignoreCeiling: true })) {
    const rise = f.chain[f.chain.length - 1].pos[1] - f.chain[0].pos[1];
    if (rise < 3) continue;
    const [x, y, z] = f.chain[0].pos;
    const along = f.dir[0] !== 0 ? x : z;
    const key = `${f.facing}|${y}|${along}`;
    widths.set(key, (widths.get(key) ?? 0) + 1);
  }
  return [...widths.values()].some((w) => w <= 3);
}

/** The `facing` a stair ascends toward, from its ascent unit (dx,dz). */
function ascentFacing(fx: number, fz: number): string {
  if (fx > 0) return 'east';
  if (fx < 0) return 'west';
  if (fz > 0) return 'south';
  return 'north';
}
