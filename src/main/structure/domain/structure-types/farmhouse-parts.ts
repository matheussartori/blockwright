// Shared farmhouse geometry parts — the deep covered VERANDA + UPPER GALLERY and the roof
// DORMERS. Authored as standalone helpers (operating on a rectangular sub-box + a storey
// Plan) so the `farmhouse` STRUCTURE TYPE can apply them to its main wing, and any other
// caller (e.g. a rustic finish) can reuse the same proven geometry. Pure role-based ops;
// the decoration/defaults supply the concrete blocks.
import type { AuthoringOp } from '../../authoring/types';
import { roofStair } from './shell-kit';
import { logProps, type Box, type RolePalette } from './types';

/** The storey lines a build derived, threaded into the veranda so it aligns with the host. */
export interface Plan {
  wallTop: number;
  /** The upper-floor slab Y (= the porch roof / gallery deck), or null for a 1-storey box. */
  upperFloorY: number | null;
}

/** Re-seat a door (lower+upper halves) facing north, at (x, y, z). */
export function door(palette: RolePalette, x: number, y: number, z: number): AuthoringOp[] {
  return [
    { op: 'block', pos: [x, y, z], state: palette.get('door', { facing: 'north', half: 'lower', hinge: 'left', open: 'false', powered: 'false' }) },
    { op: 'block', pos: [x, y + 1, z], state: palette.get('door', { facing: 'north', half: 'upper', hinge: 'left', open: 'false', powered: 'false' }) },
  ];
}

/**
 * The deep covered VERANDA + UPPER GALLERY across the front (z0) of a rectangular sub-box —
 * the move that breaks a plain box into a sítio silhouette. A continuous colonnade of timber
 * posts runs the FULL front height; the ground facade steps back behind it (a deep covered
 * porch with the upper floor as its roof), and — on a 2-storey shell — the upper facade
 * steps back too into a railed gallery walkway linking the front rooms. Re-seats the door +
 * big windows on the new inner facades, frames a timber entry "portal", adds porch seating +
 * hung lanterns. Assumes a filled rectangular footprint at grade (no basement).
 *
 * @param box - The (sub-)box to apply the veranda to; its front is `z0`, width `x0..x1`.
 * @param palette - The role palette (uses wall/window/fence/beam/pillar/light/roof/door/air).
 * @param plan - The storey lines (wallTop/upperFloorY) the caller derived for `box`.
 */
