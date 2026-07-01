// Shared house-shell PARTS — the standardized pieces every house archetype composes its
// casco from, so the types stop carrying drifting copies of the same loops (the lantern
// loop, the corner posts, the storey slabs, the seated door, the roof dispatch). Like
// `stair-core.ts`, this is a parts kit, not a base class: a type stays a small data +
// `build()` module and CALLS these, overriding only what is genuinely its identity.
//
// The kit also carries the ROOF GUARANTEE: `roofFormFor` always resolves to a real cap —
// a pitched module when the pick fits and the material can pitch, else the FLAT module
// (deck + parapet) — so no house type can silently ship roofless. ('none' exists only
// for a degenerate box with zero cells above the walls, which the storey ladder already
// prevents by capping `wallTop` at `y1 - 2`.)
import type { AuthoringOp } from '../../authoring/types';
import type { BuildArgs, FloorPlanEntry, RolePalette } from './types';

/** The cap a build actually lays over its walls. */
export type RoofForm = 'gable' | 'hip' | 'flat' | 'none';

/** Resolve the requested roof shape against reality: a pitched pick needs ≥3 cells above
 *  the walls AND a stair-capable roof block; anything that can't pitch caps FLAT (the
 *  flat module's walkable deck + parapet — never a bare hole to the sky).
 *  @param shape - The requested roof param value ('gable' | 'hip' | 'flat' | 'auto'-likes).
 *  @param availAbove - Cells available above the wall top (`y1 - wallTop`).
 *  @param canPitch - Whether the palette's `roof` block is a `*_stairs` (else flat).
 *  @returns The form to lay; 'none' only when there is no cell above the walls at all. */
export function roofFormFor(shape: string, availAbove: number, canPitch = true): RoofForm {
  if (availAbove < 1) return 'none';
  const pitched = shape !== 'flat' && canPitch && availAbove >= 3;
  if (!pitched) return 'flat';
  return shape === 'hip' ? 'hip' : 'gable';
}

/** Lay the resolved roof cap by delegating to the matching roof MODULE (the single
 *  source of that typology's geometry).
 *  @param composeModule - The build's module delegate (from {@link BuildArgs}).
 *  @param form - The resolved form (see {@link roofFormFor}).
 *  @param from - The roof box's lower corner (usually `[x0, wallTop + 1, z0]`).
 *  @param to - The roof box's upper corner (usually `[x1, y1, z1]`).
 *  @param ridge - Gable ridge axis; defaults to the box's long axis.
 *  @returns The module's ops ([] for 'none'). */
export function roofCap(
  composeModule: BuildArgs['composeModule'],
  form: RoofForm,
  from: [number, number, number],
  to: [number, number, number],
  ridge?: 'x' | 'z',
): AuthoringOp[] {
  if (form === 'none') return [];
  if (form === 'gable') {
    const axis = ridge ?? (to[0] - from[0] <= to[2] - from[2] ? 'z' : 'x');
    return composeModule('roof', 'gable', from, to, { ridge: axis });
  }
  return composeModule('roof', form, from, to);
}

/** Project a storey ladder into the authoritative {@link FloorPlanEntry} list (the
 *  `floors()` shape): one inclusive y-range per storey, ground then uppers, the last one
 *  ending under the wall top. A type with extra levels (sakura's visible stone base)
 *  prepends/edits its own entries around this. */
export function storeyEntries(slabYs: readonly number[], wallTop: number): FloorPlanEntry[] {
  return slabYs.map((from, f) => {
    const to = (f + 1 < slabYs.length ? slabYs[f + 1] : wallTop) - 1;
    return { from, to: Math.max(from, to), role: f === 0 ? ('ground' as const) : ('upper' as const) };
  });
}

/** Intern the straight, bottom-half roof stair facing `facing` — the one spelling of the
 *  `palette.get('roof', …)` state every type's eave/cap/porch-step detail was hand-writing. */
export function roofStair(palette: RolePalette, facing: string): number {
  return palette.get('roof', { facing, half: 'bottom', shape: 'straight' });
}

/** A seated double door (lower + upper halves) facing north at (x, y, z). */
export function seatDoor(palette: RolePalette, x: number, y: number, z: number): AuthoringOp[] {
  return [
    { op: 'block', pos: [x, y, z], state: palette.get('door', { facing: 'north', half: 'lower', hinge: 'left', open: 'false', powered: 'false' }) },
    { op: 'block', pos: [x, y + 1, z], state: palette.get('door', { facing: 'north', half: 'upper', hinge: 'left', open: 'false', powered: 'false' }) },
  ];
}

