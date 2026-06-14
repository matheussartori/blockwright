// "modern" surroundings — the contemporary villa's grounds: a white-quartz POOL TERRACE
// across the front (a recessed water pool with embedded sea-lantern corner lights), a
// stepped ENTRY WALK aligned with the front door (dark edging, in-floor lighting, white
// stair threshold at the street edge), white-concrete PLANTERS flanking the approach,
// a manicured HEDGE rim around the whole yard, and seeded bushes + light bollards over
// the side/back lawns. Everything stays at ground level (max 2 cells tall) so the ring
// reads as landscaping, never as construction. The yard's corners are cut by SEEDED
// chamfers (see outline.ts) and the lawn/terrace are clipped to that outline, so the
// grounds are never a plain rectangle and no two builds share a footprint.
//
// The geometry covers the RING ONLY: the host structure insets its massing by the shared
// scaled margins and hands over the FULL box, so this module re-derives the house
// footprint from the same function — both sides agree by construction, no extras needed.
// The margins SCALE with the house (`shared/domain/surroundings.ts`): a bigger villa
// earns wider grounds. All blocks are semantic roles; the module's own kit wins over the
// decoration (like a basement) so the lawn/hedge survive any look.
import type { AuthoringOp } from '../../authoring/types';
import { surroundMarginsForOuter } from '@/shared/domain/surroundings';
import { mulberry32 } from '../rng';
import type { Box, RolePalette } from '../structure-types/types';
import { inCut, rimCells, seededChamfers } from './outline';
import type { SurroundingsModule } from './types';

/** Hedges/bushes must not despawn in-game — every leaf is placed persistent. */
const LEAF = { persistent: 'true' };

/** The four lawn strips of the ring (full box minus the house footprint), clipped to
 *  valid spans. `h*` are the house-footprint bounds within the box. */
function lawnStrips(b: Box, hx0: number, hx1: number, hz0: number, hz1: number) {
  return [
    { x0: b.x0, x1: b.x1, z0: b.z0, z1: hz0 - 1 }, // front
    { x0: b.x0, x1: b.x1, z0: hz1 + 1, z1: b.z1 }, // back
    { x0: b.x0, x1: hx0 - 1, z0: hz0, z1: hz1 }, // left
    { x0: hx1 + 1, x1: b.x1, z0: hz0, z1: hz1 }, // right
  ].filter((s) => s.x1 >= s.x0 && s.z1 >= s.z0);
}

/** The pool rectangle: the wider flank of the front terrace beside the entry walk, or
 *  null when neither side has room for a readable pool (≥ 4×3). */
function poolRect(b: Box, cx: number, hz0: number): { x0: number; x1: number; z0: number; z1: number } | null {
  const z0 = b.z0 + 2, z1 = hz0 - 2;
  if (z1 - z0 + 1 < 3) return null;
  const right = { x0: cx + 4, x1: b.x1 - 2, z0, z1 };
  const left = { x0: b.x0 + 2, x1: cx - 4, z0, z1 };
  const pick = right.x1 - right.x0 >= left.x1 - left.x0 ? right : left;
  return pick.x1 - pick.x0 + 1 >= 4 ? pick : null;
}

/** Seeded bush scatter over a lawn strip: low leaf clumps (some 2-high), inset one
 *  cell from the box rim so they never merge into the perimeter hedge, and never in
 *  a cut corner (no lawn there). */
function scatterBushes(
  ops: AuthoringOp[],
  b: Box,
  strip: { x0: number; x1: number; z0: number; z1: number },
  gy: number,
  bush: number,
  rnd: () => number,
  cut: (x: number, z: number) => boolean,
): void {
  for (let x = Math.max(strip.x0, b.x0 + 1); x <= Math.min(strip.x1, b.x1 - 1); x++) {
    for (let z = Math.max(strip.z0, b.z0 + 1); z <= Math.min(strip.z1, b.z1 - 1); z++) {
      if (rnd() >= 0.1 || cut(x, z)) continue;
      ops.push({ op: 'block', pos: [x, gy + 1, z], state: bush });
      if (rnd() < 0.3) ops.push({ op: 'block', pos: [x, gy + 2, z], state: bush });
    }
  }
}

/** A white-concrete planter box with a clipped shrub on top. */
function planter(ops: AuthoringOp[], x: number, y: number, z: number, palette: RolePalette): void {
  ops.push({ op: 'block', pos: [x, y, z], state: palette.get('wall') });
  ops.push({ op: 'block', pos: [x, y + 1, z], state: palette.get('plant', LEAF) });
}

