// "modern" surroundings — the contemporary villa's grounds, built to read as DESIGNED
// landscaping rather than "a pool in a lawn". Compared with the other yards this one is
// deliberately the most CONSTRUCTED: a crisp rectilinear plot framed by a modern
// PERIMETER WALL (white-concrete pillars carrying lanterns/slab caps, linked by dark
// iron-bar panels, opened by a lantern-flanked gate aligned with the front door), a
// quartz POOL TERRACE with a recessed, edge-lit pool + sun loungers, a striped
// quartz/light-grey ENTRY WALK from the gate to the door, raised LILAC flower beds, and
// clipped TOPIARY columns + hedges over the lawn. Everything stays ≤3 cells tall
// (landscaping, never construction — the lamp-post lantern is the cap) and OPEN-AIR.
//
// The geometry covers the RING ONLY: the host structure insets its massing by the shared
// scaled margins and hands over the FULL box, so this module re-derives the house
// footprint from the same function — both sides agree by construction. The margins SCALE
// with the house, so a bigger villa earns a bigger, denser plot instead of a wider void.
// All blocks are semantic roles; the module's own kit wins over the decoration (like a
// basement) so the white-and-glass palette survives any look.
import type { AuthoringOp } from '../../authoring/types';
import { surroundMarginsForOuter } from '@/shared/domain/surroundings';
import type { Box, RolePalette } from '../structure-types/types';
import type { SurroundingsModule } from './types';

/** Foliage must not despawn in-game — every leaf is placed persistent. */
const LEAF = { persistent: 'true' };
/** Perimeter pillars sit this many cells apart along each run (corners always get one). */
const POST_STEP = 4;

/** The inner house footprint within the full box `b`. */
interface House { hx0: number; hx1: number; hz0: number; hz1: number }

/** The four lawn strips of the ring (full box minus the house footprint), clipped to
 *  valid spans. */
function lawnStrips(b: Box, h: House) {
  return [
    { x0: b.x0, x1: b.x1, z0: b.z0, z1: h.hz0 - 1 }, // front
    { x0: b.x0, x1: b.x1, z0: h.hz1 + 1, z1: b.z1 }, // back
    { x0: b.x0, x1: h.hx0 - 1, z0: h.hz0, z1: h.hz1 }, // left
    { x0: h.hx1 + 1, x1: b.x1, z0: h.hz0, z1: h.hz1 }, // right
  ].filter((s) => s.x1 >= s.x0 && s.z1 >= s.z0);
}

/** The recessed pool rectangle on the wider flank of the entry walk across the front
 *  terrace, or null when neither side has room for a readable pool (≥ 5×3). */
function poolRect(b: Box, h: House, cx: number): { x0: number; x1: number; z0: number; z1: number } | null {
  const z0 = b.z0 + 2, z1 = h.hz0 - 3;
  if (z1 - z0 + 1 < 3) return null;
  const right = { x0: cx + 4, x1: b.x1 - 3, z0, z1 };
  const left = { x0: b.x0 + 3, x1: cx - 4, z0, z1 };
  const pick = right.x1 - right.x0 >= left.x1 - left.x0 ? right : left;
  return pick.x1 - pick.x0 + 1 >= 5 ? pick : null;
}

