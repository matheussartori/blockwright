// "haunted-tower" — the second member of the `tower` group: a derelict gothic SPIRE, the
// brooding monolith from the references. The fix for "the tower keeps coming out as a plain
// dark cube": the silhouette that makes it read as haunted — a battered flared plinth, a
// vertically RIBBED shaft (organ-pipe buttress pilasters) that STEPS inward in tiers as it
// rises, projecting iron-cage lantern arms on chains, a CARVED SKULL FACE on a wide front, a
// pointed gothic doorway crowned by a glowing inverted cross, soul-lit lancet windows, full-
// height corner buttress piers ending in lit spire finials, and a spiky crenellated crown —
// is NOT prose the model can reliably invent. It is owned by code and SEEDED (`seedShell`),
// so a fresh build keeps the carved massing and only furnishes the gloom inside.
//
// The exterior DETAIL SCALES WITH WIDTH: more ribs and lantern arms on a fat tower, and the
// skull face only draws when the front is wide and tall enough to carve it. So an 80×80 keep
// is densely articulated, never a rectangle. Like every tower it OWNS its crown in code (no
// Roof/Attic slot); Basement, Surroundings and Room modules link via the `tower` group.
//
// Massing in semantic roles (the decoration supplies the blocks); ships its own dark-stone
// kit so it reads as a cursed spire even under a sparse decoration. Paired with `haunted`.
import type { AuthoringOp } from '../../authoring/types';
import { planStoreys } from '@/shared/domain/storeys';
import { mulberry32 } from '../rng';
import type { ParamValues } from '../params';
import { insetHouseBox, yardFor } from '../surroundings';
import type { Box, FloorPlanEntry, RolePalette, StructureType } from './types';
import { addStairCore } from './stair-core';
import { ceilingLanterns, seatDoor, storeyEntries } from './shell-kit';

/** A clamped rect ([x0,x1]×[z0,z1]) at horizontal inset `m` from a box. */
interface Rect { x0: number; z0: number; x1: number; z1: number }

/** The spire's level plan — ONE source shared by `build()` and `floors()`. The shaft stacks
 *  N storeys; the top courses are reserved for the crown deck + crenellated parapet + the
 *  corner spires above it (so the silhouette can spike past the walls). */
function plan(b: Box, params: ParamValues, floorHeights?: number[]) {
  const { y0, y1, H } = b;
  const floors = params.floors as number;
  const crownReserve = H >= 16 ? 3 : 2; // deck + merlons (+ a course for spire tips)
  const maxWallTop = y1 - crownReserve;
  const ladder = planStoreys({ baseY: y0, idealTop: maxWallTop, maxWallTop, floors, floorHeights });
  const wallTop = Math.min(ladder.wallTop, maxWallTop);
  return { storeyCount: floors, slabYs: ladder.slabYs, wallTop };
}

/** The per-storey horizontal inset SCHEDULE — the stepped taper that breaks the rectangle.
 *  The shaft sits one cell in from the flared plinth (`baseInset`) and BATTERS inward as it
 *  rises, the total taper SCALING WITH WIDTH (a fat tower narrows dramatically toward its
 *  crown — the splayed, pyramidal gothic silhouette of the references — while a thin tower
 *  stays mostly vertical). Distributed roughly linearly across the storeys, capped so the
 *  narrowest tier keeps a livable interior. Higher storeys are narrower. */
function makeInset(b: Box, floors: number) {
  const { W, D } = b;
  const baseInset = W >= 9 && D >= 9 ? 1 : 0; // the flared plinth needs room to read
  // Keep at least a 7×7 interior at the narrowest tier so the climb/rooms still fit.
  const hardMax = Math.max(0, Math.min(Math.floor((W - 7) / 2), Math.floor((D - 7) / 2)));
  // The total batter ~quarter of the smaller footprint — strong on a wide tower, gentle on a
  // narrow one — clamped to what the interior can spare.
  const taper = Math.min(hardMax, Math.max(baseInset, Math.round(Math.min(W, D) * 0.24)));
  const span = Math.max(1, floors - 1);
  // EASE-IN (quadratic): the lower body stays near-vertical (a monolithic shaft) and the
  // batter accelerates toward the crown — a tall tower with a tapered spiky top, not a uniform
  // pyramid (the references' silhouette).
  return (f: number): number => Math.min(hardMax, baseInset + Math.round((taper - baseInset) * (f / span) ** 2));
}