export const modern: SurroundingsModule = {
  id: 'modern',
  label: 'Modern',
  category: 'surroundings',
  description:
    'Contemporary villa grounds wrapping the house: a white-quartz pool terrace across the ' +
    'front with a recessed, lantern-lit pool, a stepped entry walk aligned with the door ' +
    '(dark edging, in-floor lights, a stair threshold at the street edge), white planters, ' +
    'a manicured hedge around the whole yard, and bushes + light bollards over the lawns. ' +
    'The grounds scale with the house — a bigger villa earns a wider ring — and the ' +
    'hedge outline is chamfered by seed, so the yard is never a plain rectangle. ' +
    'The build box grows beyond the house shell to fit the ring.',
  knowledge: 'nbt/modules/surroundings/modern.md',
  appliesTo: ['modern', 'tower'],
  // Previewed as the full modern villa + its grounds (the ring only reads in context).
  preview: { size: [23, 12, 25], params: { floors: 2 } },
  // A self-contained landscaping kit (wins over the decoration, like a basement's stone):
  // lawn + quartz terrace + dark edging + glass-clear water + crisp sea-lantern light.
  defaults: {
    ground: 'minecraft:grass_block',
    floor: 'minecraft:smooth_quartz',
    trim: 'minecraft:smooth_quartz_slab',
    accent: 'minecraft:polished_blackstone',
    wall: 'minecraft:white_concrete',
    plant: 'minecraft:oak_leaves',
    roof: 'minecraft:smooth_quartz_stairs', // the entry threshold steps
    water: 'minecraft:water',
    light: 'minecraft:sea_lantern',
  },
  // GENERIC over the FULL box: the house footprint is re-derived from the shared scaled
  // margins (the host inset itself by the same function), the ring around it is the yard.
  build({ box: b, palette, seed, surroundSizing }): AuthoringOp[] {
    const m = surroundMarginsForOuter('modern', b.W, b.D, surroundSizing);
    if (!m) return [];
    const hx0 = b.x0 + m.side, hx1 = b.x1 - m.side;
    const hz0 = b.z0 + m.front, hz1 = b.z1 - m.back;
    if (hx1 - hx0 < 2 || hz1 - hz0 < 2) return []; // no house footprint left — nothing to wrap
    const gy = b.y0; // the ground layer (the house floor sits at the same level)
    const cx = Math.floor((b.x0 + b.x1) / 2); // the door column (margins are x-symmetric)

    const lawn = palette.get('ground');
    const deck = palette.get('floor');
    const edge = palette.get('accent');
    const hedge = palette.get('plant', LEAF);
    const water = palette.get('water');
    const light = palette.get('light');
    const ops: AuthoringOp[] = [];
    const rnd = mulberry32(seed);

    // The seeded chamfered outline — scaled with the ring's margins. Cells beyond it
    // get NOTHING, so the grounds' footprint is never the plain rectangle.
    const ch = seededChamfers(rnd, m, 2, 4);
    const cut = (x: number, z: number): boolean => inCut(b, ch, x, z);

    // --- Lawn base: the ring at ground level, clipped to the chamfered outline --------
    const strips = lawnStrips(b, hx0, hx1, hz0, hz1);
    for (const s of strips) {
      for (let x = s.x0; x <= s.x1; x++) {
        for (let z = s.z0; z <= s.z1; z++) {
          if (!cut(x, z)) ops.push({ op: 'block', pos: [x, gy, z], state: lawn });
        }
      }
    }

    // --- Front terrace: a quartz deck across the entry face (inside the hedge row) ----
    for (let x = b.x0 + 1; x <= b.x1 - 1; x++) {
      for (let z = b.z0 + 1; z <= hz0 - 1; z++) {
        if (!cut(x, z)) ops.push({ op: 'block', pos: [x, gy, z], state: deck });
      }
    }

    // --- Perimeter hedge: a clipped leaf rim following the chamfered outline, gapped
    // at the entry walk's mouth.
    for (const p of rimCells(b, ch)) {
      if (p.z === b.z0 && Math.abs(p.x - cx) <= 1) continue; // the walk's mouth stays open
      ops.push({ op: 'block', pos: [p.x, gy + 1, p.z], state: hedge });
    }

    // --- Entry walk: threshold steps at the street edge, dark lit edging to the door --
    const step = palette.get('roof', { facing: 'south', half: 'bottom' }); // ascends toward the house
    ops.push({ op: 'fill', from: [cx - 1, gy, b.z0], to: [cx + 1, gy, b.z0], state: step });
    for (const ex of [cx - 2, cx + 2]) {
      for (let z = b.z0 + 1; z <= hz0 - 1; z++) {
        ops.push({ op: 'block', pos: [ex, gy, z], state: (z - b.z0) % 3 === 0 ? light : edge });
      }
    }

    // --- Pool: recessed water on the wider flank of the walk, lantern-lit corners -----
    const pool = poolRect(b, cx, hz0);
    if (pool) {
      ops.push({ op: 'fill', from: [pool.x0, gy, pool.z0], to: [pool.x1, gy, pool.z1], state: water });
      for (const [px, pz] of [
        [pool.x0 - 1, pool.z0 - 1], [pool.x1 + 1, pool.z0 - 1],
        [pool.x0 - 1, pool.z1 + 1], [pool.x1 + 1, pool.z1 + 1],
      ] as [number, number][]) {
        if (!cut(px, pz)) ops.push({ op: 'block', pos: [px, gy, pz], state: light });
      }
    }

    // --- Planters: flank the walk's mouth + the house's front corners -----------------
    planter(ops, cx - 3, gy + 1, b.z0 + 1, palette);
    planter(ops, cx + 3, gy + 1, b.z0 + 1, palette);
    if (hx0 !== cx - 3 || hz0 - 1 !== b.z0 + 1) {
      planter(ops, hx0, gy + 1, hz0 - 1, palette);
      planter(ops, hx1, gy + 1, hz0 - 1, palette);
    }

    // --- Side/back garden: seeded bushes + a pair of light bollards -------------------
    for (const s of strips.slice(1)) scatterBushes(ops, b, s, gy, hedge, rnd, cut); // skip the front (terrace)
    if (b.z1 - 2 > hz1) {
      ops.push({ op: 'block', pos: [cx - 3, gy + 1, b.z1 - 2], state: light });
      ops.push({ op: 'block', pos: [cx + 3, gy + 1, b.z1 - 2], state: light });
    }

    return ops;
  },
};