export const modern: SurroundingsModule = {
  id: 'modern',
  label: 'Modern',
  category: 'surroundings',
  description:
    'Contemporary villa grounds wrapping the house: a modern perimeter wall of white-concrete ' +
    'pillars (lantern/slab caps) linked by dark iron-bar panels with a gate aligned to the ' +
    'door, a quartz pool terrace with a recessed, edge-lit pool and sun loungers, quartz side ' +
    'patios, a striped quartz/light-grey entry walk, raised lilac beds, and a few crisp topiary ' +
    'accents. Manicured hard landscaping — clean, never weedy — and the most constructed of the ' +
    'yards; it scales with the house, so a bigger villa gets a denser plot. The build box grows ' +
    'beyond the house shell to fit the ring.',
  knowledge: 'nbt/modules/surroundings/modern.md',
  appliesTo: ['villa', 'tower'],
  // Previewed as the full modern villa + its grounds (the ring only reads in context).
  preview: { size: [27, 12, 29], params: { floors: 2 } },
  // A self-contained landscaping kit (wins over the decoration, like a basement's stone):
  // crisp white concrete + quartz, dark iron-bar railings, grey paving, glass-clear water,
  // sea-lantern light, and purple lilac in the beds.
  defaults: {
    ground: 'minecraft:grass_block',
    floor: 'minecraft:smooth_quartz', // the terrace/patio deck
    path: 'minecraft:light_gray_concrete', // the walkway tiles
    trim: 'minecraft:smooth_quartz_slab', // pillar caps + lounger backs
    accent: 'minecraft:polished_blackstone', // dark edging
    wall: 'minecraft:white_concrete', // pillars, pool coping, planters
    bars: 'minecraft:iron_bars', // the dark perimeter rail panels
    plant: 'minecraft:oak_leaves', // hedges + topiary
    flower: 'minecraft:lilac', // the purple flower beds (a 2-tall plant)
    roof: 'minecraft:smooth_quartz_stairs', // loungers + the threshold steps
    water: 'minecraft:water',
    light: 'minecraft:sea_lantern',
  },
  // GENERIC over the FULL box: the house footprint is re-derived from the shared scaled
  // margins (the host inset itself by the same function), the ring around it is the plot.
  build({ box: b, palette, surroundSizing }): AuthoringOp[] {
    const m = surroundMarginsForOuter('modern', b.W, b.D, surroundSizing);
    if (!m) return [];
    const h: House = {
      hx0: b.x0 + m.side, hx1: b.x1 - m.side,
      hz0: b.z0 + m.front, hz1: b.z1 - m.back,
    };
    if (h.hx1 - h.hx0 < 2 || h.hz1 - h.hz0 < 2) return []; // no house footprint left — nothing to wrap
    const gy = b.y0; // the ground layer (the house floor sits at the same level)
    const cx = Math.floor((b.x0 + b.x1) / 2); // the door column (margins are x-symmetric)

    const ops: AuthoringOp[] = [];
    const inHouse = (x: number, z: number): boolean => x >= h.hx0 && x <= h.hx1 && z >= h.hz0 && z <= h.hz1;

    // Deliberately DETERMINISTIC + tidy: a modern plot is manicured hard landscaping, not a
    // scattered, weedy lawn. Greenery is limited to defined accents (topiary columns + the
    // lilac beds) — no random bush scatter.
    lawnBase(ops, b, h, palette, inHouse);
    frontTerrace(ops, b, h, palette);
    sidePatios(ops, b, h, palette, inHouse);
    innerPaving(ops, b, h, palette, inHouse);
    perimeterWall(ops, b, cx, palette);
    entryWalk(ops, b, h, cx, palette);
    const pool = poolRect(b, h, cx);
    if (pool) poolDeck(ops, pool, gy, palette);
    flowerBeds(ops, b, h, cx, palette, pool);
    topiaryAccents(ops, b, palette, pool);
    lawnLights(ops, b, h, palette);

    return ops;
  },
};

/** Grass over the whole ring (every cell outside the house footprint). */
function lawnBase(ops: AuthoringOp[], b: Box, h: House, palette: RolePalette, inHouse: (x: number, z: number) => boolean): void {
  const lawn = palette.get('ground');
  for (const s of lawnStrips(b, h)) {
    for (let x = s.x0; x <= s.x1; x++) {
      for (let z = s.z0; z <= s.z1; z++) if (!inHouse(x, z)) ops.push({ op: 'block', pos: [x, gyOf(b), z], state: lawn });
    }
  }
}

