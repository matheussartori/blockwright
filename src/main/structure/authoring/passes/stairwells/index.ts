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
//
// Split by concern: planes.ts (storey-plane detection + the house footprint),
// materials.ts (per-plane floor material), hints.ts (the model's climb hints +
// shared helpers), patch-holes.ts (refilling orphaned stairwell holes). The
// plan{Stair,Ladder,ForcedLadder,Switchback} planners stay HERE as closures —
// they close over the pass's mutable occupancy/reservation state.
import { posKey } from '../../geometry';
import { bareId, isAir, makeIntern } from '../../palette';
import { findFlights, isStructuralFull } from '../flights';
import { FACINGS, isSolidSupport } from '../placement-rules';
import { floorPlanes, houseFootprint, mergedPlanes } from './planes';
import { planeMaterials } from './materials';
import { ascentFacing, findLadderRuns, gapFor, hasUnservedClimb, segmentByGap } from './hints';
import type { Hint } from './hints';
import { patchOrphanHoles } from './patch-holes';
import type { AuthoringBlock } from '../../types';
import type { Pass } from '../types';

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

  // Is the upper plane a HABITABLE storey (enclosed standing room above it — a usable
  // attic) rather than an open-air rooftop DECK? A flat house deck and the keep's
  // battlemented crown both read as a full floor plane, but reaching them is the structure
  // type's OWN business (the tower ships a code-built roof-hatch ladder), never this pass's
  // — so a connector is neither forced nor rebuilt up to one (else a cottage grows a ladder
  // to its own roof, and the tower's clean hatch ladder gets stripped + replaced by a
  // worse interior climb, the "escada para o roof bloqueada" defect).
  const habitableAbove = (py: number): boolean => {
    let floor = 0, standing = 0;
    for (let x = hMinX; x <= hMaxX; x++) for (let z = hMinZ; z <= hMaxZ; z++) {
      const b = at.get(posKey(x, py, z));
      if (!b || !isStructuralFull(outPalette, b.state)) continue;
      floor++;
      if (at.has(posKey(x, py + 1, z)) || at.has(posKey(x, py + 2, z))) continue; // no headroom
      // ENCLOSED standing room only: some structure higher up the column (a roof over an
      // attic). An uncovered deck is the build's rooftop — open sky doesn't count.
      let covered = false;
      for (let y = py + 3; y <= maxY && !covered; y++) covered = at.has(posKey(x, y, z));
      if (covered) standing++;
    }
    return floor > 0 && standing >= 0.3 * floor;
  };
  // The topmost plane when it is an open-air rooftop DECK the structure type OWNS access to:
  // the gap LEADING UP to it belongs to that type, so this pass leaves it wholly alone — no
  // hint collected (so the type's code-built roof access is never stripped), and no connector
  // forced (so no ladder to a bare roof). Recognised by two facts together: (a) nothing
  // habitable sits above it (open sky, not an attic), and (b) it's NOT one of the AUTHORITATIVE
  // storey planes — a code-built type threads its real storeys via `ctx.floorPlanes`, which
  // deliberately EXCLUDE the roof band (`storeyPlanesFromFloors`), so the deck shows up only
  // in the geometric detection. Without authoritative planes (a free-form build that labelled
  // no storeys) the signal is absent, so the old behaviour holds (the deck stays connectable).
  // This is what stopped the keep's clean roof-hatch ladder being stripped + rebuilt into a
  // backing-less ladder that `fixCirculation` then deleted (the "escada para o roof bloqueada"
  // defect), without changing how a declared top storey is connected.
  const authoritative = new Set(ctx.floorPlanes ?? []);
  const topPlane = planes[planes.length - 1];
  const roofDeck = authoritative.size > 0 && !authoritative.has(topPlane) && !habitableAbove(topPlane)
    ? topPlane : null;

  // ── Collect every circulation hint, grouped by the storey-gap it serves ─────────
  const byGap = new Map<number, GapWork>();
  const addHint = (h: Hint, strip: string[], gap: { lowerY: number; upperY: number }): void => {
    const H = gap.upperY - gap.lowerY;
    if (H < 3) return; // not a real storey (mezzanine/thin gap)
    if (gap.upperY === roofDeck) return; // the structure type owns access to its own rooftop deck
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
  // its own roof (`roofDeck` is the structure-type-owned case of the same rule).
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

  // Plan a multi-flight SWITCHBACK staircase rising lowerY→upperY in a compact 2-wide well,
  // for a storey too TALL for a single 45° flight to fit the footprint (a tower keep's tall
  // tiers — a 22-high storey needs a 22-cell straight run, which can't fit a 25-wide tower).
  // Flights PING-PONG along `primary` in alternating across-rows, connecting tread-to-tread at
  // the well's two ends, so the footprint stays `run`×2 regardless of storey height. The top
  // tread lands flush with the upper floor and you step off PERPENDICULAR onto the surrounding
  // floor (the well is 2 wide, bordered by floor on both sides). Returns the plan, or null when
  // the well can't fit inside the house. No stringers — stairs are self-supporting.
  const planSwitchback = (ax: number, az: number, primary: [number, number], lowerY: number, upperY: number) => {
    const H = upperY - lowerY;
    if (H < 6) return null; // a single flight already handles short storeys
    const [px, pz] = primary;
    const qx = pz !== 0 ? 1 : 0, qz = px !== 0 ? 1 : 0; // positive across (perpendicular) unit
    // The longest run (≤10) that stays inside the house across both rows from the anchor.
    let run = 0;
    for (let p = 0; p < 10; p++) {
      if (!inHouse(ax + px * p, az + pz * p) || !inHouse(ax + px * p + qx, az + pz * p + qz)) break;
      run = p + 1;
    }
    if (run < 3) return null;
    const nF = Math.ceil(H / run); // full flights, then the remainder on top
    const place: AuthoringBlock[] = [];
    const carve: string[] = [];
    const occupy: string[] = [];
    const claim = (x: number, y: number, z: number): boolean => {
      if (!passable(x, y, z)) return false;
      occupy.push(posKey(x, y, z));
      if (occupied(x, y, z)) carve.push(posKey(x, y, z));
      return true;
    };
    const soften = (x: number, y: number, z: number): void => {
      const k = posKey(x, y, z);
      if (reserved.has(k)) return;
      const kind = cellKind(x, y, z);
      if (kind === 'wall' || kind === 'reserved') return;
      if (kind === 'plane' && y !== upperY) return;
      occupy.push(k);
      if (occupied(x, y, z)) carve.push(k);
    };
    let base = lowerY;
    for (let i = 0; i < nF; i++) {
      const rise = i < nF - 1 ? run : H - (nF - 1) * run;
      const fwd = i % 2 === 0;             // alternate direction…
      const row = i % 2;                   // …and across-row, so flights ping-pong in the well
      const [dx, dz] = fwd ? [px, pz] : [-px, -pz];
      const stairIdx = intern({ Name: fallbackStairName, Properties: { facing: ascentFacing(dx, dz), half: 'bottom', shape: 'straight', waterlogged: 'false' } });
      for (let k = 0; k < rise; k++) {
        const p = fwd ? k : run - 1 - k;   // forward flights run 0→run-1, back flights run-1→0
        const x = ax + px * p + qx * row, z = az + pz * p + qz * row, y = base + 1 + k;
        if (!claim(x, y, z)) return null;  // tread
        place.push({ state: stairIdx, pos: [x, y, z] });
        if (!claim(x, y + 1, z) || !claim(x, y + 2, z)) return null; // 2 headroom (cuts the upper-floor opening)
        // Top tread of the WHOLE climb: open a perpendicular step-off onto the floor either
        // side of the 2-wide well, so the climber walks out onto the upper storey.
        if (i === nF - 1 && k === rise - 1) {
          for (const [ox, oz] of [[qx, qz], [-qx, -qz]] as const) { soften(x + ox, y + 1, z + oz); soften(x + ox, y + 2, z + oz); }
        }
      }
      base += rise;
    }
    return { place, carve, occupy, kind: 'stair' as const, arrive: [ax, az] as [number, number] };
  };

  type Plan = NonNullable<ReturnType<typeof planStair>> | NonNullable<ReturnType<typeof planLadder>>
    | NonNullable<ReturnType<typeof planSwitchback>> | null;
  const PRIMARIES: [number, number][] = [[1, 0], [0, 1]];
  // Build the single best connector for a gap, preferring a real staircase (rule 1) — a single
  // straight flight first, then a compact SWITCHBACK for a tall storey — and only then a ladder.
  // `near` is the column the gap below's connector arrives at — a hint-less gap stacks its climb
  // there so the route between storeys stays compact (and switchbacks align into one shaft).
  const planConnector = (work: GapWork, lowerY: number, upperY: number, near: { x: number; z: number } | null): Plan => {
    const hints = [...work.hints].sort((a, b) => b.rise - a.rise);
    // Interior columns standing on this storey's floor, nearest the anchor first.
    const anchor = hints[0] ?? near ?? { x: Math.round((hMinX + hMaxX) / 2), z: Math.round((hMinZ + hMaxZ) / 2) };
    const cols: { x: number; z: number; d: number }[] = [];
    for (let x = hMinX + 1; x <= hMaxX - 1; x++) for (let z = hMinZ + 1; z <= hMaxZ - 1; z++) {
      if (cellKind(x, lowerY, z) !== 'plane') continue; // must stand on this floor
      cols.push({ x, z, d: Math.abs(x - anchor.x) + Math.abs(z - anchor.z) });
    }
    cols.sort((a, b) => a.d - b.d);

    // 1) A single 45° staircase: the model's own flights, then derived from the hints, then any
    //    interior column — rule 1 holds even for a gap the model never attempted.
    for (const h of hints) {
      if (!h.dir) continue;
      const p = planStair(h.x, h.z, h.dir, palette[h.stairState ?? 0]?.Name ?? fallbackStairName, lowerY, upperY);
      if (p) return p;
    }
    for (const h of hints) for (const d of DIRS) {
      const p = planStair(h.x, h.z, d, fallbackStairName, lowerY, upperY);
      if (p) return p;
    }
    for (const c of cols) for (const d of DIRS) {
      const p = planStair(c.x, c.z, d, fallbackStairName, lowerY, upperY);
      if (p) return p;
    }
    // 2) A SWITCHBACK for a storey too tall for a straight flight: at a hint column, else any
    //    interior column, along either primary axis. Still a real climbable staircase.
    for (const h of hints) for (const prim of PRIMARIES) {
      const p = planSwitchback(h.x, h.z, prim, lowerY, upperY);
      if (p) return p;
    }
    for (const c of cols) for (const prim of PRIMARIES) {
      const p = planSwitchback(c.x, c.z, prim, lowerY, upperY);
      if (p) return p;
    }
    // 3) No stair fits → a continuous wall ladder, at a hint column then any interior column.
    for (const h of hints) {
      const p = planLadder(h.x, h.z, lowerY, upperY);
      if (p) return p;
    }
    for (const c of cols) {
      const p = planLadder(c.x, c.z, lowerY, upperY);
      if (p) return p;
    }
    // 4) LAST RESORT — a forced ladder against a locked shell wall, carving non-locked clutter
    //    from the shaft, so a cramped, furniture-packed interior still gets one clean climb.
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
