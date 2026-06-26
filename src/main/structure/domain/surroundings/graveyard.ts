// "graveyard" — the gothic manor's brooding cemetery grounds, modelled on the overgrown
// ruined-churchyard reference: a crumbling mossy-stone perimeter wall (broken open in
// places, capped with cobblestone-wall battlements and lit by soul lanterns on stone
// piers), an arched stone GATE aligned with the manor entrance, a long gravel approach
// flanked by ROWS OF HEADSTONES, a RUINED COLONNADE of toppling stone-brick pillars and
// rubble, a great WEEPING TREE as the focal point, a small stone MAUSOLEUM tucked in the
// grounds, and overgrowth (ferns, poppies, vines of leaves) reclaiming the ruins. The
// whole plot is DELIBERATELY LARGE — by design ~4× the garden/modern ring and front-
// heavy (`SURROUND_SCALE.graveyard`), so the manor reads as an estate, not a cottage.
//
// Like the other yards this module covers the RING ONLY: the host (gothic) insets its
// massing by the shared scaled margins and hands over the FULL box, so this module
// re-derives the house footprint from the same function — both sides agree by
// construction. Own gothic-stone kit over the decoration (a graveyard stays a graveyard).
// Unlike the low garden/modern rings, a cemetery is ALLOWED its verticality (ruined
// columns, the tree, the crypt, the gate arch) — but every feature is clamped inside the
// build box's height, and all foliage is placed persistent so it never despawns.
import type { AuthoringOp } from '../../authoring/types';
import { surroundMarginsForOuter } from '@/shared/domain/surroundings';
import { mulberry32 } from '../rng';
import { inCut, rimCells, seededChamfers } from './outline';
import type { SurroundingsModule } from './types';

/** Foliage must not despawn in-game — every leaf/plant is placed persistent. */
const LEAF = { persistent: 'true' };

/** An axis-aligned horizontal region of the yard (inclusive). */
interface Rect { x0: number; x1: number; z0: number; z1: number }

const fitsRect = (r: Rect, w: number, d: number): boolean => r.x1 - r.x0 + 1 >= w && r.z1 - r.z0 + 1 >= d;
const midX = (r: Rect): number => Math.floor((r.x0 + r.x1) / 2);
const midZ = (r: Rect): number => Math.floor((r.z0 + r.z1) / 2);

