// The CENTRAL basement machinery behind `composeStructure`: which basement MODULE the
// op's params select, the auto depth of an unsized level, and the stacked-vault +
// descent-ladder assembly every structure type gets for free (reserve the bottom of the
// box, lay one sealed module vault per level, ladder the stack up to the ground floor).
// Split out of compose.ts so the type×decoration cross itself stays readable; compose.ts
// re-exports the public pieces, so its API is unchanged.
import type { AuthoringOp } from '../authoring/types';
import { basementDepth } from '@/shared/domain/storeys';
import { getBasement } from './basements';
import type { Box, BuildArgs, RolePalette } from './structure-types/types';

/** The selected basement MODULE id from raw params (the Details "Basement" slot rides
 *  in as `params.basement` = a module id), or undefined when none/unknown — an unknown
 *  id is reported through `warn` instead of vanishing silently. A structure type that
 *  declares its OWN `basement` param (cottage) handles burial itself, so the central
 *  path is skipped for it (the caller checks `'basement' in type.params`). */
export function selectedBasement(params: Record<string, unknown>, warn?: (message: string) => void): string | undefined {
  const id = params.basement;
  if (typeof id !== 'string' || id === '' || id === 'none') return undefined;
  if (!getBasement(id)) {
    warn?.(`Unknown basement module "${id}" — the basement was skipped. Use one of the known basement ids.`);
    return undefined;
  }
  return id;
}

/** Below-grade height reserved at the BOTTOM of the box for a centrally-composed
 *  basement when the user supplied no explicit per-level heights: ~1/5 of the box,
 *  clamped so the vault has headroom but the above-ground storeys keep theirs. */
export function basementHeight(H: number): number {
  return Math.min(6, Math.max(4, Math.round(H * 0.2)));
}

/**
 * Compose a centrally-managed basement STACK below the ground floor: one sealed module
 * vault per level (top-down `levelHeights`, the deepest at the box bottom) laid at the
 * basement FOOTPRINT (which may be wider than the house — excavated beyond its walls),
 * plus ONE continuous descent ladder linking the deepest level up to the ground floor,
 * landing inside the HOUSE box (so the climb ends in the house, not out under the lawn) with
 * a step-off + 2-block headroom at EVERY level so each level is reachable.
 *
 * The ladder hangs on a thin solid spine so it attaches even when the house corner sits
 * away from a basement wall (an enlarged, centred undercroft). When `groundY` is one above
 * the vault stack's top (an enlarged basement reserves its OWN ceiling deck below the yard),
 * the ladder climbs the extra cell so it still reaches the house floor. Emitted by the caller
 * after the type's foundation slab so the stairwell carve survives; below-grade gaps are
 * excluded from `rebuildStairwells`, so this descent is the authoritative one (not rebuilt).
 *
 * @param composeModule - The build's module delegate (lays each vault, records the pick).
 * @param id - The basement-module id (cellar/crypt/cult-temple).
 * @param foot - The basement footprint box (X/Z; its Y range is replaced per level).
 * @param baseY - The deepest basement floor Y (the box bottom).
 * @param levelHeights - Per-level slab-to-slab heights, top-down (index 0 = under ground).
 * @param groundY - The ground-floor slab Y the descent climbs out to (≥ the vault top).
 * @param interior - The host's ground-floor INTERIOR rect (walkable area); the ladder lands in
 *   its back-left corner, so the climb surfaces in the usable room, never inside a thick wall.
 * @param palette - The HOST palette (supplies the ladder + the spine backing).
 * @returns The vault + descent ops.
 */
export function composeBasementStack(
  composeModule: BuildArgs['composeModule'],
  id: string,
  foot: Box,
  baseY: number,
  levelHeights: number[],
  groundY: number,
  interior: { x0: number; z0: number; x1: number; z1: number },
  palette: RolePalette,
): { vault: AuthoringOp[]; descent: AuthoringOp[] } {
  const vault: AuthoringOp[] = [];
  // Each level as a sealed rect vault, stacked downward from the vault top. Adjacent decks
  // coincide (one level's ceiling is the next's floor) — harmless overwrite. The top ceiling
  // sits at `vaultTop`; an enlarged basement reserves `groundY > vaultTop` so this ceiling
  // is a DEDICATED deck below the yard ground (re-blockable without touching the yard).
  const vaultTop = baseY + basementDepth(levelHeights);
  let top = vaultTop;
  // The Y of every level's FLOOR (a slab-to-slab deck), bottom-up — each gets a step-off.
  const levelFloors: number[] = [baseY];
  for (const h of levelHeights) {
    const bottom = top - h;
    vault.push(...composeModule('basement', id, [foot.x0, bottom, foot.z0], [foot.x1, top, foot.z1], { shape: 'rect' }));
    if (bottom > baseY) levelFloors.push(bottom);
    top = bottom;
  }
  // Descent ladder in the ground floor's back-left INTERIOR corner (the type's real usable
  // area, NOT the raw box edge — a battered/inset shaft like the haunted tower's flared plinth
  // sits one cell in, so box+1 is solid wall and a ladder placed there is BURIED, the "escada
  // dentro da parede" defect). Backed by a solid spine so it attaches through every level (the
  // spine coincides with the rear wall when the interior reaches the basement footprint). Rungs
  // run the deepest floor → the ground slab; a step-off + 2-block headroom at the ground AND at
  // every intermediate level, so each level is reachable. Clamped into the vault footprint so a
  // smaller/offset basement never lands the column in a vault wall. The descent is emitted by
  // the caller AFTER the type's foundation slab so its shaft carve through the floor survives.
  const descent: AuthoringOp[] = [];
  const lx = Math.min(Math.max(interior.x0, foot.x0 + 1), foot.x1 - 1);
  const lz = Math.min(Math.max(interior.z1, foot.z0 + 1), foot.z1 - 1);
  const ladder = palette.get('ladder', { facing: 'north' }); // back against the +z spine
  const spine = palette.get('foundation');
  const air = palette.air();
  for (let y = baseY + 1; y <= groundY; y++) {
    descent.push({ op: 'block', pos: [lx, y, lz + 1], state: spine }); // backing
    descent.push({ op: 'block', pos: [lx, y, lz], state: ladder });
  }
  descent.push({ op: 'block', pos: [lx, groundY + 1, lz], state: air }); // headroom over the top exit
  // Step-off in FRONT of the ladder at every floor's WALK level (slab+1) + head clearance
  // (slab+2), so you can leave the ladder onto the ground floor AND onto every below-grade
  // level. The slab itself (you stand on it) is never carved.
  for (const fy of [...levelFloors, groundY]) {
    descent.push({ op: 'block', pos: [lx, fy + 1, lz - 1], state: air }); // standing cell (on the slab)
    descent.push({ op: 'block', pos: [lx, fy + 2, lz - 1], state: air }); // head clearance
  }
  return { vault, descent };
}
