// "garden" — the cottage homestead yard from the classic survival-house references: the
// whole plot ringed by a low STONE-AND-FENCE wall (a cobblestone course with a wooden
// fence on top, broken by stone-brick lamp posts that carry the yard's exterior lighting),
// entered through a stone-flanked DOUBLE-DOOR gate aligned with the house door. Inside,
// a working country garden: a dirt walk from the gate to the door plus a path looping the
// house (the walkable region, distinct from the lawn), flower beds hugging the facade, and
// seeded features over the lawns — a fountain or a stone well, tilled crop plots, a flower
// parterre and clipped bushes. The fence OUTLINE is seeded too: every corner is cut by a
// stepped chamfer of varying size, so no two yards share a footprint.
//
// The geometry covers the RING ONLY (see modern.ts): the host structure insets its massing
// by the shared `SURROUND_MARGINS` and hands over the FULL box, so this module re-derives
// the house footprint from the same constants — both sides agree by construction. Own kit
// over the decoration (a lawn stays a lawn under any look). Everything stays ≤3 cells
// above ground (the lamp-post lanterns) — landscaping, never construction.
import type { AuthoringOp } from '../../authoring/types';
import { SURROUND_MARGINS } from '@/shared/domain/surroundings';
import { mulberry32 } from '../rng';
import type { Box } from '../structure-types/types';
import type { SurroundingsModule } from './types';

/** Bushes/beds must not despawn in-game — every leaf is placed persistent. */
const LEAF = { persistent: 'true' };

/** A horizontal cell of the fence rim. */
interface Pt { x: number; z: number }

/** An axis-aligned horizontal region of the yard (inclusive). */
interface Rect { x0: number; x1: number; z0: number; z1: number }

const fitsRect = (r: Rect, w: number, d: number): boolean => r.x1 - r.x0 + 1 >= w && r.z1 - r.z0 + 1 >= d;
const midX = (r: Rect): number => Math.floor((r.x0 + r.x1) / 2);
const midZ = (r: Rect): number => Math.floor((r.z0 + r.z1) / 2);

/** The centered sub-rect of `r` clamped to at most `w`×`d` cells. */
function clampRect(r: Rect, w: number, d: number): Rect {
  const cw = Math.min(w, r.x1 - r.x0 + 1);
  const cd = Math.min(d, r.z1 - r.z0 + 1);
  const x0 = midX(r) - Math.floor((cw - 1) / 2);
  const z0 = midZ(r) - Math.floor((cd - 1) / 2);
  return { x0, x1: x0 + cw - 1, z0, z1: z0 + cd - 1 };
}

/**
 * Ordered perimeter cells of the yard wall: the box rim with every corner cut by a
 * STEPPED chamfer (orthogonally connected cells, so the fence row never breaks), walked
 * clockwise from the front-left run — the ordering spaces the lamp posts evenly.
 *
 * @param b - The full build box (the rim follows its x/z bounds).
 * @param ch - The chamfer size per corner: front-left (nw), front-right (ne),
 *   back-right (se), back-left (sw). Front is the -z face.
 * @returns The rim cells in walking order, deduplicated.
 */
function fenceRim(b: Box, ch: { nw: number; ne: number; se: number; sw: number }): Pt[] {
  const cells = new Map<string, Pt>();
  const push = (x: number, z: number): void => {
    const k = `${x},${z}`;
    if (!cells.has(k)) cells.set(k, { x, z });
  };
  // A stepped diagonal from (x,z): `c` pairs of one step along `first`, one along the other.
  const steps = (x: number, z: number, first: 'x' | 'z', dx: number, dz: number, c: number): void => {
    for (let i = 0; i < c; i++) {
      if (first === 'x') { x += dx; push(x, z); z += dz; push(x, z); }
      else { z += dz; push(x, z); x += dx; push(x, z); }
    }
  };
  for (let x = b.x0 + ch.nw; x <= b.x1 - ch.ne; x++) push(x, b.z0); // front run (between chamfers)
  steps(b.x1 - ch.ne, b.z0, 'x', 1, 1, ch.ne); // front-right corner
  for (let z = b.z0 + ch.ne; z <= b.z1 - ch.se; z++) push(b.x1, z); // right run
  steps(b.x1, b.z1 - ch.se, 'z', -1, 1, ch.se); // back-right corner
  for (let x = b.x1 - ch.se; x >= b.x0 + ch.sw; x--) push(x, b.z1); // back run
  steps(b.x0 + ch.sw, b.z1, 'x', -1, -1, ch.sw); // back-left corner
  for (let z = b.z1 - ch.sw; z >= b.z0 + ch.nw; z--) push(b.x0, z); // left run
  steps(b.x0, b.z0 + ch.nw, 'z', 1, -1, ch.nw); // front-left corner
  return [...cells.values()];
}