export const hauntedTower: StructureType = {
  id: 'haunted-tower',
  label: 'Haunted',
  category: 'structure',
  group: 'tower',
  description:
    'A derelict gothic spire: a battered flared plinth, a vertically ribbed shaft that steps ' +
    'inward in tiers as it rises, projecting iron-cage lantern arms on chains, a carved skull ' +
    'face on a wide front, a pointed gothic doorway under a glowing inverted cross, soul-lit ' +
    'lancet windows, full-height corner buttress piers tipped with lit spires, and a spiky ' +
    'crenellated crown. The carved exterior scales with width — a fat tower is densely ' +
    'articulated, never a box. Owns its crown in code (no Roof slot); links to every Basement, ' +
    'Surroundings and Room module. Best with the Haunted decoration.',
  knowledge: 'nbt/modules/structure/haunted-tower.md',
  preview: { size: [15, 38, 15], params: { decoration: 'cursed', floors: 5 } },
  // A tall spire reads with one cramped program per level, but a fat tower can take two.
  maxRoomsPerFloor: 2,
  // An inherently articulated, multi-volume silhouette — include it in build-complexity gates.
  complex: true,
  // Seeded + locked: the carved shell is compiled and the model only furnishes the interior.
  seedShell: true,
  pairedDecoration: 'cursed',
  params: {
    floors: { kind: 'int', default: 5, min: 2, max: 12, label: 'Floors' },
    // Surfaced as the separate "Surroundings" select (hidden from the type's own controls).
    // Every registered yard links to the `tower` group, so all are offered.
    surroundings: {
      kind: 'enum', default: 'none', values: ['none', 'modern', 'garden', 'graveyard'], label: 'Surroundings',
      labels: { none: 'None', modern: 'Modern', garden: 'Garden', graveyard: 'Graveyard' }, module: 'surroundings',
    },
    decay: { kind: 'unit', default: 0.35 },
  },
  // A cursed dark-stone kit — blackstone shaft, deepslate ribs, soul light.
  defaults: {
    wall: 'minecraft:polished_blackstone_bricks',
    foundation: 'minecraft:cobblestone',
    floor: 'minecraft:dark_oak_planks',
    ceiling: 'minecraft:polished_blackstone_bricks',
    corner: 'minecraft:polished_blackstone', // buttress ribs + corner piers
    accent: 'minecraft:chiseled_polished_blackstone', // belt courses, jambs, brow
    trim: 'minecraft:polished_blackstone_brick_slab', // ledge lips, arm cantilevers, teeth
    roof: 'minecraft:polished_blackstone_brick_stairs', // interior stair core
    window: 'minecraft:gray_stained_glass_pane',
    glass: 'minecraft:gray_stained_glass', // solid sockets — skull eyes, inverted cross
    door: 'minecraft:dark_oak_door',
    fence: 'minecraft:dark_oak_fence', // hanging chains + spire finials
    ladder: 'minecraft:ladder',
    light: 'minecraft:soul_lantern', // the cold blue glow
  },
  build({ box: outer, params, palette, seed, floorHeights, surroundSizing, composeModule }) {
    // A picked surroundings ring reserves the outer margins for the yard; the SPIRE is laid
    // in the inset box and the ring wraps it over the full box (the standard host pattern).
    const yard = yardFor(outer, params, surroundSizing);
    const box = yard ? insetHouseBox(outer, yard, surroundSizing) : outer;
    const { x0, y0, z0, x1, y1, z1, W, D, H } = box;
    const floors = params.floors as number;
    const decay = params.decay as number;

    const wall = palette.get('wall');
    const found = palette.get('foundation');
    const floorIdx = palette.get('floor');
    const deck = palette.get('ceiling');
    const rib = palette.get('corner'); // proud buttress pilasters + corner piers
    const accent = palette.get('accent');
    const win = palette.get('window');
    const glass = palette.get('glass');
    const trim = palette.get('trim', { type: 'top' });
    const fence = palette.get('fence');
    const lantern = palette.get('light', { hanging: 'true' });
    const standLantern = palette.get('light');
    const mossy = palette.weather('wall');

    const rnd = mulberry32(seed);
    const ops: AuthoringOp[] = [];
    const cx = Math.floor((x0 + x1) / 2);
    const cz = Math.floor((z0 + z1) / 2);

    // The yard first (it never overlaps the inset spire).
    if (yard) {
      ops.push(...composeModule('surroundings', yard, [outer.x0, outer.y0, outer.z0], [outer.x1, outer.y1, outer.z1], { surroundSizing }));
    }

    // --- Level plan + taper schedule (shared with floors() via plan()/makeInset) -----------
    const { slabYs, wallTop } = plan(box, params, floorHeights);
    const insetAt = makeInset(box, floors);
    const groundY = slabYs[0];
    const rectAt = (m: number): Rect => ({ x0: x0 + m, z0: z0 + m, x1: x1 - m, z1: z1 - m });
    const tierTop = (f: number): number => (f + 1 < floors ? slabYs[f + 1] - 1 : wallTop);

    // --- Battered flared plinth: a heavy full-box stone base, wider than the inset shaft, so
    // the silhouette splays at the ground (the references' flared foot). A slab lip caps it. ---
    const plinthH = Math.min(3, Math.max(1, Math.floor(H * 0.08)));
    ops.push({ op: 'fill', from: [x0, y0, z0], to: [x1, y0, z1], state: found }); // foundation slab
    ops.push({ op: 'walls', from: [x0, y0, z0], to: [x1, y0 + plinthH - 1, z1], state: found });
    if (insetAt(0) > 0) {
      const lipY = y0 + plinthH;
      for (let x = x0; x <= x1; x++) { ops.push({ op: 'block', pos: [x, lipY, z0], state: trim }); ops.push({ op: 'block', pos: [x, lipY, z1], state: trim }); }
      for (let z = z0 + 1; z < z1; z++) { ops.push({ op: 'block', pos: [x0, lipY, z], state: trim }); ops.push({ op: 'block', pos: [x1, lipY, z], state: trim }); }
    }

    // --- The tiered, ribbed shaft -----------------------------------------------------------
    for (let f = 0; f < floors; f++) {
      const m = insetAt(f);
      const r = rectAt(m);
      const yLo = slabYs[f];
      const yHi = tierTop(f);
      // The tier's four walls.
      ops.push({ op: 'walls', from: [r.x0, yLo, r.z0], to: [r.x1, yHi, r.z1], state: wall });
      // A pale belt course at each storey line (the "white detailing" banding).
      if (f > 0) ops.push({ op: 'walls', from: [r.x0, yLo, r.z0], to: [r.x1, yLo, r.z1], state: accent });
      // Proud vertical BUTTRESS RIBS — pilasters standing one cell off the wall (so they cast
      // the organ-pipe corrugation), spaced ~every 3 cells, scaling in count with the width.
      ops.push(...tierRibs(r, m, yLo, yHi, rib));
      // A floor/ledge DECK at the top of this tier: it both floors the storey above AND covers
      // the exposed setback ring where the next tier steps inward (so nothing is open to sky).
      if (f + 1 < floors) {
        const slabY = slabYs[f + 1];
        ops.push({ op: 'fill', from: [r.x0, slabY, r.z0], to: [r.x1, slabY, r.z1], state: deck }); // ring + ceiling
        const mUp = insetAt(f + 1);
        const ru = rectAt(mUp);
        ops.push({ op: 'fill', from: [ru.x0 + 1, slabY, ru.z0 + 1], to: [ru.x1 - 1, slabY, ru.z1 - 1], state: floorIdx }); // interior floor
      }
    }
    // Ground-floor interior surface over the foundation.
    ops.push({ op: 'fill', from: [x0 + 1, groundY, z0 + 1], to: [x1 - 1, groundY, z1 - 1], state: floorIdx });

    // --- Crown: deck the top tier, ring it with a spiky crenellated parapet, raise a central
    // spire. The keep OWNS this — no roof module. ------------------------------------------
    const mTop = insetAt(floors - 1);
    const rTop = rectAt(mTop);
    ops.push({ op: 'fill', from: [rTop.x0, wallTop, rTop.z0], to: [rTop.x1, wallTop, rTop.z1], state: deck });
    ops.push(...crenellations(rTop, wallTop + 1, wall, accent));
    // Central spire above the deck (a lit pinnacle), height-gated.
    if (y1 - wallTop >= 2) {
      const spireTop = Math.min(y1, wallTop + Math.max(2, Math.floor(H * 0.1)));
      ops.push({ op: 'fill', from: [cx, wallTop + 1, cz], to: [cx, spireTop, cz], state: rib });
      ops.push({ op: 'block', pos: [cx, Math.min(spireTop + 1, y1), cz], state: fence });
      if (spireTop + 1 < y1) ops.push({ op: 'block', pos: [cx, spireTop + 2 <= y1 ? spireTop + 2 : y1, cz], state: standLantern });
    }

    // --- Full-height CORNER BUTTRESS PIERS at the flared base corners, rising PAST the crown
    // to lit spire finials — the spiky corners of the references. They project beyond the
    // inset shaft, so the silhouette bristles. ---------------------------------------------
    const pierTop = Math.min(y1 - 1, wallTop + Math.max(2, Math.floor(H * 0.12)));
    for (const [px, pz] of [[x0, z0], [x1, z0], [x0, z1], [x1, z1]] as const) {
      ops.push({ op: 'fill', from: [px, y0, pz], to: [px, pierTop, pz], state: rib });
      // An L-foot along the two adjacent base faces beefs the buttress on a wide tower.
      if (W >= 11 && D >= 11) {
        const sx = px === x0 ? 1 : -1, sz = pz === z0 ? 1 : -1;
        const footTop = y0 + Math.floor((pierTop - y0) * 0.55);
        ops.push({ op: 'fill', from: [px + sx, y0, pz], to: [px + sx, footTop, pz], state: rib });
        ops.push({ op: 'fill', from: [px, y0, pz + sz], to: [px, footTop, pz + sz], state: rib });
      }
      const capY = Math.min(y1, pierTop + 1);
      ops.push({ op: 'block', pos: [px, capY, pz], state: fence });
      if (capY < y1) ops.push({ op: 'block', pos: [px, capY + 1 <= y1 ? capY + 1 : y1, pz], state: standLantern });
    }

    // --- Soul-lit lancet windows: a narrow 2-3-tall slit centred on each tier face (skip the
    // front-ground wall — the doorway is there), with a hanging soul lantern just inside so the
    // opening GLOWS blue. ------------------------------------------------------------------
    for (let f = 0; f < floors; f++) {
      const m = insetAt(f);
      const r = rectAt(m);
      const wy = slabYs[f] + 2;
      const wTop = Math.min(wy + (tierTop(f) - wy >= 3 ? 2 : 1), tierTop(f) - 1);
      if (wTop < wy) continue;
      const slit = (x: number, z: number, inX: number, inZ: number): void => {
        for (let y = wy; y <= wTop; y++) ops.push({ op: 'block', pos: [x, y, z], state: win });
        ops.push({ op: 'block', pos: [x + inX, wTop, z + inZ], state: lantern }); // glow just inside
      };
      if (f !== 0) slit(cx, r.z0, 0, 1);
      slit(cx, r.z1, 0, -1);
      slit(r.x0, cz, 1, 0);
      slit(r.x1, cz, -1, 0);
    }

    // --- Projecting LANTERN ARMS on chains, on the upper tiers — the iconic hanging cages.
    // Each cantilevers a slab arm out past the wall, drops a fence chain, and hangs a lantern.
    // Gated to tiers inset enough to extend outward within the box; count scales with width. ---
    for (let f = Math.max(1, Math.floor(floors * 0.4)); f < floors; f++) {
      const m = insetAt(f);
      if (m < 2) continue; // no outward room within the box
      const r = rectAt(m);
      const ay = Math.floor((slabYs[f] + tierTop(f)) / 2);
      // More arms on a wider face (the cascading cages of the references), one on a narrow face.
      const xs = W >= 21 ? [cx - Math.floor(W / 4), cx, cx + Math.floor(W / 4)] : W >= 13 ? [cx - Math.floor(W / 5), cx + Math.floor(W / 5)] : [cx];
      const zs = D >= 21 ? [cz - Math.floor(D / 4), cz, cz + Math.floor(D / 4)] : D >= 13 ? [cz - Math.floor(D / 5), cz + Math.floor(D / 5)] : [cz];
      for (const ax of xs) {
        ops.push(...lanternArm(ax, ay, r.z0, 0, -1, m, trim, fence, lantern)); // front, out toward z0-
        ops.push(...lanternArm(ax, ay, r.z1, 0, 1, m, trim, fence, lantern)); // back
      }
      for (const az of zs) {
        ops.push(...lanternArm(r.x0, ay, az, -1, 0, m, trim, fence, lantern)); // left
        ops.push(...lanternArm(r.x1, ay, az, 1, 0, m, trim, fence, lantern)); // right
      }
    }

    // --- A CARVED SKULL FACE on the front of an upper-middle tier, when the front is wide and
    // tall enough to draw it — glowing socket eyes, a triangular nose void, a tooth row. The
    // signature of the third reference. ----------------------------------------------------
    if (W >= 13) {
      const sf = Math.max(1, Math.min(floors - 1, Math.round(floors * 0.6)));
      const m = insetAt(sf);
      const frontZ = z0 + m;
      const bandLo = slabYs[sf] + 1;
      const bandHi = tierTop(sf) - 1;
      if (bandHi - bandLo >= 3) ops.push(...skullFace(cx, frontZ, bandLo, bandHi, glass, accent, trim, lantern));
    }

    // --- Pointed gothic DOORWAY on the flared base front, under a GLOWING INVERTED CROSS ----
    ops.push(...gothicDoor(cx, z0, groundY, tierTop(0), palette, accent, glass));

    // --- Guaranteed light + vertical circulation -------------------------------------------
    ops.push(...ceilingLanterns(slabYs, wallTop, cx, cz, lantern));
    addStairCore({ ops, box: { x0, y0, z0, x1, y1, z1, W, D, H }, slabYs, palette });
    // A dedicated hatch ladder climbs the top storey UP THROUGH the deck onto the walkable
    // crown (the keep's content always earns a way up, like the classic tower).
    ops.push(...roofHatch(rTop, slabYs[slabYs.length - 1], wallTop, palette));

    // --- Decay (haunted defaults ~0.35): WEATHER the shaft to mossy, sparing corners + ribs.
    // Never punch AIR through the single-thickness exterior wall — a hole reads as a see-through
    // gap to the void, not a haunted patina (the "buraco na parede" defect); weathering carries
    // the derelict look without breaching the envelope. ------------------------------------
    if (decay > 0) {
      for (let f = 0; f < floors; f++) {
        const m = insetAt(f);
        const r = rectAt(m);
        for (let y = slabYs[f] + 1; y <= tierTop(f) - 1; y++) {
          for (let x = r.x0; x <= r.x1; x++) {
            for (let z = r.z0; z <= r.z1; z++) {
              if (x !== r.x0 && x !== r.x1 && z !== r.z0 && z !== r.z1) continue; // walls only
              if ((x === r.x0 || x === r.x1) && (z === r.z0 || z === r.z1)) continue; // keep corners
              if (rnd() < decay * 0.3) ops.push({ op: 'block', pos: [x, y, z], state: mossy });
            }
          }
        }
      }
    }
    return ops;
  },
  // Authoritative ABOVE-GRADE storeys from the SAME plan() build() uses. Any basement is
  // reserved + dug below this box by composeStructure (the central path), like every type.
  floors(outer: Box, params, floorHeights, surroundSizing): FloorPlanEntry[] {
    const yard = yardFor(outer, params, surroundSizing);
    const b = yard ? insetHouseBox(outer, yard, surroundSizing) : outer;
    const { slabYs, wallTop } = plan(b, params, floorHeights);
    return storeyEntries(slabYs, wallTop);
  },
};

