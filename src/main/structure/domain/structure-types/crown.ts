// Shared tower CROWN + shaft parts — the pieces the `tower` group's types (keep, spire)
// were carrying as drifting copies: the perimeter walk, the crenellated parapet ring, the
// roof-deck hatch ladder and the narrow arrow-slit window. Like `shell-kit.ts`, a parts
// kit, not a base class: each type composes these and keeps only its genuine identity
// geometry (the keep's plain battlement vs. the spire's pinnacled corners are ONE builder
// parameterized by the corner cap).
import type { AuthoringOp } from '../../authoring/types';
import type { RolePalette } from './types';

/** An x/z rectangle (inclusive) a crown part walks/rings — a deck or tier footprint. */
export interface CrownRect { x0: number; z0: number; x1: number; z1: number }

/** Walk `rect`'s perimeter exactly once — front run, right run, back run, left run, each
 *  corner visited a single time — calling `place` per cell in walking order (so an
 *  every-other-cell cadence spaces evenly around the rim). */
export function walkPerimeter(rect: CrownRect, place: (x: number, z: number) => void): void {
  const { x0, z0, x1, z1 } = rect;
  for (let x = x0; x <= x1; x++) place(x, z0);
  for (let z = z0 + 1; z <= z1; z++) place(x1, z);
  for (let x = x1 - 1; x >= x0; x--) place(x, z1);
  for (let z = z1 - 1; z >= z0 + 1; z--) place(x0, z);
}

/**
 * A crenellated parapet ring at height `y`: a merlon on every other perimeter cell (the
 * gaps between are the crenels), walked once around the rim so the corners carry merlons.
 *
 * @param rect - The deck footprint the parapet rings.
 * @param y - The merlon course height (one above the roof deck).
 * @param merlon - The merlon block (the tower's wall).
 * @param cap - When given, every CORNER cell always carries a merlon raised a course
 *   higher with this block — the spire's spiky mini pinnacles. Omit for the keep's
 *   plain battlement (corners follow the ordinary cadence, which starts on a corner).
 * @returns The merlon (+ corner cap) ops.
 */
export function crenellations(rect: CrownRect, y: number, merlon: number, cap?: number): AuthoringOp[] {
  const ops: AuthoringOp[] = [];
  let i = 0;
  walkPerimeter(rect, (x, z) => {
    const corner = (x === rect.x0 || x === rect.x1) && (z === rect.z0 || z === rect.z1);
    if (cap !== undefined && corner) {
      ops.push({ op: 'block', pos: [x, y, z], state: merlon });
      ops.push({ op: 'block', pos: [x, y + 1, z], state: cap });
    } else if (i % 2 === 0) {
      ops.push({ op: 'block', pos: [x, y, z], state: merlon });
    }
    i++;
  });
  return ops;
}

/**
 * Roof-deck access: a code-owned ladder climbing the TOP storey up THROUGH the crown deck
 * so the player can reach the tower's content — the walkable battlemented crown. Hung on
 * the inner face of the WEST wall one cell in from the front-left corner (clear of the
 * front-wall door and the back-right stair core, dodging a centred west-wall slit), it
 * runs from just above the top floor up to the deck and PUNCHES the deck cell at its own
 * column (the hatch); the climber rises out of it and steps onto the surrounding deck.
 * Always laid — even a single-storey tower earns a way up top. (The stairwell pass never
 * touches it: the deck isn't a labelled storey plane, so it sees no gap here.)
 *
 * @param rect - The deck footprint (the top tier's walls).
 * @param topY - The top storey's floor slab Y.
 * @param deckY - The roof deck Y (the wall top).
 * @param palette - The build's role palette (supplies the ladder).
 * @returns The rung ops, or [] when the deck sits right on the top floor (nothing to climb).
 */
export function roofHatch(rect: CrownRect, topY: number, deckY: number, palette: RolePalette): AuthoringOp[] {
  const { x0, z0, z1 } = rect;
  if (deckY - topY < 2) return [];
  const cz = Math.floor((z0 + z1) / 2);
  let lz = z0 + 1; // front-left, a cell off the corner
  if (lz === cz) lz = Math.min(z1 - 1, z0 + 2); // dodge the centred arrow slit on the west wall
  const lx = x0 + 1; // one cell in from the west wall, which backs the ladder (faces east)
  const ladder = palette.get('ladder', { facing: 'east' });
  const ops: AuthoringOp[] = [];
  // Rungs from just above the top floor up to (and through) the deck — the top rung replaces
  // the deck block, opening the hatch the climber emerges from onto the crown.
  for (let y = topY + 1; y <= deckY; y++) ops.push({ op: 'block', pos: [lx, y, lz], state: ladder });
  return ops;
}

/**
 * A narrow 1-wide window slit — the keep's arrow slit / the spire's soul-lit lancet: a
 * vertical run of window blocks at wall column (x, z) from `yLo` up to `yHi`.
 *
 * @param x - The wall column x.
 * @param z - The wall column z.
 * @param yLo - The sill (lowest window cell).
 * @param yHi - The top window cell (inclusive, ≥ yLo).
 * @param win - The window block.
 * @param glow - When given, hang `glow.lantern` just INSIDE the wall at the slit top
 *   (offset by `inX`/`inZ`, pointing into the interior) so the opening glows — the
 *   spire's soul-lit lancets. Omit for the keep's plain slit.
 * @returns The slit (+ interior lantern) ops.
 */
export function arrowSlit(
  x: number,
  z: number,
  yLo: number,
  yHi: number,
  win: number,
  glow?: { inX: number; inZ: number; lantern: number },
): AuthoringOp[] {
  const ops: AuthoringOp[] = [];
  for (let y = yLo; y <= yHi; y++) ops.push({ op: 'block', pos: [x, y, z], state: win });
  if (glow) ops.push({ op: 'block', pos: [x + glow.inX, yHi, z + glow.inZ], state: glow.lantern }); // glow just inside
  return ops;
}