export const garden: SurroundingsModule = {
  id: 'garden',
  label: 'Garden',
  category: 'surroundings',
  description:
    'A fenced cottage garden wrapping the house: a low stone wall topped with a wooden ' +
    'fence and stone lamp posts, a double-door gate aligned with the entry, a dirt walk ' +
    'to the door plus a path looping the house, flower beds along the facade, and a ' +
    'seeded mix of features over the lawns — a fountain or stone well, tilled crop ' +
    'plots, a flower parterre and clipped bushes. The fence outline varies with every ' +
    'seed. The build box grows beyond the house shell to fit the yard.',
  knowledge: 'nbt/modules/surroundings/garden.md',
  appliesTo: ['classic', 'farmhouse', 'sakura', 'gothic'],
  // Previewed as the classic house + its yard (the ring only reads in context).
  preview: { size: [27, 13, 27], params: { floors: 2 } },
  // A self-contained homestead kit (wins over the decoration, like a basement's stone):
  // lawn + dirt paths + cobble-and-oak fencing + stone-brick piers + warm lantern light.
  defaults: {
    ground: 'minecraft:grass_block',
    path: 'minecraft:dirt_path',
    soil: 'minecraft:farmland',
    crop: 'minecraft:wheat',
    flower: 'minecraft:poppy',
    plant: 'minecraft:flowering_azalea_leaves',
    wall: 'minecraft:stone_bricks',
    foundation: 'minecraft:cobblestone',
    trim: 'minecraft:stone_brick_slab',
    fence: 'minecraft:oak_fence',
    door: 'minecraft:oak_door',
    water: 'minecraft:water',
    light: 'minecraft:lantern',
  },
  // GENERIC over the FULL box: the house footprint is re-derived from the shared margins
  // (the host inset itself by the same constants), the ring around it is the yard.
  build({ box: b, palette, seed }): AuthoringOp[] {
    const m = SURROUND_MARGINS.garden;
    const hx0 = b.x0 + m.side, hx1 = b.x1 - m.side;
    const hz0 = b.z0 + m.front, hz1 = b.z1 - m.back;
    if (hx1 - hx0 < 2 || hz1 - hz0 < 2) return []; // no house footprint left — nothing to wrap
    const gy = b.y0; // the ground layer (the house floor sits at the same level)
    const cx = Math.floor((b.x0 + b.x1) / 2); // the door column (margins are x-symmetric)

    const lawn = palette.get('ground');
    const walk = palette.get('path');
    const stone = palette.get('foundation');
    const pier = palette.get('wall');
    const slab = palette.get('trim', { type: 'bottom' });
    const rail = palette.get('fence');
    const water = palette.get('water');
    const soil = palette.get('soil', { moisture: '7' });
    const crop = palette.get('crop', { age: '7' });
    const flower = palette.get('flower');
    const bush = palette.get('plant', LEAF);
    const lantern = palette.get('light');
    const ops: AuthoringOp[] = [];

    // Cells already claimed by paths/features, so beds and scatter never overlap them.
    const used = new Set<string>();
    const mark = (x: number, z: number): void => { used.add(`${x},${z}`); };
    const free = (x: number, z: number): boolean => !used.has(`${x},${z}`);
    const rnd = mulberry32(seed);

    // --- Lawn base: the whole ring at ground level ------------------------------------
    const strips: Rect[] = [
      { x0: b.x0, x1: b.x1, z0: b.z0, z1: hz0 - 1 }, // front
      { x0: b.x0, x1: b.x1, z0: hz1 + 1, z1: b.z1 }, // back
      { x0: b.x0, x1: hx0 - 1, z0: hz0, z1: hz1 }, // left
      { x0: hx1 + 1, x1: b.x1, z0: hz0, z1: hz1 }, // right
    ].filter((s) => s.x1 >= s.x0 && s.z1 >= s.z0);
    for (const s of strips) ops.push({ op: 'fill', from: [s.x0, gy, s.z0], to: [s.x1, gy, s.z1], state: lawn });

    // --- Perimeter wall: a stone course with a wooden fence on top, every corner cut by
    // a seeded chamfer (2–4 cells) so the yard's outline varies with every build. Stone
    // lamp posts flank the gate and break the runs at a steady rhythm — the yard's light.
    const chamfer = (): number => 2 + Math.floor(rnd() * 3);
    const rim = fenceRim(b, { nw: chamfer(), ne: chamfer(), se: chamfer(), sw: chamfer() });
    const gateXs = [cx, cx + 1]; // the double-door bay on the front run
    rim.forEach((p, i) => {
      mark(p.x, p.z);
      if (p.z === b.z0 && gateXs.includes(p.x)) return; // the gate bay (doors laid below)
      const flanksGate = p.z === b.z0 && (p.x === cx - 1 || p.x === cx + 2);
      if (flanksGate || i % 9 === 0) {
        ops.push({ op: 'fill', from: [p.x, gy + 1, p.z], to: [p.x, gy + 2, p.z], state: pier });
        ops.push({ op: 'block', pos: [p.x, gy + 3, p.z], state: lantern });
      } else {
        ops.push({ op: 'block', pos: [p.x, gy + 1, p.z], state: stone });
        ops.push({ op: 'block', pos: [p.x, gy + 2, p.z], state: rail });
      }
    });

    // --- Gate: a stone threshold + the double door (hinges apart), aligned with the walk -
    ops.push({ op: 'fill', from: [cx, gy, b.z0], to: [cx + 1, gy, b.z0], state: stone });
    const doorState = (hinge: string, half: string): number =>
      palette.get('door', { facing: 'north', half, hinge, open: 'false', powered: 'false' });
    ops.push({ op: 'block', pos: [cx, gy + 1, b.z0], state: doorState('left', 'lower') });
    ops.push({ op: 'block', pos: [cx, gy + 2, b.z0], state: doorState('left', 'upper') });
    ops.push({ op: 'block', pos: [cx + 1, gy + 1, b.z0], state: doorState('right', 'lower') });
    ops.push({ op: 'block', pos: [cx + 1, gy + 2, b.z0], state: doorState('right', 'upper') });

    // --- Walks: the gate→door path plus a loop around the house (the walkable region,
    // cut into the lawn so it reads apart from the grass like the references). ----------
    for (let z = b.z0 + 1; z <= hz0 - 1; z++) {
      for (const x of gateXs) { ops.push({ op: 'block', pos: [x, gy, z], state: walk }); mark(x, z); }
    }
    for (let x = cx - 1; x <= cx + 2; x++) { ops.push({ op: 'block', pos: [x, gy, hz0 - 1], state: walk }); mark(x, hz0 - 1); } // door apron
    const loop: Rect = { x0: hx0 - 2, x1: hx1 + 2, z0: hz0 - 2, z1: hz1 + 2 };
    for (let x = loop.x0; x <= loop.x1; x++) {
      for (const z of [loop.z0, loop.z1]) { ops.push({ op: 'block', pos: [x, gy, z], state: walk }); mark(x, z); }
    }
    for (let z = loop.z0; z <= loop.z1; z++) {
      for (const x of [loop.x0, loop.x1]) { ops.push({ op: 'block', pos: [x, gy, z], state: walk }); mark(x, z); }
    }

    // --- Flower beds hugging the facade: seeded blooms in the cells against the walls --
    const bed: Pt[] = [];
    for (let x = hx0 - 1; x <= hx1 + 1; x++) bed.push({ x, z: hz0 - 1 }, { x, z: hz1 + 1 });
    for (let z = hz0; z <= hz1; z++) bed.push({ x: hx0 - 1, z }, { x: hx1 + 1, z });
    for (const p of bed) {
      if (!free(p.x, p.z) || rnd() >= 0.5) continue;
      ops.push({ op: 'block', pos: [p.x, gy + 1, p.z], state: flower });
      mark(p.x, p.z);
    }

    // --- Feature builders (each marks its cells so scatter stays off them) -------------
    /** A stone well: a 3×3 stone-brick rim around a water shaft, fence posts + slab roof. */
    const addWell = (wx: number, wz: number): void => {
      ops.push({ op: 'fill', from: [wx - 1, gy + 1, wz - 1], to: [wx + 1, gy + 1, wz + 1], state: pier });
      ops.push({ op: 'block', pos: [wx, gy + 1, wz], state: water });
      for (const dz of [-1, 1]) ops.push({ op: 'block', pos: [wx, gy + 2, wz + dz], state: rail });
      ops.push({ op: 'fill', from: [wx, gy + 3, wz - 1], to: [wx, gy + 3, wz + 1], state: slab });
      for (let x = wx - 1; x <= wx + 1; x++) for (let z = wz - 1; z <= wz + 1; z++) mark(x, z);
    };
    /** A 5×5 fountain: a recessed 3×3 basin, a slab rim, and a centre jet (water on a pier). */
    const addFountain = (fx: number, fz: number): void => {
      ops.push({ op: 'fill', from: [fx - 1, gy, fz - 1], to: [fx + 1, gy, fz + 1], state: water });
      ops.push({ op: 'walls', from: [fx - 2, gy + 1, fz - 2], to: [fx + 2, gy + 1, fz + 2], state: slab });
      ops.push({ op: 'block', pos: [fx, gy + 1, fz], state: pier });
      ops.push({ op: 'block', pos: [fx, gy + 2, fz], state: water });
      for (let x = fx - 2; x <= fx + 2; x++) for (let z = fz - 2; z <= fz + 2; z++) mark(x, z);
    };
    /** A tilled crop plot: hydrated farmland rows of ripe crop around a centre water channel. */
    const addPlot = (r: Rect): void => {
      const wx = midX(r);
      for (let x = r.x0; x <= r.x1; x++) {
        for (let z = r.z0; z <= r.z1; z++) {
          mark(x, z);
          if (x === wx) { ops.push({ op: 'block', pos: [x, gy, z], state: water }); continue; }
          ops.push({ op: 'block', pos: [x, gy, z], state: soil });
          ops.push({ op: 'block', pos: [x, gy + 1, z], state: crop });
        }
      }
    };
    /** A flower parterre: a checkered bloom grid with the odd clipped bush. */
    const addParterre = (r: Rect): void => {
      for (let x = r.x0; x <= r.x1; x++) {
        for (let z = r.z0; z <= r.z1; z++) {
          if (!free(x, z)) continue;
          mark(x, z);
          if ((x + z) % 2 === 0) ops.push({ op: 'block', pos: [x, gy + 1, z], state: flower });
          else if (rnd() < 0.2) ops.push({ op: 'block', pos: [x, gy + 1, z], state: bush });
        }
      }
    };

    // --- Front showcase: a water feature on one flank of the walk, a parterre opposite -
    const front = { z0: b.z0 + 2, z1: hz0 - 3 };
    const fL: Rect = { x0: b.x0 + 3, x1: cx - 3, ...front };
    const fR: Rect = { x0: cx + 4, x1: b.x1 - 3, ...front };
    const [showcase, beds] = rnd() < 0.5 ? [fL, fR] : [fR, fL];
    const fountainUp = rnd() < 0.5;
    if (fountainUp && fitsRect(showcase, 5, 5)) addFountain(midX(showcase), midZ(showcase));
    else if (fitsRect(showcase, 3, 3)) addWell(midX(showcase), midZ(showcase));
    if (fitsRect(beds, 3, 3)) addParterre(clampRect(beds, 6, 4));

    // --- Back lawns: the working plots (+ a well when the front took the fountain) ------
    const back = { z0: hz1 + 2, z1: b.z1 - 3 };
    const bL: Rect = { x0: b.x0 + 3, x1: cx - 2, ...back };
    const bR: Rect = { x0: cx + 2, x1: b.x1 - 3, ...back };
    if (fitsRect(bL, 3, 3)) addPlot(clampRect(bL, 7, 4));
    if (fitsRect(bR, 3, 3)) {
      if (fountainUp && fitsRect(bR, 3, 3)) addWell(midX(bR), midZ(bR));
      else addPlot(clampRect(bR, 7, 4));
    }

    // --- Side strips: a slim plot or a clipped bush row, seeded ------------------------
    for (const s of [
      { x0: b.x0 + 2, x1: hx0 - 3, z0: hz0 + 1, z1: hz1 - 1 },
      { x0: hx1 + 3, x1: b.x1 - 2, z0: hz0 + 1, z1: hz1 - 1 },
    ]) {
      if (!fitsRect(s, 3, 4)) continue;
      if (rnd() < 0.5) addPlot(clampRect(s, 3, 6));
      else {
        const x = midX(s);
        for (let z = s.z0 + 1; z <= s.z1 - 1; z += 2) {
          if (!free(x, z)) continue;
          ops.push({ op: 'block', pos: [x, gy + 1, z], state: bush });
          mark(x, z);
        }
      }
    }

    // --- Scatter: seeded flowers + bushes over whatever lawn is left -------------------
    for (const s of strips) {
      for (let x = Math.max(s.x0, b.x0 + 1); x <= Math.min(s.x1, b.x1 - 1); x++) {
        for (let z = Math.max(s.z0, b.z0 + 1); z <= Math.min(s.z1, b.z1 - 1); z++) {
          if (!free(x, z)) continue;
          const r = rnd();
          if (r < 0.06) ops.push({ op: 'block', pos: [x, gy + 1, z], state: flower });
          else if (r < 0.09) ops.push({ op: 'block', pos: [x, gy + 1, z], state: bush });
        }
      }
    }

    return ops;
  },
};