/** Proud vertical buttress ribs on a tier's four faces: pilasters standing ONE cell off the
 *  wall plane (at inset `m-1`, valid because the shaft is inset ≥1), spaced ~every 3 cells so
 *  a wider face carries more — the organ-pipe corrugation that breaks a flat wall. Runs the
 *  tier height `yLo..yHi`. No-op when there's no proud margin (a too-narrow base). */
function tierRibs(r: Rect, m: number, yLo: number, yHi: number, state: number): AuthoringOp[] {
  if (m < 1) return [];
  const ops: AuthoringOp[] = [];
  const fz0 = r.z0 - 1, fz1 = r.z1 + 1; // front/back rib planes (one cell proud of the wall)
  const fx0 = r.x0 - 1, fx1 = r.x1 + 1;
  for (let x = r.x0 + 1; x <= r.x1 - 1; x += 3) {
    ops.push({ op: 'fill', from: [x, yLo, fz0], to: [x, yHi, fz0], state });
    ops.push({ op: 'fill', from: [x, yLo, fz1], to: [x, yHi, fz1], state });
  }
  for (let z = r.z0 + 1; z <= r.z1 - 1; z += 3) {
    ops.push({ op: 'fill', from: [fx0, yLo, z], to: [fx0, yHi, z], state });
    ops.push({ op: 'fill', from: [fx1, yLo, z], to: [fx1, yHi, z], state });
  }
  return ops;
}