/** The quartz pool terrace across the entry face, inside the front wall row. */
function frontTerrace(ops: AuthoringOp[], b: Box, h: House, palette: RolePalette): void {
  const deck = palette.get('floor');
  for (let x = b.x0 + 1; x <= b.x1 - 1; x++) {
    for (let z = b.z0 + 1; z <= h.hz0 - 1; z++) ops.push({ op: 'block', pos: [x, gyOf(b), z], state: deck });
  }
}

/** A one-cell light-grey paving band just inside the perimeter wall around the whole plot
 *  — the crisp frame the modern look reads from. Skips the house footprint + the front
 *  terrace (already quartz). */
function innerPaving(ops: AuthoringOp[], b: Box, h: House, palette: RolePalette, inHouse: (x: number, z: number) => boolean): void {
  const tile = palette.get('path');
  const gy = gyOf(b);
  const place = (x: number, z: number): void => {
    if (inHouse(x, z) || z <= h.hz0 - 1) return; // not on the house, not over the front terrace
    ops.push({ op: 'block', pos: [x, gy, z], state: tile });
  };
  for (let x = b.x0 + 1; x <= b.x1 - 1; x++) { place(x, b.z0 + 1); place(x, b.z1 - 1); }
  for (let z = b.z0 + 1; z <= b.z1 - 1; z++) { place(b.x0 + 1, z); place(b.x1 - 1, z); }
}

/** The modern perimeter WALL: white-concrete pillars (2 tall) every {@link POST_STEP}
 *  cells and at every corner, capped with a lantern (every other post) or a quartz slab,
 *  linked by dark iron-bar panels (2 tall) between them. The front run is opened at the
 *  door column for a gate flanked by taller lantern pillars. */
function perimeterWall(ops: AuthoringOp[], b: Box, cx: number, palette: RolePalette): void {
  const gy = gyOf(b);
  const post = palette.get('wall');
  const bar = palette.get('bars');
  const cap = palette.get('trim', { type: 'bottom' }); // a flat slab resting on the post top
  const lantern = palette.get('light');
  const isCorner = (x: number, z: number): boolean => (x === b.x0 || x === b.x1) && (z === b.z0 || z === b.z1);
  const gate = (x: number, z: number): boolean => z === b.z0 && Math.abs(x - cx) <= 1; // the open doorway
  const gatePost = (x: number, z: number): boolean => z === b.z0 && Math.abs(x - cx) === 2; // its flanking piers

  // Walk the rectangle perimeter clockwise from the front-left, tracking the run index so
  // posts land on an even rhythm.
  const rim: [number, number][] = [];
  for (let x = b.x0; x <= b.x1; x++) rim.push([x, b.z0]);
  for (let z = b.z0 + 1; z <= b.z1; z++) rim.push([b.x1, z]);
  for (let x = b.x1 - 1; x >= b.x0; x--) rim.push([x, b.z1]);
  for (let z = b.z1 - 1; z >= b.z0 + 1; z--) rim.push([b.x0, z]);

  let i = 0;
  let litToggle = false;
  for (const [x, z] of rim) {
    if (gate(x, z)) { i++; continue; } // the gate stays open
    const isPost = isCorner(x, z) || gatePost(x, z) || i % POST_STEP === 0;
    if (isPost) {
      ops.push({ op: 'fill', from: [x, gy + 1, z], to: [x, gy + 2, z], state: post });
      const lit = isCorner(x, z) || gatePost(x, z) || litToggle;
      litToggle = !litToggle;
      ops.push({ op: 'block', pos: [x, gy + 3, z], state: lit ? lantern : cap });
    } else {
      ops.push({ op: 'fill', from: [x, gy + 1, z], to: [x, gy + 2, z], state: bar });
    }
    i++;
  }
}

/** The striped entry walk from the gate to the front door: a 3-wide run with a quartz
 *  threshold step at the street edge, light-grey centre tiles banded by quartz, and a pair
 *  of in-ground sea lanterns. */