/** Full-height corner posts at each (x, z), from `yLo` to `yHi`. */
export function cornerPosts(
  corners: readonly [number, number][],
  yLo: number,
  yHi: number,
  state: number,
): AuthoringOp[] {
  return corners.map(([px, pz]) => ({ op: 'fill' as const, from: [px, yLo, pz] as [number, number, number], to: [px, yHi, pz] as [number, number, number], state }));
}

/** The upper-storey floor slabs: one inset fill per storey above the first (the ground
 *  slab is the foundation's), skipping any slab the wall top already cuts off. */
export function storeySlabs(
  slabYs: readonly number[],
  rect: { x0: number; z0: number; x1: number; z1: number },
  wallTop: number,
  state: number,
): AuthoringOp[] {
  const ops: AuthoringOp[] = [];
  for (let f = 1; f < slabYs.length; f++) {
    const y = slabYs[f];
    if (y < wallTop) {
      ops.push({ op: 'fill', from: [rect.x0 + 1, y, rect.z0 + 1], to: [rect.x1 - 1, y, rect.z1 - 1], state });
    }
  }
  return ops;
}

/** The roof surface height at column (x, z) for a cap `form`+`ridge` over a wall box —
 *  so a chimney can rise to just CLEAR the roof there instead of spiking to the box top.
 *  The pitch climbs from `wallTop + 1`, capped at the box top `y1`. A gable climbs the axis
 *  perpendicular to its ridge; a hip climbs the nearer of both axes; a flat/none cap sits
 *  just above the wall. */
export function roofSurfaceY(
  x: number,
  z: number,
  wallTop: number,
  y1: number,
  form: RoofForm,
  ridge: 'x' | 'z',
  b: { x0: number; x1: number; z0: number; z1: number },
): number {
  if (form === 'flat' || form === 'none') return Math.min(y1, wallTop + 1);
  const base = wallTop + 1;
  const inX = Math.min(x - b.x0, b.x1 - x);
  const inZ = Math.min(z - b.z0, b.z1 - z);
  const climb = form === 'hip' ? Math.min(inX, inZ) : ridge === 'x' ? inZ : inX;
  return Math.min(y1, base + Math.max(0, climb));
}

/** The shared chimney BREAST every house type lays — FOUNDATION code, identical across
 *  types (the user's rule: no per-type difference). A cobblestone/foundation stack rising
 *  from the hearth at `groundY` up an EXTERIOR wall to ~2 blocks proud of the local roof
 *  surface — NEVER run to the box top (the "chaminé grande demais" spike). It sits on a
 *  wall the roof SLOPES AWAY from so it pokes into open air, never buried climbing a gable
 *  peak to the ridge: for a gable that's the wall PERPENDICULAR to the ridge (the back wall
 *  when the ridge runs along x — the front carries the door); for hip/flat any side wall
 *  (the seeded `sideX`). The AI caps the exposed top with a lit campfire (its guide says so).
 *  @param rect - the roof's footprint (x0/x1/z0/z1) — for gothic this is behind the portico.
 *  @returns the single vertical fill op, or [] when the box is too short for a stack. */
export function chimneyBreast(
  palette: RolePalette,
  rect: { x0: number; x1: number; z0: number; z1: number },
  groundY: number,
  wallTop: number,
  y1: number,
  form: RoofForm,
  ridge: 'x' | 'z',
  sideX: number,
): AuthoringOp[] {
  if (wallTop - groundY < 2) return []; // no real storey to seat a hearth + flue
  const cx = Math.floor((rect.x0 + rect.x1) / 2);
  const cz = Math.floor((rect.z0 + rect.z1) / 2);
  const [x, z] = form === 'gable' && ridge === 'x'
    ? [cx, rect.z1] // ridge along x → slopes face z → put the breast on the back wall
    : [sideX, cz]; // ridge along z (slopes face x), or hip/flat → a seeded side wall
  const top = Math.min(y1, roofSurfaceY(x, z, wallTop, y1, form, ridge, rect) + 2);
  return [{ op: 'fill', from: [x, groundY, z], to: [x, top, z], state: palette.get('foundation') }];
}

/** The guaranteed-light rule: one hanging lantern under every storey's ceiling, centred
 *  at (cx, cz). The ceiling of storey f is the next slab (or the wall top for the last). */
export function ceilingLanterns(
  slabYs: readonly number[],
  wallTop: number,
  cx: number,
  cz: number,
  lantern: number,
): AuthoringOp[] {
  const ops: AuthoringOp[] = [];
  for (let f = 0; f < slabYs.length; f++) {
    const ceil = f + 1 < slabYs.length ? slabYs[f + 1] : wallTop;
    if (ceil - 1 > slabYs[f]) ops.push({ op: 'block', pos: [cx, ceil - 1, cz], state: lantern });
  }
  return ops;
}
