// Automatic floor (storey) detection from a structure's solid geometry — shared by
// BOTH processes (no Node/electron) so the main side (which writes the metadata
// sidecar + feeds the AI) and the renderer (which shows the editable Floors panel +
// the viewer bands) derive floors the SAME way and can't drift.
//
// The app used to make the user define the floor plan by hand. Now it RECOGNISES the
// storeys itself: it scans the vertical stack for "floor planes" — y layers that are
// substantially solid (a floor slab) with the layer above opening up (the room) — and
// turns each gap between consecutive planes into a storey. Each storey is then given a
// best-effort ROLE (basement / ground / upper / roof) from the geometry:
//   • roof    — the top storey, when the cross-section TAPERS layer-by-layer (a pitched
//               roof), as opposed to staying vertical (a flat-topped attic).
//   • basement— the lowest storey(s) whose wall perimeter is fully SEALED (no window/
//               door gaps — i.e. buried), provided an OPEN storey sits above them.
//   • ground  — the lowest non-basement storey; the rest are `upper`.
// The result is a best-effort `FloorDef[]` the user can still correct (the Floors panel
// stays editable for opened files); levels are NUMBERED ("Floor 1".. bottom-up).
import type { FloorDef, FloorRole } from '../types/generation';

/** Input to {@link detectFloors}: the build's size and every SOLID (non-air) cell.
 *  Callers strip air themselves (the renderer via the palette's `air` flag, the
 *  compiler via `isAir`), so this stays a pure geometry routine. */
export interface FloorDetectInput {
  /** Structure size as `[X, Y, Z]` (Minecraft is Y-up). */
  size: [number, number, number];
  /** Every solid cell position `[x, y, z]`. Order doesn't matter; duplicates are fine. */
  solids: [number, number, number][];
}

/** A floor slab fills at least this fraction of the INTERIOR footprint to count as a
 *  plane. Measuring the interior (not the whole footprint) is what tells a filled floor
 *  slab apart from a hollow wall ring — a wall layer covers the perimeter but leaves the
 *  interior empty, so its interior coverage is ~0. */
const FLOOR_COVERAGE = 0.45;
/** Two floor planes closer than this (in y) are treated as one storey's structure
 *  (a slab + its ceiling), so a storey is at least this tall. */
const MIN_STOREY_HEIGHT = 3;
/** A storey's wall perimeter must be at least this OPEN (fraction of perimeter cells
 *  that are air — windows/doors) to read as above-grade, i.e. a candidate "ground". */
const OPEN_PERIM = 0.03;
/** A storey is treated as BURIED (basement) when less than this fraction of its wall
 *  perimeter is open — essentially sealed all the way round (earth packed against it). */
const BURIED_PERIM = 0.01;
/** The top storey reads as a ROOF when its cross-section shrinks on at least this many
 *  consecutive layers (a real pitch), not just a flat top that drops straight to air. */
const ROOF_SLOPE_STEPS = 2;
/** A layer counts as a WALL layer (so its perimeter gaps read as windows/doors) only
 *  when this fraction of its perimeter is solid. Layers with little perimeter (an open
 *  attic, the open top of a box) aren't walls, so they don't make a storey look "open". */
const WALL_MIN = 0.5;

/**
 * Detect the storeys of a structure from its solid geometry.
 *
 * @param input - The build {@link FloorDetectInput} (size + solid cells).
 * @returns The detected storeys bottom-up as `FloorDef[]` (inclusive y ranges, NUMBERED
 *   "Floor 1".. with a best-effort role), or `[]` when no clear floor plane is found
 *   (a sparse / non-architectural structure). The caller may seed an editable panel
 *   from this — the ids are stable (`floor-1`..) so edits round-trip.
 */