function entryWalk(ops: AuthoringOp[], b: Box, h: House, cx: number, palette: RolePalette): void {
  const gy = gyOf(b);
  const deck = palette.get('floor');
  const tile = palette.get('path');
  const light = palette.get('light');
  const step = palette.get('roof', { facing: 'south', half: 'bottom' }); // ascends toward the house
  // Threshold steps at the street edge (the gate mouth).
  ops.push({ op: 'fill', from: [cx - 1, gy, b.z0], to: [cx + 1, gy, b.z0], state: step });
  // A clean quartz spine straight to the door, flanked by light-grey tiles with quartz
  // cross-rungs every other row (the ladder-stripe modern walk).
  for (let z = b.z0 + 1; z <= h.hz0 - 1; z++) {
    const rung = (z - b.z0) % 2 === 0; // a full-width quartz band on the even rows
    ops.push({ op: 'block', pos: [cx, gy, z], state: deck });
    for (const ex of [cx - 1, cx + 1]) ops.push({ op: 'block', pos: [ex, gy, z], state: rung ? deck : tile });
  }
  for (const z of [b.z0 + 2, h.hz0 - 2]) {
    if (z > b.z0 && z < h.hz0) for (const ex of [cx - 2, cx + 2]) ops.push({ op: 'block', pos: [ex, gy, z], state: light });
  }
}

/** The recessed pool: glass-clear water flush with the terrace, a white-concrete coping
 *  frame around it with sea lanterns embedded at the corners + edge midpoints, and a pair
 *  of quartz-stair sun loungers on the house side facing the water. */
function poolDeck(ops: AuthoringOp[], pool: { x0: number; x1: number; z0: number; z1: number }, gy: number, palette: RolePalette): void {
  const water = palette.get('water');
  const frame = palette.get('wall');
  const light = palette.get('light');
  const lounger = palette.get('roof', { facing: 'north', half: 'bottom' }); // recliner facing the pool
  // Recessed water, flush with the deck.
  ops.push({ op: 'fill', from: [pool.x0, gy, pool.z0], to: [pool.x1, gy, pool.z1], state: water });
  // White coping frame one cell out (replaces the terrace quartz for contrast).
  for (let x = pool.x0 - 1; x <= pool.x1 + 1; x++) for (const z of [pool.z0 - 1, pool.z1 + 1]) ops.push({ op: 'block', pos: [x, gy, z], state: frame });
  for (let z = pool.z0; z <= pool.z1; z++) for (const x of [pool.x0 - 1, pool.x1 + 1]) ops.push({ op: 'block', pos: [x, gy, z], state: frame });
  // Edge lights: the four corners + the long-edge midpoints of the frame.
  const mx = Math.floor((pool.x0 + pool.x1) / 2);
  for (const [lx, lz] of [
    [pool.x0 - 1, pool.z0 - 1], [pool.x1 + 1, pool.z0 - 1],
    [pool.x0 - 1, pool.z1 + 1], [pool.x1 + 1, pool.z1 + 1],
    [mx, pool.z0 - 1], [mx, pool.z1 + 1],
  ] as [number, number][]) ops.push({ op: 'block', pos: [lx, gy, lz], state: light });
  // Two sun loungers on the house side of the pool, facing the water.
  for (const lx of [mx - 2, mx + 2]) ops.push({ op: 'block', pos: [lx, gy, pool.z1 + 2], state: lounger });
}

/** Lilac flower beds flanking the entry walk on the front terrace: a strip of grass cut
 *  back into the quartz, edged with a low white-concrete kerb, planted with 2-tall lilac. */