export const graveyard: SurroundingsModule = {
  id: 'graveyard',
  label: 'Graveyard',
  category: 'surroundings',
  description:
    'A vast, brooding cemetery wrapping the gothic manor: a crumbling mossy-stone wall ' +
    'broken open in places and lit by soul lanterns on stone piers, an arched gate ' +
    'aligned with the entrance, a long gravel approach flanked by rows of weathered ' +
    'headstones, a ruined colonnade of toppling pillars and rubble, a great weeping ' +
    'tree as the focal point, a small stone mausoleum, and overgrowth — ferns, poppies ' +
    'and trailing leaves — reclaiming the ruins. The grounds are deliberately grand ' +
    '(around four times a normal yard) and front-heavy, so the manor reads as an estate. ' +
    'The build box grows well beyond the house shell to fit the cemetery.',
  knowledge: 'nbt/modules/surroundings/graveyard.md',
  appliesTo: ['gothic', 'tower'],
  // Previewed as the gothic manor sunk into its cemetery (the ring only reads in context);
  // big enough that the inset still leaves a manor footprint inside the wide ring.
  preview: { size: [71, 16, 84], params: { decoration: 'gothic', floors: 2 } },
  // A self-contained gothic-stone graveyard kit (wins over the decoration, like a
  // basement's stone): grass + gravel paths, mossy/cracked stone for wall + ruins +
  // graves, iron gate, an oak weeping tree, soul-lantern light, poppies + ferns.
  defaults: {
    ground: 'minecraft:grass_block',
    path: 'minecraft:gravel',
    soil: 'minecraft:podzol', // disturbed earth — the grave mounds
    floor: 'minecraft:cobblestone', // the gate threshold / crypt floor
    foundation: 'minecraft:cobblestone',
    wall: 'minecraft:mossy_stone_bricks', // perimeter wall, crypt, monument graves
    corner: 'minecraft:mossy_cobblestone', // weathered rubble + wall piers
    accent: 'minecraft:cracked_stone_bricks', // the ruined, broken stone
    pillar: 'minecraft:stone_bricks', // colonnade shafts + gate piers
    trim: 'minecraft:stone_brick_slab', // ledgers, rubble caps, crypt roof
    roof: 'minecraft:stone_brick_stairs', // broken arches / leaning headstones / capitals
    beam: 'minecraft:oak_log', // the weeping tree trunk
    fence: 'minecraft:cobblestone_wall', // wall battlements, headstones, lamp posts
    bars: 'minecraft:iron_bars', // the crypt grate
    door: 'minecraft:dark_oak_door',
    plant: 'minecraft:oak_leaves', // the tree canopy + trailing weepers + vines on ruins
    flower: 'minecraft:poppy', // the red blooms of the reference
    crop: 'minecraft:fern', // overgrowth tufts on the lawn
    light: 'minecraft:soul_lantern', // the eerie blue churchyard light
  },
  // GENERIC over the FULL box: the house footprint is re-derived from the shared scaled
  // margins (the host inset itself by the same function), the ring around it is the yard.
  build({ box: b, palette, seed, surroundSizing }): AuthoringOp[] {
    const m = surroundMarginsForOuter('graveyard', b.W, b.D, surroundSizing);
    if (!m) return [];
    const hx0 = b.x0 + m.side, hx1 = b.x1 - m.side;
    const hz0 = b.z0 + m.front, hz1 = b.z1 - m.back;
    if (hx1 - hx0 < 2 || hz1 - hz0 < 2) return []; // no house footprint left — nothing to wrap
    const gy = b.y0; // the ground layer (the house floor sits at the same level)
    const cx = Math.floor((b.x0 + b.x1) / 2); // the gate/door column (margins are x-symmetric)
    const clampY = (y: number): number => Math.min(y, b.y1); // keep every feature inside the box

    const lawn = palette.get('ground');
    const mound = palette.get('soil'); // disturbed earth on a grave
    const path = palette.get('path');
    const cobble = palette.get('floor');
    const moss = palette.get('wall');
    const rubble = palette.get('corner');
    const cracked = palette.get('accent');
    const brick = palette.get('pillar');
    const slab = palette.get('trim', { type: 'bottom' });
    const cap = palette.get('fence'); // cobblestone wall (battlements / headstones / posts)
    const grate = palette.get('bars');
    const trunk = palette.get('beam', { axis: 'y' });
    const leaf = palette.get('plant', LEAF);
    const poppy = palette.get('flower');
    const fern = palette.get('crop');
    const lantern = palette.get('light');
    const ops: AuthoringOp[] = [];

    // Cells already claimed by paths/features, so graves/ruins/scatter never overlap.
    const used = new Set<string>();
    const mark = (x: number, z: number): void => { used.add(`${x},${z}`); };
    const free = (x: number, z: number): boolean => !used.has(`${x},${z}`);
    const rnd = mulberry32(seed);

    // The seeded chamfered outline — generous cuts for an irregular, overgrown plot.
    const ch = seededChamfers(rnd, m, 3, 9);
    const cut = (x: number, z: number): boolean => inCut(b, ch, x, z);
    const outOfYard = (x: number, z: number): boolean =>
      cut(x, z) || (x >= hx0 && x <= hx1 && z >= hz0 && z <= hz1);

    // --- Lawn base: the ring at ground level, clipped to the chamfered outline ----------
    const strips: Rect[] = [
      { x0: b.x0, x1: b.x1, z0: b.z0, z1: hz0 - 1 }, // front (the great approach)
      { x0: b.x0, x1: b.x1, z0: hz1 + 1, z1: b.z1 }, // back
      { x0: b.x0, x1: hx0 - 1, z0: hz0, z1: hz1 }, // left
      { x0: hx1 + 1, x1: b.x1, z0: hz0, z1: hz1 }, // right
    ].filter((s) => s.x1 >= s.x0 && s.z1 >= s.z0);
    for (const s of strips) {
      for (let x = s.x0; x <= s.x1; x++) {
        for (let z = s.z0; z <= s.z1; z++) {
          if (cut(x, z)) { mark(x, z); continue; } // beyond the outline — no yard at all
          ops.push({ op: 'block', pos: [x, gy, z], state: lawn });
        }
      }
    }

    // --- Perimeter wall: a mossy-stone course with a cobblestone-wall battlement, RUINED
    // (seeded gaps + dips in height) and broken by stone piers carrying soul lanterns.
    // The gate bay on the front run stays open for the approach. ------------------------
    const rim = rimCells(b, ch);
    const gateXs = [cx - 1, cx, cx + 1]; // the 3-wide gateway on the front run
    rim.forEach((p, i) => {
      mark(p.x, p.z);
      if (p.z === b.z0 && gateXs.includes(p.x)) return; // the gate bay (piers laid below)
      const flanksGate = p.z === b.z0 && (p.x === cx - 2 || p.x === cx + 2);
      const isPier = flanksGate || i % 7 === 0;
      if (isPier) { // a stone pier topped with a soul lantern — the wall's light
        ops.push({ op: 'fill', from: [p.x, gy + 1, p.z], to: [p.x, clampY(gy + 3), p.z], state: brick });
        ops.push({ op: 'block', pos: [p.x, clampY(gy + 4), p.z], state: lantern });
        return;
      }
      if (rnd() < 0.16) return; // a breach in the crumbling wall — left open
      const h = rnd() < 0.3 ? 1 : 2; // a dip in the battlement (weathered, uneven)
      ops.push({ op: 'block', pos: [p.x, gy + 1, p.z], state: moss });
      if (h >= 2) ops.push({ op: 'block', pos: [p.x, gy + 2, p.z], state: cap });
      if (rnd() < 0.12) ops.push({ op: 'block', pos: [p.x, clampY(gy + h + 1), p.z], state: leaf }); // creeping growth
    });

    // --- Gate: tall stone piers flanking the opening, a stair arch + lintel overhead,
    // a cobblestone threshold, and iron-bar leaves standing aside. ----------------------
    const gateTop = clampY(gy + 5);
    for (const px of [cx - 2, cx + 2]) {
      ops.push({ op: 'fill', from: [px, gy + 1, b.z0], to: [px, gateTop, b.z0], state: brick });
      ops.push({ op: 'block', pos: [px, clampY(gateTop + 1), b.z0], state: lantern });
    }
    ops.push({ op: 'fill', from: [cx - 1, gy, b.z0], to: [cx + 1, gy, b.z0], state: cobble }); // threshold
    if (gy + 4 <= b.y1) { // the arch only when there's headroom for it
      ops.push({ op: 'block', pos: [cx - 1, gy + 4, b.z0], state: palette.get('roof', { facing: 'east', half: 'bottom' }) });
      ops.push({ op: 'block', pos: [cx + 1, gy + 4, b.z0], state: palette.get('roof', { facing: 'west', half: 'bottom' }) });
      ops.push({ op: 'block', pos: [cx, gy + 4, b.z0], state: cracked }); // keystone
    }
    for (const gx of [cx - 1, cx + 1]) ops.push({ op: 'block', pos: [gx, gy + 1, b.z0], state: grate }); // open leaves

    // --- The approach: a wide gravel path from the gate to the manor door, with a cross
    // axis through the front yard and a loop around the manor. --------------------------
    for (let z = b.z0 + 1; z <= hz0 - 1; z++) {
      for (const x of gateXs) { ops.push({ op: 'block', pos: [x, gy, z], state: path }); mark(x, z); }
    }
    const crossZ = Math.floor((b.z0 + hz0) / 2); // a transept across the front grounds
    for (let x = b.x0 + 2; x <= b.x1 - 2; x++) {
      if (outOfYard(x, crossZ)) continue;
      ops.push({ op: 'block', pos: [x, gy, crossZ], state: path });
      mark(x, crossZ);
    }
    const loop: Rect = { x0: hx0 - 2, x1: hx1 + 2, z0: hz0 - 2, z1: hz1 + 2 };
    for (let x = loop.x0; x <= loop.x1; x++) {
      for (const z of [loop.z0, loop.z1]) {
        if (z < b.z0 || z > b.z1 || cut(x, z)) continue;
        ops.push({ op: 'block', pos: [x, gy, z], state: path });
        mark(x, z);
      }
    }
    for (let z = loop.z0; z <= loop.z1; z++) {
      for (const x of [loop.x0, loop.x1]) {
        if (x < b.x0 || x > b.x1 || cut(x, z)) continue;
        ops.push({ op: 'block', pos: [x, gy, z], state: path });
        mark(x, z);
      }
    }

    // --- Feature builders -------------------------------------------------------------
    /** A single grave: a gravel mound, a ledger slab, and a headstone (seeded type),
     *  facing the approach. Returns false when the cells are taken. */
    const addGrave = (gx: number, gz: number): boolean => {
      if (!free(gx, gz) || !free(gx, gz + 1) || outOfYard(gx, gz) || outOfYard(gx, gz + 1)) return false;
      mark(gx, gz); mark(gx, gz + 1);
      ops.push({ op: 'block', pos: [gx, gy, gz + 1], state: mound }); // disturbed earth
      ops.push({ op: 'block', pos: [gx, gy + 1, gz + 1], state: slab }); // the ledger
      const kind = rnd();
      if (kind < 0.4) { // a cobblestone-wall headstone
        ops.push({ op: 'block', pos: [gx, gy + 1, gz], state: cap });
      } else if (kind < 0.72) { // a tall mossy-stone monument
        ops.push({ op: 'fill', from: [gx, gy + 1, gz], to: [gx, clampY(gy + 2), gz], state: rnd() < 0.5 ? moss : cracked });
      } else { // a leaning broken headstone (a stair tilted back)
        ops.push({ op: 'block', pos: [gx, gy + 1, gz], state: palette.get('roof', { facing: 'south', half: 'bottom' }) });
      }
      return true;
    };

    /** A ruined colonnade segment: a row of stone-brick pillars of seeded height (some
     *  toppled to rubble), the odd broken capital, vines creeping over them. */
    const addColonnade = (r: Rect, axis: 'x' | 'z'): void => {
      const span = axis === 'x' ? [r.x0, r.x1] : [r.z0, r.z1];
      const fixed = axis === 'x' ? midZ(r) : midX(r);
      for (let p = span[0]; p <= span[1]; p += 2) {
        const x = axis === 'x' ? p : fixed;
        const z = axis === 'x' ? fixed : p;
        if (!free(x, z) || outOfYard(x, z)) continue;
        mark(x, z);
        const h = rnd();
        if (h < 0.25) { // a toppled column — just rubble at the base
          ops.push({ op: 'block', pos: [x, gy + 1, z], state: rubble });
          continue;
        }
        const ph = h < 0.55 ? 2 : h < 0.8 ? 3 : 4;
        ops.push({ op: 'fill', from: [x, gy + 1, z], to: [x, clampY(gy + ph), z], state: brick });
        if (rnd() < 0.6) ops.push({ op: 'block', pos: [x, clampY(gy + ph + 1), z], state: rnd() < 0.5 ? cracked : cap }); // broken capital
        if (rnd() < 0.4) ops.push({ op: 'block', pos: [x, clampY(gy + ph), z], state: leaf }); // ivy
      }
    };

    /** A great weeping tree: an oak trunk, a broad canopy, and trailing leaf strands
     *  hanging from the rim — the focal point of the grounds. Marks a 5×5 footprint. */
    const addTree = (tx: number, tz: number): void => {
      const th = Math.min(5, b.y1 - gy - 1);
      if (th < 3) return;
      const topY = gy + th;
      ops.push({ op: 'fill', from: [tx, gy + 1, tz], to: [tx, topY, tz], state: trunk });
      // canopy: a 5×5 ring just under the crown, plus a 3×3 crown
      for (let dx = -2; dx <= 2; dx++) for (let dz = -2; dz <= 2; dz++) {
        if (Math.abs(dx) === 2 && Math.abs(dz) === 2) continue; // round the corners
        ops.push({ op: 'block', pos: [tx + dx, topY, tz + dz], state: leaf });
      }
      for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) {
        ops.push({ op: 'block', pos: [tx + dx, clampY(topY + 1), tz + dz], state: leaf });
      }
      // weeping strands: leaves trailing down from the canopy rim
      for (const [wx, wz] of [[-2, 0], [2, 0], [0, -2], [0, 2], [-2, -1], [2, 1], [-1, 2], [1, -2]] as [number, number][]) {
        const drop = 1 + Math.floor(rnd() * 3);
        for (let d = 1; d <= drop; d++) ops.push({ op: 'block', pos: [tx + wx, topY - d, tz + wz], state: leaf });
      }
      for (let dx = -2; dx <= 2; dx++) for (let dz = -2; dz <= 2; dz++) mark(tx + dx, tz + dz);
    };

    /** A small stone mausoleum/crypt: a mossy hut with a slab roof, an iron grate door
     *  facing `dir` (toward the manor), and a soul lantern over the lintel. */
    const addCrypt = (r: Rect): void => {
      const x0 = r.x0, x1 = r.x0 + 3, z0 = r.z0, z1 = r.z0 + 3;
      const wallTop = clampY(gy + 3);
      ops.push({ op: 'fill', from: [x0, gy, z0], to: [x1, gy, z1], state: cobble }); // floor
      ops.push({ op: 'walls', from: [x0, gy + 1, z0], to: [x1, wallTop, z1], state: moss });
      ops.push({ op: 'fill', from: [x0, clampY(wallTop + 1), z0], to: [x1, clampY(wallTop + 1), z1], state: slab }); // roof
      // doorway on the front (-z) face, grated
      const dxm = x0 + 1;
      ops.push({ op: 'fill', from: [dxm, gy + 1, z0], to: [dxm, gy + 2, z0], state: grate });
      ops.push({ op: 'block', pos: [dxm + 1, clampY(gy + 3), z0], state: lantern });
      ops.push({ op: 'block', pos: [x0, clampY(wallTop), z0], state: leaf }); // a corner of ivy
      for (let x = x0; x <= x1; x++) for (let z = z0; z <= z1; z++) mark(x, z);
    };

    /** A rubble pile: a low seeded cluster of mossy cobble + cracked brick + slabs. */
    const addRubble = (rx: number, rz: number): void => {
      for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) {
        const x = rx + dx, z = rz + dz;
        if (!free(x, z) || outOfYard(x, z) || rnd() < 0.35) continue;
        mark(x, z);
        const h = rnd() < 0.4 ? 2 : 1;
        const mat = rnd() < 0.5 ? rubble : cracked;
        ops.push({ op: 'fill', from: [x, gy + 1, z], to: [x, clampY(gy + h), z], state: mat });
        if (h === 1 && rnd() < 0.4) ops.push({ op: 'block', pos: [x, gy + 2, z], state: slab });
      }
    };

    /** A bare dead tree: a short leafless oak trunk with the odd clinging leaf — gnarled
     *  cemetery growth that breaks up the lawn without the weeping tree's bulk. */
    const addDeadTree = (tx: number, tz: number): void => {
      if (!free(tx, tz) || outOfYard(tx, tz)) return;
      const th = Math.min(2 + Math.floor(rnd() * 3), b.y1 - gy - 1);
      if (th < 2) return;
      mark(tx, tz);
      ops.push({ op: 'fill', from: [tx, gy + 1, tz], to: [tx, clampY(gy + th), tz], state: trunk });
      if (rnd() < 0.6) ops.push({ op: 'block', pos: [tx, clampY(gy + th + 1), tz], state: leaf });
      if (rnd() < 0.4) ops.push({ op: 'block', pos: [tx, clampY(gy + th), tz], state: leaf });
    };

    /** A churchyard lamp post: a cobble-wall column carrying a soul lantern. */
    const addLampPost = (px: number, pz: number): void => {
      if (!free(px, pz) || outOfYard(px, pz)) return;
      mark(px, pz);
      ops.push({ op: 'fill', from: [px, gy + 1, pz], to: [px, clampY(gy + 2), pz], state: cap });
      ops.push({ op: 'block', pos: [px, clampY(gy + 3), pz], state: lantern });
    };

    // --- Focal features spread across the WHOLE plot ----------------------------------
    // Split the ring into quadrants + side flanks and seed a varied focal feature into
    // each that fits — a weeping tree, a mausoleum, a ruined colonnade, a rubble pile, a
    // dead-tree-and-lamp cluster — so the grounds read alive everywhere, not just front.
    const cz = Math.floor((hz0 + hz1) / 2); // house mid-z, to split the side flanks
    const regions: Rect[] = [
      { x0: b.x0 + 2, x1: cx - 3, z0: b.z0 + 2, z1: hz0 - 2 }, // front-left
      { x0: cx + 3, x1: b.x1 - 2, z0: b.z0 + 2, z1: hz0 - 2 }, // front-right
      { x0: b.x0 + 2, x1: cx - 3, z0: hz1 + 2, z1: b.z1 - 2 }, // back-left
      { x0: cx + 3, x1: b.x1 - 2, z0: hz1 + 2, z1: b.z1 - 2 }, // back-right
      { x0: b.x0 + 2, x1: hx0 - 2, z0: hz0, z1: cz },          // left-front flank
      { x0: b.x0 + 2, x1: hx0 - 2, z0: cz + 1, z1: hz1 },      // left-back flank
      { x0: hx1 + 2, x1: b.x1 - 2, z0: hz0, z1: cz },          // right-front flank
      { x0: hx1 + 2, x1: b.x1 - 2, z0: cz + 1, z1: hz1 },      // right-back flank
    ].filter((r) => fitsRect(r, 3, 3));
    let trees = 0;
    const MAX_TREES = 2;
    for (const r of regions) {
      const pick = rnd();
      if (pick < 0.26 && trees < MAX_TREES && fitsRect(r, 5, 5)) {
        addTree(midX(r), midZ(r)); trees++;
      } else if (pick < 0.46 && fitsRect(r, 4, 4) && !outOfYard(r.x0 + 1, r.z0 + 1)) {
        addCrypt({ x0: r.x0 + 1, x1: r.x0 + 1, z0: r.z0 + 1, z1: r.z0 + 1 });
      } else if (pick < 0.68 && fitsRect(r, 3, 4)) {
        const axis = r.x1 - r.x0 >= r.z1 - r.z0 ? 'x' : 'z';
        addColonnade(r, axis);
      } else if (pick < 0.85) {
        addRubble(midX(r), midZ(r));
      } else {
        addDeadTree(midX(r), midZ(r));
        if (fitsRect(r, 3, 3)) addLampPost(midX(r) + 2 <= r.x1 ? midX(r) + 2 : midX(r), midZ(r));
      }
    }

    // --- Graves scattered through the ENTIRE cemetery (every strip, seeded) ------------
    // No longer front-only rows: a loose grid over all four ring strips, seeded so the
    // headstones speckle the whole plot. Density leans up near the approach (front).
    for (const s of strips) {
      for (let gx = s.x0 + 1; gx <= s.x1 - 1; gx += 2) {
        if (Math.abs(gx - cx) <= 1) continue; // keep the central path clear
        for (let gz = s.z0 + 1; gz <= s.z1 - 1; gz += 2) {
          if (gz === crossZ || Math.abs(gz - crossZ) <= 1) continue; // clear the transept
          const front = gz <= hz0; // the great approach is densest
          if (rnd() < (front ? 0.5 : 0.34)) addGrave(gx, gz);
        }
      }
    }

    // --- A few lamp posts dotting the grounds for the eerie blue light -----------------
    for (const r of regions) {
      if (rnd() < 0.35) addLampPost(midX(r), midZ(r));
    }

    // --- Overgrowth scatter: ferns, poppies and the odd leaf clump reclaiming the lawn -
    for (const s of strips) {
      for (let x = Math.max(s.x0, b.x0 + 1); x <= Math.min(s.x1, b.x1 - 1); x++) {
        for (let z = Math.max(s.z0, b.z0 + 1); z <= Math.min(s.z1, b.z1 - 1); z++) {
          if (!free(x, z) || cut(x, z)) continue;
          const r = rnd();
          if (r < 0.14) ops.push({ op: 'block', pos: [x, gy + 1, z], state: fern });
          else if (r < 0.19) ops.push({ op: 'block', pos: [x, gy + 1, z], state: poppy });
          else if (r < 0.215) ops.push({ op: 'block', pos: [x, gy + 1, z], state: leaf });
        }
      }
    }

    return ops;
  },
};