export function detectFloors(input: FloorDetectInput): FloorDef[] {
  const [X, Y, Z] = input.size;
  const footprint = X * Z;
  if (footprint <= 0 || Y < MIN_STOREY_HEIGHT) return [];

  // INTERIOR footprint: the footprint minus a one-cell border, so we measure how
  // filled the inside of a layer is (a slab fills it; a wall ring doesn't). Tiny builds
  // with no real interior fall back to the whole footprint.
  const innerX = Math.max(1, X - 2);
  const innerZ = Math.max(1, Z - 2);
  const inset = X >= 3 && Z >= 3;
  const innerFootprint = inset ? innerX * innerZ : footprint;

  // Per-layer tallies + an occupancy set (for the perimeter/openness probe). `inner`
  // counts only interior cells (slab vs wall ring); `full` counts the whole layer
  // (drives the roof taper test).
  const inner: number[] = new Array<number>(Y).fill(0);
  const full: number[] = new Array<number>(Y).fill(0);
  const occ = new Set<string>();
  for (const [x, y, z] of input.solids) {
    if (y < 0 || y >= Y || x < 0 || x >= X || z < 0 || z >= Z) continue;
    full[y] += 1;
    occ.add(`${x},${y},${z}`);
    if (inset && (x === 0 || x === X - 1 || z === 0 || z === Z - 1)) continue;
    inner[y] += 1;
  }
  // Cap at the footprint to tolerate duplicate solids in the input.
  const frac = (y: number): number => (y >= 0 && y < Y ? Math.min(inner[y], innerFootprint) / innerFootprint : 0);
  const fullFrac = (y: number): number => (y >= 0 && y < Y ? Math.min(full[y], footprint) / footprint : 0);

  // A "floor plane" is a layer whose INTERIOR is substantially filled (a slab) AND has a
  // ROOM opening clearly above it — the layer above must be mostly empty inside. That
  // "clear opening" test (not just "less filled than below") is what keeps a sloped roof
  // from registering as several floors: a roof's interior fill TAPERS gradually, never
  // dropping to an open room, so its bases don't qualify. We seed the lowest qualifying
  // layer as the first floor and require storeys be at least MIN_STOREY_HEIGHT apart so a
  // slab + its ceiling don't read as two.
  const OPEN_ABOVE = FLOOR_COVERAGE * 0.6;
  const planes: number[] = [];
  for (let y = 0; y < Y; y++) {
    if (frac(y) < FLOOR_COVERAGE) continue;
    const opensAbove = frac(y + 1) < OPEN_ABOVE;
    const farEnough = planes.length === 0 || y - planes[planes.length - 1] >= MIN_STOREY_HEIGHT;
    if (!opensAbove || !farEnough) continue;
    planes.push(y);
  }
  if (planes.length === 0) return [];

  // Drop a TOP plane that is actually a flat ROOF DECK, not a walkable storey. A flat roof
  // / terrace deck is a THIN cap (≤1 wall layer above it — just its parapet) that does NOT
  // taper. Without this, the stacked flat decks of a modern villa each register as a storey
  // and the real floors get mislabeled (the "Floor 1 is half of Floor 2" defect). Two
  // guards keep legitimate top storeys: a PITCHED roof tapers (kept + later labelled
  // 'roof'); and we only prune while ≥3 planes remain — a flat-roofed building always has a
  // floor-slab plane AND a separate roof-deck plane, so dropping the cap still leaves every
  // real storey, while a plain 2-plane box (no roof slab) is never reduced. (A modern villa's
  // set-back upper volume defeats a full-footprint "is the storey below enclosed?" probe, so
  // the plane-count guard is what makes this robust to stacked, offset massing.)
  if (inset) {
    const ring = perimeterRing(X, Z);
    const wallLayers = (from: number, to: number): number => {
      let layers = 0;
      for (let y = from + 1; y <= to; y++) {
        let solid = 0;
        for (const [x, z] of ring) if (occ.has(`${x},${y},${z}`)) solid += 1;
        if (solid >= ring.length * WALL_MIN) layers += 1;
      }
      return layers;
    };
    const tapers = (from: number, to: number): boolean => {
      let steps = 0;
      for (let y = from + 2; y <= to; y++) if (fullFrac(y) > 0 && fullFrac(y) < fullFrac(y - 1)) steps += 1;
      return steps >= ROOF_SLOPE_STEPS;
    };
    while (planes.length >= 3) {
      const top = planes[planes.length - 1];
      const isFlatCap = wallLayers(top, Y - 1) < 2 && !tapers(top, Y - 1);
      if (isFlatCap) planes.pop();
      else break;
    }
  }

  // Turn consecutive planes into storeys: each spans from its plane up to just below
  // the next (the top storey runs to the top of the build).
  const n = planes.length;
  const storeys = planes.map((from, i) => ({ from, to: Math.max(from, i + 1 < n ? planes[i + 1] - 1 : Y - 1) }));

  const roles = assignRoles(storeys, { inset, X, Z, occ, fullFrac });
  return storeys.map((s, i) => ({
    id: `floor-${i + 1}`,
    name: `Floor ${i + 1}`,
    from: s.from,
    to: s.to,
    role: roles[i],
  }));
}