export function frontVeranda(box: Box, palette: RolePalette, plan: Plan): AuthoringOp[] {
  const { x0, y0, z0, x1 } = box;
  const { wallTop, upperFloorY } = plan;
  const cx = Math.floor((x0 + x1) / 2);
  const inset = 2; // porch depth (open cells z0 .. z0+inset-1)
  const innerZ = z0 + inset; // the new ground/upper facade, set back behind the colonnade
  const left = x0 + 1, right = x1 - 1; // skip the corner posts the host owns

  const air = palette.get('air');
  const wall = palette.get('wall');
  const win = palette.get('window');
  const fence = palette.get('fence');
  const beam = palette.get('beam');
  const post = palette.get('pillar', logProps(palette.idOf('pillar')));
  const lantern = palette.get('light', { hanging: 'true' });

  // Ground porch opening rises to just under the upper floor (its roof), else a capped 3.
  const groundCeil = upperFloorY ?? Math.min(wallTop, y0 + 4);
  const groundTop = groundCeil - 1;
  const postTop = upperFloorY ? wallTop - 1 : groundTop; // colonnade carries the gallery too
  if (groundTop - y0 < 2 || right - left < 3) return []; // too short/narrow to be a porch

  const ops: AuthoringOp[] = [];
  const hasGallery = !!(upperFloorY && wallTop - upperFloorY >= 4);
  const galTop = wallTop - 1;

  // 1. Carve the open bays + step the facades back to the new inner walls. (Done FIRST so
  //    the colonnade posts, stamped later, survive the gallery carve.)
  ops.push({ op: 'fill', from: [left, y0 + 1, z0], to: [right, groundTop, innerZ - 1], state: air }); // ground porch bay
  ops.push({ op: 'fill', from: [left, y0 + 1, innerZ], to: [right, groundTop, innerZ], state: wall }); // ground facade
  if (hasGallery) {
    ops.push({ op: 'fill', from: [left, upperFloorY! + 1, z0], to: [right, galTop, innerZ - 1], state: air }); // gallery bay
    ops.push({ op: 'fill', from: [left, upperFloorY! + 1, innerZ], to: [right, galTop, innerZ], state: wall }); // upper facade
  }

  // 2. Railings (stamped before the posts, so posts overwrite them only at post cells and
  //    the rail spans the bays between): ground balustrade (open central entry) + gallery.
  ops.push({ op: 'line', from: [left, y0 + 1, z0], to: [Math.max(left, cx - 2), y0 + 1, z0], state: fence });
  ops.push({ op: 'line', from: [Math.min(right, cx + 2), y0 + 1, z0], to: [right, y0 + 1, z0], state: fence });
  if (hasGallery) ops.push({ op: 'line', from: [left, upperFloorY! + 1, z0], to: [right, upperFloorY! + 1, z0], state: fence });

  // 3. Colonnade: the host's corner posts are the ends; between them, the two portal
  //    jambs (cx±2) + evenly spaced intermediates so every bay is a REGULAR 2–4 cells —
  //    never a doubled post or a 1-wide sliver (the "random timber" facade defect).
  //    A beam lintel ties the portal jambs.
  const jambL = cx - 2, jambR = cx + 2;
  const frontPosts = new Set<number>([jambL, jambR]);
  for (const [a, b] of [[x0, jambL], [jambR, x1]] as [number, number][]) {
    const k = Math.ceil((b - a) / 5) - 1; // intermediates so no bay exceeds 4 cells
    for (let i = 1; i <= k; i++) frontPosts.add(a + Math.round((i * (b - a)) / (k + 1)));
  }
  for (const x of frontPosts) {
    if (x > x0 && x < x1) ops.push({ op: 'fill', from: [x, y0 + 1, z0], to: [x, postTop, z0], state: post });
  }
  ops.push({ op: 'line', from: [jambL, groundTop, z0], to: [jambR, groundTop, z0], state: beam }); // portal lintel

  // 4. The front door + a window centred in each side bay of the new inner facade (in
  //    the open span between posts, never hidden behind one).
  ops.push(...door(palette, cx, y0 + 1, innerZ));
  const cols = [x0, ...[...frontPosts].filter((x) => x > x0 && x < x1).sort((p, q) => p - q), x1];
  for (let i = 0; i + 1 < cols.length; i++) {
    const a = cols[i], b = cols[i + 1];
    if (a >= jambL && b <= jambR) continue; // the portal bay keeps the doorway clear
    if (b - a < 3) continue; // no open cell wide enough for a framed window
    const wx = Math.floor((a + b) / 2);
    ops.push({ op: 'block', pos: [wx, y0 + 1, innerZ], state: win });
    ops.push({ op: 'block', pos: [wx, y0 + 2, innerZ], state: win });
  }

  // 5. Porch comforts: stair "chairs" facing the yard + lanterns hung from the porch roof.
  const chair = roofStair(palette, 'south');
  for (const sx of [left + 1, right - 1]) ops.push({ op: 'block', pos: [sx, y0 + 1, z0 + 1], state: chair });
  for (const lx of [cx - 3, cx + 3]) if (lx > left && lx < right) ops.push({ op: 'block', pos: [lx, groundTop, z0 + 1], state: lantern });

  // 6. Upper gallery furnishing: doors linking the front rooms onto the walkway + a window.
  if (hasGallery) {
    for (const dx of [-3, 3]) {
      const dxp = cx + dx;
      if (dxp > left && dxp < right) ops.push(...door(palette, dxp, upperFloorY! + 1, innerZ));
    }
    ops.push({ op: 'block', pos: [cx, upperFloorY! + 2, innerZ], state: win });
    for (const lx of [cx - 3, cx + 3]) if (lx > left && lx < right) ops.push({ op: 'block', pos: [lx, galTop, z0 + 1], state: lantern });
  }

  return ops;
}

/** Small gabled DORMERS poking out of a front roof slope — a window bumped out of the pitch
 *  so the dark roof reads "lived-in" like the references. `front` is the z the slope faces;
 *  placed symmetric about the wing's centre, one row into the roof void. */
export function dormers(box: Box, palette: RolePalette, wallTop: number, front: number): AuthoringOp[] {
  const { x0, x1, y1 } = box;
  const cx = Math.floor((x0 + x1) / 2);
  const wall = palette.get('wall');
  const beam = palette.get('beam');
  const win = palette.get('window');
  const roof = palette.idOf('roof').endsWith('_stairs') ? palette.get('roof', { facing: 'north', half: 'bottom' }) : palette.get('roof');

  const dormerY = wallTop + 1; // one row into the roof void
  if (dormerY + 1 > y1) return [];
  const ops: AuthoringOp[] = [];
  for (const dx of [-Math.floor((x1 - x0) / 4), Math.floor((x1 - x0) / 4)]) {
    const dxp = cx + dx;
    if (dxp <= x0 + 1 || dxp >= x1 - 1) continue;
    ops.push({ op: 'block', pos: [dxp - 1, dormerY, front], state: beam });
    ops.push({ op: 'block', pos: [dxp + 1, dormerY, front], state: beam });
    ops.push({ op: 'block', pos: [dxp, dormerY, front], state: win });
    ops.push({ op: 'block', pos: [dxp - 1, dormerY + 1, front], state: wall });
    ops.push({ op: 'block', pos: [dxp + 1, dormerY + 1, front], state: wall });
    ops.push({ op: 'block', pos: [dxp, dormerY + 1, front], state: roof }); // little gable cap
  }
  return ops;
}