/** A spiky crenellated parapet ring at height `y`: a merlon on every other rim cell (crenel
 *  gaps between), the corners raised a course higher to read as mini pinnacles. */
function crenellations(r: Rect, y: number, merlon: number, cap: number): AuthoringOp[] {
  const ops: AuthoringOp[] = [];
  let i = 0;
  const place = (x: number, z: number): void => {
    const isCorner = (x === r.x0 || x === r.x1) && (z === r.z0 || z === r.z1);
    if (isCorner) { ops.push({ op: 'block', pos: [x, y, z], state: merlon }); ops.push({ op: 'block', pos: [x, y + 1, z], state: cap }); }
    else if (i % 2 === 0) ops.push({ op: 'block', pos: [x, y, z], state: merlon });
    i++;
  };
  for (let x = r.x0; x <= r.x1; x++) place(x, r.z0);
  for (let z = r.z0 + 1; z <= r.z1; z++) place(r.x1, z);
  for (let x = r.x1 - 1; x >= r.x0; x--) place(x, r.z1);
  for (let z = r.z1 - 1; z >= r.z0 + 1; z--) place(r.x0, z);
  return ops;
}

/** A cantilevered lantern ARM projecting `out` from a wall at (wx,wy,wz): a slab arm reaching
 *  outward (dir `dx`/`dz`, one of them ±1), a fence chain dropping from its tip, and a hanging
 *  lantern below — the hanging iron cages of the references. Reach is clamped by `m` so it
 *  stays in the box. */