/** The perimeter ring (x,z) cells of a `X`×`Z` footprint — the wall column positions, used
 *  both to drop a top roof-deck plane and to probe a storey's openness for role assignment. */
function perimeterRing(X: number, Z: number): [number, number][] {
  const ring: [number, number][] = [];
  for (let x = 0; x < X; x++) ring.push([x, 0], [x, Z - 1]);
  for (let z = 1; z < Z - 1; z++) ring.push([0, z], [X - 1, z]);
  return ring;
}

interface RoleCtx {
  inset: boolean;
  X: number;
  Z: number;
  occ: Set<string>;
  fullFrac: (y: number) => number;
}

/** Assign a {@link FloorRole} to each storey from the geometry: a tapering top is a
 *  roof, sealed-perimeter bottoms below an open storey are basements, the lowest
 *  remaining storey is the ground floor and the rest are upper. Conservative — when a
 *  signal is ambiguous it leaves a storey `ground`/`upper` rather than guessing. */
function assignRoles(storeys: { from: number; to: number }[], ctx: RoleCtx): FloorRole[] {
  const n = storeys.length;
  if (n === 1) return ['ground'];

  // Perimeter ring cells of a layer (the wall footprint). Openings in it (air) are
  // windows/doors — an above-grade storey has some; a buried one has none.
  const ring: [number, number][] = ctx.inset ? perimeterRing(ctx.X, ctx.Z) : [];
  // A storey's "openness" = the fraction of its WALL cells that are punched out
  // (windows/doors). Only layers whose perimeter is mostly solid count as walls — an
  // open attic or the open top of a box has no wall there, so it can't make the storey
  // read as open. A storey with no wall layers at all is treated as open (no walls →
  // can't be buried).
  const openness = (from: number, to: number): number => {
    if (ring.length === 0) return 1; // no real perimeter to probe → treat as open
    let air = 0;
    let wall = 0;
    for (let y = from + 1; y <= to; y++) {
      let solidThis = 0;
      for (const [x, z] of ring) {
        if (ctx.occ.has(`${x},${y},${z}`)) solidThis += 1;
      }
      if (solidThis < ring.length * WALL_MIN) continue; // not a wall layer
      wall += ring.length;
      air += ring.length - solidThis;
    }
    return wall ? air / wall : 1;
  };
  // Count layers in the top storey whose cross-section shrinks vs the one below (a pitch).
  const slopeSteps = (from: number, to: number): number => {
    let steps = 0;
    for (let y = from + 2; y <= to; y++) {
      const below = ctx.fullFrac(y - 1);
      const here = ctx.fullFrac(y);
      if (here > 0 && here < below) steps += 1;
    }
    return steps;
  };

  const opens = storeys.map((s) => openness(s.from, s.to));

  // Basement: leading (bottom) storeys that are fully sealed — but only when an OPEN
  // storey sits above them (a grade reference). Without that, sealed-all-the-way is
  // just a windowless box, not a basement, so we don't guess.
  let basementCount = 0;
  while (basementCount < n && opens[basementCount] < BURIED_PERIM) basementCount += 1;
  const openAbove = opens.slice(basementCount).some((o) => o >= OPEN_PERIM);
  if (!openAbove || basementCount >= n) basementCount = 0;

  // Roof: the top storey when it tapers (a pitched roof), not a flat-topped attic.
  const topIsRoof = slopeSteps(storeys[n - 1].from, storeys[n - 1].to) >= ROOF_SLOPE_STEPS;

  return storeys.map((_, i) => {
    if (i === n - 1 && topIsRoof) return 'roof';
    if (i < basementCount) return 'basement';
    if (i === basementCount) return 'ground';
    return 'upper';
  });
}