function flowerBeds(
  ops: AuthoringOp[], b: Box, h: House, cx: number, palette: RolePalette,
  pool: { x0: number; x1: number; z0: number; z1: number } | null,
): void {
  const gy = gyOf(b);
  const soil = palette.get('ground');
  const lo = palette.get('flower', { half: 'lower' });
  const hi = palette.get('flower', { half: 'upper' });
  const beds: { x0: number; x1: number }[] = [];
  // A bed on each side of the gate, between the walk and the plot edge, on the front-most
  // terrace row so it reads from the street.
  if (cx - 3 - (b.x0 + 2) >= 1) beds.push({ x0: b.x0 + 2, x1: cx - 3 });
  if (b.x1 - 2 - (cx + 3) >= 1) beds.push({ x0: cx + 3, x1: b.x1 - 2 });
  const bz = b.z0 + 1; // the front terrace row, just inside the wall
  for (const bed of beds) {
    for (let x = bed.x0; x <= bed.x1; x++) {
      if (pool && x >= pool.x0 - 1 && x <= pool.x1 + 1) continue; // don't plant into the pool deck
      ops.push({ op: 'block', pos: [x, gy, bz], state: soil }); // grass cut into the quartz
      ops.push({ op: 'block', pos: [x, gy + 1, bz], state: lo });
      ops.push({ op: 'block', pos: [x, gy + 2, bz], state: hi });
    }
  }
}

/** Quartz patio bands wrapping the side/back lawns so a big plot reads as a DESIGNED,
 *  hard-landscaped yard (refs) instead of a bare grass field. A 2-cell terrace band hugs
 *  the house on the sides + back; the rest stays clean lawn. */
function sidePatios(ops: AuthoringOp[], b: Box, h: House, palette: RolePalette, inHouse: (x: number, z: number) => boolean): void {
  const gy = gyOf(b);
  const deck = palette.get('floor');
  const band = (x: number, z: number): void => {
    if (x <= b.x0 || x >= b.x1 || z <= b.z0 || z >= b.z1 || inHouse(x, z)) return;
    ops.push({ op: 'block', pos: [x, gy, z], state: deck });
  };
  // A patio apron one–two cells out from the house on the two sides + the back.
  for (let z = h.hz0; z <= h.hz1; z++) for (let d = 1; d <= 2; d++) { band(h.hx0 - d, z); band(h.hx1 + d, z); }
  for (let x = h.hx0 - 2; x <= h.hx1 + 2; x++) for (let d = 1; d <= 2; d++) band(x, h.hz1 + d);
}

/** Clipped topiary columns (3-tall persistent leaves) at the front-terrace corners + the
 *  pool ends — the only standing greenery, kept to a few crisp accents (a modern plot is
 *  manicured, never weedy). */
function topiaryAccents(
  ops: AuthoringOp[], b: Box, palette: RolePalette,
  pool: { x0: number; x1: number; z0: number; z1: number } | null,
): void {
  const gy = gyOf(b);
  const leaf = palette.get('plant', LEAF);
  const topiary = (x: number, z: number): void => {
    if (x <= b.x0 || x >= b.x1 || z <= b.z0 || z >= b.z1) return;
    ops.push({ op: 'fill', from: [x, gy + 1, z], to: [x, gy + 3, z], state: leaf });
  };
  topiary(b.x0 + 2, b.z0 + 2); // terrace-front corners (inside the wall + paving band)
  topiary(b.x1 - 2, b.z0 + 2);
  if (pool) { // flank the pool's street-side corners
    topiary(pool.x0 - 1, pool.z0 - 1);
    topiary(pool.x1 + 1, pool.z0 - 1);
  }
}

/** A pair of light bollards on the back lawn — clean, deterministic accent lighting (no
 *  scattered bushes). */
function lawnLights(ops: AuthoringOp[], b: Box, h: House, palette: RolePalette): void {
  const gy = gyOf(b);
  const light = palette.get('light');
  const cx = Math.floor((b.x0 + b.x1) / 2);
  if (b.z1 - 2 > h.hz1) {
    ops.push({ op: 'block', pos: [cx - 3, gy + 1, b.z1 - 2], state: light });
    ops.push({ op: 'block', pos: [cx + 3, gy + 1, b.z1 - 2], state: light });
  }
}

/** The ground layer of a box (its floor y). */
function gyOf(b: Box): number {
  return b.y0;
}