function lanternArm(wx: number, wy: number, wz: number, dx: number, dz: number, m: number, slab: number, chain: number, lantern: number): AuthoringOp[] {
  const reach = Math.min(2, m); // never past the box rim (the shaft is inset m)
  if (reach < 1) return [];
  const ops: AuthoringOp[] = [];
  const tx = wx + dx * reach, tz = wz + dz * reach; // arm tip
  for (let s = 1; s <= reach; s++) ops.push({ op: 'block', pos: [wx + dx * s, wy, wz + dz * s], state: slab });
  ops.push({ op: 'block', pos: [tx, wy - 1, tz], state: chain }); // chain link
  ops.push({ op: 'block', pos: [tx, wy - 2, tz], state: lantern }); // the hanging cage lantern
  return ops;
}

/** Carve a SKULL into a front wall plane (z = `frontZ`), centred at `cx`, within `[yLo,yHi]`:
 *  two glowing socket eyes (gray glass backed by a hanging soul lantern just inside), a dark
 *  brow ridge, a triangular nose void, and a row of slab teeth at the jaw. */
function skullFace(cx: number, frontZ: number, yLo: number, yHi: number, glass: number, brow: number, tooth: number, lantern: number): AuthoringOp[] {
  const ops: AuthoringOp[] = [];
  const eyeY = yHi - 1;
  const browY = Math.min(yHi, eyeY + 1);
  const ex = Math.max(2, 2); // eye offset from centre
  // Brow ridge spanning the eyes.
  for (let x = cx - ex - 1; x <= cx + ex + 1; x++) ops.push({ op: 'block', pos: [x, browY, frontZ], state: brow });
  // The two 2×2 socket eyes, glazed, with a glowing lantern hung just behind each.
  for (const ox of [-ex, ex - 1]) {
    for (let dx = 0; dx <= 1; dx++) for (let dy = 0; dy <= 1; dy++) ops.push({ op: 'block', pos: [cx + ox + dx, eyeY - dy, frontZ], state: glass });
    ops.push({ op: 'block', pos: [cx + ox, eyeY, frontZ + 1], state: lantern });
  }
  // Nose: a vertical void of dark glass tapering below the eyes.
  for (let y = eyeY - 2; y >= yLo + 1 && y >= eyeY - 3; y--) ops.push({ op: 'block', pos: [cx, y, frontZ], state: glass });
  // Tooth row at the jaw: alternating slab merlons (the grin).
  const jawY = yLo;
  for (let x = cx - ex; x <= cx + ex; x += 1) if ((x - cx) % 2 === 0) ops.push({ op: 'block', pos: [x, jawY, frontZ], state: tooth });
  return ops;
}

/** A pointed gothic DOORWAY on the base front (z = `frontZ`), centred at `cx`: a stepped
 *  pointed-arch opening, a seated double door + a soul lantern inside, pale jambs, and a
 *  GLOWING INVERTED CROSS of gray glass above the lintel (the occult mark of the references). */
function gothicDoor(cx: number, frontZ: number, groundY: number, tierTop: number, palette: RolePalette, jamb: number, glass: number): AuthoringOp[] {
  const air = palette.air();
  const stand = palette.get('light'); // floor-standing porch lantern (off the walk path)
  const ops: AuthoringOp[] = [];
  const lintel = Math.min(groundY + 3, tierTop - 2);
  // Carve a 3-wide opening narrowing to 1 at the pointed apex, in the OUTER plinth/face plane.
  for (let y = groundY + 1; y <= lintel; y++) {
    const half = y >= lintel - 1 ? 0 : 1; // taper to a point at the top
    for (let x = cx - half; x <= cx + half; x++) ops.push({ op: 'block', pos: [x, y, frontZ], state: air });
  }
  // The front face is DOUBLE-thick here (outer plinth/decoration at `frontZ` + the shaft wall at
  // `frontZ + 1`). The door is seated in the outer plane, so the shaft wall directly behind it must
  // also be carved or the entrance dead-ends into a LOCKED wall (the "porta bloqueada" defect — the
  // door-clearance pass can't open a locked shell cell). Punch a clean 1-wide × 2-tall tunnel
  // through the shaft wall + into the interior so you can always walk in.
  for (let dz = 1; dz <= 2; dz++) for (let y = groundY + 1; y <= groundY + 2; y++) {
    ops.push({ op: 'block', pos: [cx, y, frontZ + dz], state: air });
  }
  ops.push(...seatDoor(palette, cx, groundY + 1, frontZ));
  // Light the porch from a floor lantern set to ONE SIDE, just inside — never a fixture hanging in
  // the doorway at head height (which reads as a blocker and clutters the entrance).
  ops.push({ op: 'block', pos: [cx + 1, groundY + 1, frontZ + 2], state: stand });
  // Pale jambs flanking the opening + a pointed apex stone.
  for (const px of [cx - 2, cx + 2]) ops.push({ op: 'fill', from: [px, groundY + 1, frontZ], to: [px, lintel, frontZ], state: jamb });
  ops.push({ op: 'block', pos: [cx, Math.min(lintel + 1, tierTop), frontZ], state: jamb });
  // The glowing inverted cross above the doorway: a vertical bar with a SHORT crossbar low on
  // it (inverted), carved as gray glass so it reads as a lit sigil on the dark wall.
  const cy0 = Math.min(lintel + 2, tierTop - 1);
  const cy1 = Math.min(cy0 + 3, tierTop);
  if (cy1 > cy0) {
    for (let y = cy0; y <= cy1; y++) ops.push({ op: 'block', pos: [cx, y, frontZ], state: glass });
    const barY = cy0 + 1; // crossbar in the lower third → inverted
    ops.push({ op: 'block', pos: [cx - 1, barY, frontZ], state: glass });
    ops.push({ op: 'block', pos: [cx + 1, barY, frontZ], state: glass });
  }
  return ops;
}

/** Roof-deck access: a code-owned ladder climbing the TOP storey up THROUGH the crown deck so
 *  the player reaches the walkable battlement. Hung on the inner face of the west wall, a cell
 *  off the corner (clear of the door + the stair core), it runs from just above the top floor
 *  up to the deck and PUNCHES the deck cell at its column (the hatch). */
function roofHatch(rTop: Rect, topY: number, deckY: number, palette: RolePalette): AuthoringOp[] {
  if (deckY - topY < 2) return [];
  const cz = Math.floor((rTop.z0 + rTop.z1) / 2);
  let lz = rTop.z0 + 1;
  if (lz === cz) lz = Math.min(rTop.z1 - 1, rTop.z0 + 2); // dodge the centred west slit
  const lx = rTop.x0 + 1; // one in from the west wall, which backs the ladder (faces east)
  const ladder = palette.get('ladder', { facing: 'east' });
  const ops: AuthoringOp[] = [];
  for (let y = topY + 1; y <= deckY; y++) ops.push({ op: 'block', pos: [lx, y, lz], state: ladder });
  return ops;
}
