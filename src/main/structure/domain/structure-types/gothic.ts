// "gothic" — a dark manor: blackened timber-and-blackstone walls picked out with pale
// stone belt courses (the "predominantly black with white details" look), a STEEP dark
// slate roof, and the signature moves from the references — a CENTRAL FRONTISPIECE TOWER
// projecting at the front-centre and rising past the ridge to a steep pyramidal cap +
// lit finial (carrying the grand arched entrance on its front), a covered front PORTICO
// turned BALUSTRADED VERANDA across the facade, a mini CORNER TOWER at the back rising to
// a stepped cap, a GLASS CHAPEL wing down the left side (the wall of tall grey windows),
// and IVY GARLANDS draping the eaves + tower shoulders. Brooding, vertical, asymmetric —
// this is the fix for "the gothic keeps coming out as a plain dark box": the towered,
// porticoed massing the model can't reliably invent is owned by code and SEEDED
// (`seedShell`), so a fresh build only finishes it.
//
// Massing in semantic roles (the decoration supplies blocks); ships its own gothic kit.
import type { AuthoringOp } from '../../authoring/types';
import { planStoreys } from '@/shared/domain/storeys';
import { addStairCore } from './stair-core';
import { ceilingLanterns, cornerPosts, roofCap, roofFormFor, seatDoor, storeyEntries, storeySlabs } from './shell-kit';
import { insetHouseBox, yardFor } from '../surroundings';
import { box as mkBox, logProps, type Box, type FloorPlanEntry, type StructureType } from './types';

/** The manor's plan lines for a box + params — ONE source shared by `build()` and
 *  `floors()` (the standard per-type pattern, see farmhouse): the portico strip, the
 *  storey ladder (honouring explicit per-floor heights) and the wall top. */
function plan(b: Box, floors: number, isFlat: boolean, floorHeights?: number[]) {
  const { y0, y1, z0, W, D } = b;
  const portD = D >= 10 ? 2 : 0; // covered front portico depth
  const hz0 = z0 + portD; // the manor's front wall (behind the portico)
  const roofRings = isFlat ? 2 : Math.max(3, Math.floor(Math.min(W, D - portD) / 2));
  const ladder = planStoreys({ baseY: y0, idealTop: y1 - roofRings, maxWallTop: y1 - 2, floors, floorHeights });
  const slabYs = ladder.slabYs;
  const wallTop = ladder.wallTop > y1 - 2 ? Math.max(y0 + 3, y1 - 2) : ladder.wallTop;
  return { portD, hz0, roofRings, slabYs, wallTop };
}

export const gothic: StructureType = {
  id: 'gothic',
  label: 'Gothic',
  category: 'structure',
  group: 'house',
  description:
    'A dark gothic manor: blackened timber-and-blackstone walls picked out with pale stone ' +
    'belt courses, a steep slate roof, a central frontispiece tower projecting at the front ' +
    'and rising past the ridge to a pointed cap, a balustraded front veranda, a mini corner ' +
    'tower, a glass chapel wing of tall grey windows, and ivy garlands over the eaves. ' +
    'Brooding, vertical and asymmetric — soul-lit and manorly.',
  knowledge: 'nbt/modules/structure/gothic.md',
  preview: { size: [15, 16, 13], params: { decoration: 'gothic', floors: 2 } },
  finalize: ['chimney'],
  maxRoomsPerFloor: 3,
  // A fresh build is SEEDED with this shell so the model keeps the towered manor massing
  // (every seeded shell is locked — preserveShell restores any floor/roof/wall/tower the
  // model deletes, so it finishes the interior but can't gut the code-built exterior).
  seedShell: true,
  pairedDecoration: 'gothic',
  complex: true,
  params: {
    floors: { kind: 'int', default: 2, min: 1, max: 3, label: 'Floors' },
    roof: {
      kind: 'enum', default: 'gable', values: ['gable', 'hip', 'flat'], label: 'Roof',
      labels: { gable: 'Gable', hip: 'Hip', flat: 'Flat' }, module: 'roof',
    },
    // Surfaced as the "Surroundings" module select (hidden from the type's own Details
    // controls like `roof`); a pick insets the house and delegates the yard ring.
    surroundings: {
      kind: 'enum', default: 'none', values: ['none', 'garden'], label: 'Surroundings',
      labels: { none: 'None', garden: 'Garden' }, module: 'surroundings',
    },
    decay: { kind: 'unit', default: 0 },
  },
  // Black timber + blackstone, pale stone accents (the white detailing), a dark slate roof.
  defaults: {
    wall: 'minecraft:dark_oak_planks',
    floor: 'minecraft:dark_oak_planks',
    ceiling: 'minecraft:dark_oak_planks',
    foundation: 'minecraft:polished_blackstone_bricks',
    corner: 'minecraft:dark_oak_log',
    accent: 'minecraft:polished_diorite',
    beam: 'minecraft:stripped_dark_oak_log',
    pillar: 'minecraft:polished_blackstone',
    trim: 'minecraft:dark_oak_slab',
    roof: 'minecraft:deepslate_tile_stairs',
    window: 'minecraft:glass_pane',
    glass: 'minecraft:gray_stained_glass',
    door: 'minecraft:dark_oak_door',
    fence: 'minecraft:dark_oak_fence',
    light: 'minecraft:soul_lantern',
    plant: 'minecraft:flowering_azalea_leaves', // ivy/garland greenery on the roof + tower
  },
  build({ box: outer, params, palette, floorHeights, composeModule }) {
    // A picked surroundings ring reserves the box's outer margins for the yard: the
    // HOUSE is laid in the inset box, and the ring module wraps it over the full box.
    const yard = yardFor(outer, params);
    const box = yard ? insetHouseBox(outer, yard) : outer;
    const { x0, y0, z0, x1, y1, z1, W, D, H } = box;
    const floors = params.floors as number;

    const air = palette.air();
    const wall = palette.get('wall');
    const found = palette.get('foundation');
    const floorIdx = palette.get('floor');
    const win = palette.get('window');
    const accent = palette.get('accent'); // pale stone — the white detailing
    const glass = palette.get('glass'); // grey chapel glass
    const corner = palette.get('corner', logProps(palette.idOf('corner')));
    const post = palette.get('pillar');
    const trim = palette.get('trim', { type: 'top' });
    const lantern = palette.get('light', { hanging: 'true' });
    const soul = palette.get('light');
    const fence = palette.get('fence');
    const leaf = palette.get('plant'); // ivy/garland greenery (roof eaves + tower shoulders)

    const ops: AuthoringOp[] = [];
    const cx = Math.floor((x0 + x1) / 2);
    const cz = Math.floor((z0 + z1) / 2);

    // The yard first (it never overlaps the inset house, so order is cosmetic).
    if (yard) {
      ops.push(...composeModule('surroundings', yard, [outer.x0, outer.y0, outer.z0], [outer.x1, outer.y1, outer.z1]));
    }

    // --- Plan lines (shared with floors() via plan()) ----------------------------------
    const roofShape = (params.roof as string) ?? 'gable';
    const isFlat = roofShape === 'flat';
    const { portD, hz0, roofRings, slabYs, wallTop } = plan(box, floors, isFlat, floorHeights);
    const groundH = (slabYs[1] ?? wallTop) - y0; // the ground storey's slab-to-slab height
    // A central frontispiece TOWER projects at the front-centre (the "tower in the middle").
    // Computed early so the portico colonnade/railing leaves its central bay open for the
    // tower + its entrance — a portico column at `cx` would otherwise bury the door.
    const hasTower = W >= 11 && H >= 12 && D - portD >= 5;
    const towerHW = W >= 16 ? 2 : 1; // tower half-width (front-centre span cx±towerHW)

    // --- Foundation + per-storey floor slabs ------------------------------------------
    ops.push({ op: 'fill', from: [x0, y0, hz0], to: [x1, y0, z1], state: found });
    ops.push({ op: 'fill', from: [x0, y0, hz0], to: [x1, y0, z1], state: floorIdx });
    ops.push(...storeySlabs(slabYs, { x0, z0: hz0, x1, z1 }, wallTop, floorIdx));

    // --- Dark shell + log quoins ------------------------------------------------------
    ops.push({ op: 'walls', from: [x0, y0, hz0], to: [x1, wallTop, z1], state: wall });
    ops.push(...cornerPosts([[x0, hz0], [x0, z1], [x1, hz0], [x1, z1]], y0, wallTop, corner));
    // White belt courses: a pale ring at each upper floor line + a cornice at the eaves.
    for (let f = 1; f < floors; f++) {
      const midY = slabYs[f];
      if (midY < wallTop) ops.push({ op: 'walls', from: [x0, midY, hz0], to: [x1, midY, z1], state: accent });
    }
    ops.push({ op: 'walls', from: [x0, wallTop, hz0], to: [x1, wallTop, z1], state: accent });

    // --- Roof: a steep slate gable/hip (delegated), or a flat cap. `roofFormFor` is the
    // kit GUARANTEE: a pitch that can't fit (or a non-stair roof material) still caps FLAT
    // (deck + parapet) — a gothic manor can never ship roofless. ------------------------
    const form = roofFormFor(roofShape, y1 - wallTop, palette.idOf('roof').endsWith('_stairs'));
    ops.push(...roofCap(composeModule, form, [x0, wallTop + 1, hz0], [x1, y1, z1], W <= D ? 'z' : 'x'));

    // --- Garland foliage dotting the eaves (the ivy cascading over the slate) -----------
    if (form !== 'flat') {
      const ey = wallTop + 1;
      for (let x = x0 + 1; x <= x1 - 1; x += 3) {
        ops.push({ op: 'block', pos: [x, ey, hz0], state: leaf });
        ops.push({ op: 'block', pos: [x, ey, z1], state: leaf });
      }
      for (let z = hz0 + 2; z <= z1 - 1; z += 3) {
        ops.push({ op: 'block', pos: [x0, ey, z], state: leaf });
        ops.push({ op: 'block', pos: [x1, ey, z], state: leaf });
      }
    }

    // --- Glass chapel wing: re-glaze the LEFT (x0) side wall into a wall of tall grey
    // windows, framed by pale mullions every other cell (the "side like a chapel"). -----
    if (D - portD >= 4 && wallTop > y0 + 3) {
      ops.push({ op: 'fill', from: [x0, y0 + 2, hz0 + 1], to: [x0, wallTop - 1, z1 - 1], state: glass });
      for (let z = hz0 + 1; z <= z1 - 1; z += 2) {
        ops.push({ op: 'fill', from: [x0, y0 + 1, z], to: [x0, wallTop - 1, z], state: accent });
      }
    }

    // --- Mini corner tower: a dark 3×3 shaft at the back-right rising past the roof to a
    // stepped pyramidal cap + a lit finial (kept within the box). ----------------------
    if (W >= 7 && D - portD >= 7 && H >= 11) {
      const ax0 = x1 - 2, az0 = z1 - 2; // back-right 3×3 block
      const tcx = x1 - 1, tcz = z1 - 1; // tower centre column
      const tBase = y0 + Math.max(2, Math.floor(H * 0.2));
      const topY = y1 - 2; // tower wall top; cap + finial sit above, within the box
      ops.push({ op: 'walls', from: [ax0, tBase, az0], to: [x1, topY, z1], state: corner }); // shaft (over the roof)
      ops.push({ op: 'fill', from: [tcx, tBase, tcz], to: [tcx, y1, tcz], state: air }); // hollow it
      const slitY0 = tBase + Math.floor((topY - tBase) * 0.4);
      const slitY1 = Math.min(slitY0 + 1, topY - 1);
      ops.push({ op: 'fill', from: [tcx, slitY0, z1], to: [tcx, slitY1, z1], state: win });
      ops.push({ op: 'fill', from: [x1, slitY0, tcz], to: [x1, slitY1, tcz], state: win });
      const capStair = (facing: string) => palette.get('roof', { facing, half: 'bottom', shape: 'straight' });
      const capY = topY + 1;
      ops.push({ op: 'block', pos: [tcx, capY, az0], state: capStair('south') });
      ops.push({ op: 'block', pos: [tcx, capY, z1], state: capStair('north') });
      ops.push({ op: 'block', pos: [ax0, capY, tcz], state: capStair('east') });
      ops.push({ op: 'block', pos: [x1, capY, tcz], state: capStair('west') });
      ops.push({ op: 'block', pos: [tcx, capY, tcz], state: corner });
      ops.push({ op: 'block', pos: [tcx, Math.min(capY + 1, y1), tcz], state: fence });
      ops.push({ op: 'block', pos: [tcx, Math.min(capY + 2, y1), tcz], state: soul });
    }

    // --- Central frontispiece tower: a square turret projecting at the FRONT-CENTRE, rising
    // a storey past the eaves to a steep pyramidal cap, lit finial + foliage shoulders. The
    // dominant "tower in the middle" move; it swallows the central bay of the portico and
    // carries the grand entrance on its front face. ------------------------------------------
    if (hasTower) {
      const tw = towerHW;                     // half-width (3 or 5 cells)
      const tx0 = cx - tw, tx1 = cx + tw;
      const tz0 = z0;                         // flush with the box front (projects past the facade)
      const tz1 = Math.min(hz0 + 1, z1 - 1);  // a shallow bay reaching just inside the manor
      const tTop = Math.min(y1 - 2, wallTop + Math.max(2, Math.floor(roofRings * 0.6)));
      // Shaft: dark walls, log quoins, pale belt courses + a cornice.
      ops.push({ op: 'walls', from: [tx0, y0, tz0], to: [tx1, tTop, tz1], state: wall });
      for (const px of [tx0, tx1]) ops.push({ op: 'fill', from: [px, y0, tz0], to: [px, tTop, tz0], state: corner });
      for (let f = 1; f < floors; f++) {
        const midY = slabYs[f];
        if (midY < tTop) ops.push({ op: 'walls', from: [tx0, midY, tz0], to: [tx1, midY, tz1], state: accent });
      }
      ops.push({ op: 'walls', from: [tx0, tTop, tz0], to: [tx1, tTop, tz1], state: accent });
      // Hollow it + open the back into the manor so the turret is one interior with the hall.
      ops.push({ op: 'fill', from: [tx0 + 1, y0 + 1, tz0 + 1], to: [tx1 - 1, tTop - 1, tz1], state: air });
      // Tall traceried front window per storey (a grey lancet flanked by mullions).
      for (let f = 0; f < floors; f++) {
        const wy = slabYs[f] + 2;
        if (wy + 1 >= tTop) break;
        ops.push({ op: 'fill', from: [cx, wy, tz0], to: [cx, Math.min(wy + 2, tTop - 1), tz0], state: win });
        if (tw >= 2) for (const px of [cx - 1, cx + 1]) ops.push({ op: 'fill', from: [px, wy, tz0], to: [px, wy + 1, tz0], state: glass });
      }
      // Grand arched entrance on the tower front (pale jambs + lintel).
      ops.push({ op: 'fill', from: [cx, y0 + 1, tz0], to: [cx, y0 + 2, tz0], state: air });
      ops.push(...seatDoor(palette, cx, y0 + 1, tz0));
      for (const px of [cx - 1, cx + 1]) if (px > tx0 - 1 && px < tx1 + 1) ops.push({ op: 'fill', from: [px, y0 + 1, tz0], to: [px, y0 + 3, tz0], state: accent });
      ops.push({ op: 'line', from: [cx - 1, y0 + 3, tz0], to: [cx + 1, y0 + 3, tz0], state: accent });
      // Steep pyramidal cap: stair rings stepping inward and up to a finial.
      const tcz = Math.floor((tz0 + tz1) / 2);
      const capStair = (facing: string) => palette.get('roof', { facing, half: 'bottom', shape: 'straight' });
      let cy = tTop + 1;
      for (let r = 0; cy <= y1; r++, cy++) {
        const ax0 = tx0 + r, ax1 = tx1 - r, bz0 = tz0 + r, bz1 = tz1 - r;
        if (ax0 > ax1 || bz0 > bz1) break;
        for (let x = ax0; x <= ax1; x++) {
          ops.push({ op: 'block', pos: [x, cy, bz0], state: capStair('south') });
          ops.push({ op: 'block', pos: [x, cy, bz1], state: capStair('north') });
        }
        for (let z = bz0; z <= bz1; z++) {
          ops.push({ op: 'block', pos: [ax0, cy, z], state: capStair('east') });
          ops.push({ op: 'block', pos: [ax1, cy, z], state: capStair('west') });
        }
      }
      ops.push({ op: 'block', pos: [cx, Math.min(cy, y1), tcz], state: fence });        // finial
      ops.push({ op: 'block', pos: [cx, Math.min(cy + 1, y1), tcz], state: soul });     // lit
      for (const px of [tx0, tx1]) ops.push({ op: 'block', pos: [px, tTop + 1, tz1], state: leaf }); // foliage shoulders
    }

    // --- Covered front portico: a colonnade'd corridor across the facade ---------------
    if (portD > 0) {
      const portTop = Math.min(wallTop - 1, y0 + Math.max(3, groundH - 1));
      ops.push({ op: 'fill', from: [x0, y0, z0], to: [x1, y0, hz0 - 1], state: floorIdx }); // deck
      // Flat veranda roof — split around the tower bay so it doesn't shelf across the entrance.
      if (hasTower) {
        if (cx - towerHW - 1 >= x0) ops.push({ op: 'fill', from: [x0, portTop + 1, z0], to: [cx - towerHW - 1, portTop + 1, hz0 - 1], state: trim });
        if (cx + towerHW + 1 <= x1) ops.push({ op: 'fill', from: [cx + towerHW + 1, portTop + 1, z0], to: [x1, portTop + 1, hz0 - 1], state: trim });
      } else {
        ops.push({ op: 'fill', from: [x0, portTop + 1, z0], to: [x1, portTop + 1, hz0 - 1], state: trim });
      }
      for (let x = x0; x <= x1; x += 2) { // columns (skip the tower's central bay)
        if (hasTower && x >= cx - towerHW && x <= cx + towerHW) continue;
        ops.push({ op: 'fill', from: [x, y0 + 1, z0], to: [x, portTop, z0], state: post });
      }
      ops.push({ op: 'line', from: [x0, portTop, z0], to: [x1, portTop, z0], state: accent }); // pale lintel
      for (const lx of [cx - 2, cx + 2]) if (lx > x0 && lx < x1) ops.push({ op: 'block', pos: [lx, portTop, z0 + 1], state: lantern });
      // Veranda railing between the columns (skip the central bay when a tower carries the
      // entrance), so the covered corridor reads as a balustraded gallery.
      for (let x = x0 + 1; x <= x1 - 1; x++) {
        const isColumn = (x - x0) % 2 === 0;
        const underTower = hasTower && x >= cx - 2 && x <= cx + 2;
        if (!isColumn && !underTower) ops.push({ op: 'block', pos: [x, y0 + 1, z0], state: fence });
      }
    }

    // --- Pointed-arch entry on the manor front (recessed under the portico). Skipped when a
    // central tower carries the entrance on its own front face (no redundant inner door). ---
    if (!hasTower) {
      ops.push({ op: 'fill', from: [cx, y0 + 1, hz0], to: [cx, y0 + 2, hz0], state: air });
      ops.push(...seatDoor(palette, cx, y0 + 1, hz0));
      for (const px of [cx - 1, cx + 1]) ops.push({ op: 'fill', from: [px, y0 + 1, hz0], to: [px, y0 + 3, hz0], state: accent }); // jambs
      ops.push({ op: 'line', from: [cx - 1, y0 + 3, hz0], to: [cx + 1, y0 + 3, hz0], state: accent }); // lintel
      ops.push({ op: 'block', pos: [cx, y0 + 4 <= wallTop ? y0 + 4 : wallTop, hz0], state: accent }); // pinnacle
    }

    // --- Tall windows with pale sills, front + right + back (skip the entry/chapel) -----
    for (let f = 0; f < floors; f++) {
      const wy = slabYs[f] + 2;
      if (wy + 1 >= wallTop) break;
      for (const x of [x0 + 2, x1 - 2]) {
        if (f === 0 && Math.abs(x - cx) <= 1) continue;
        ops.push({ op: 'fill', from: [x, wy, hz0], to: [x, wy + 1, hz0], state: win });
        ops.push({ op: 'block', pos: [x, wy - 1, hz0], state: accent });
      }
      ops.push({ op: 'fill', from: [x1, wy, cz], to: [x1, wy + 1, cz], state: win }); // right side
      ops.push({ op: 'fill', from: [cx, wy, z1], to: [cx, wy + 1, z1], state: win }); // back
    }

    // --- Soul lanterns under each ceiling (the guaranteed-light rule, kit) -------------
    ops.push(...ceilingLanterns(slabYs, wallTop, cx, cz, lantern));

    // --- Interior stair core (behind the portico); the stairwell pass only REPAIRS it ---
    if (floors >= 2) {
      addStairCore({ ops, box: mkBox([x0, y0, hz0], [x1, y1, z1]), slabYs, palette });
    }
    return ops;
  },
  // Authoritative storeys, from the SAME plan() build() uses — so the viewer bands,
  // the metadata sidecar and the stairwell pass see exactly the planes the shell laid.
  floors(outer: Box, params, floorHeights): FloorPlanEntry[] {
    // The SAME house-box inset build() applies: a surroundings ring narrows the footprint.
    const yard = yardFor(outer, params);
    const b = yard ? insetHouseBox(outer, yard) : outer;
    const { slabYs, wallTop } = plan(b, params.floors as number, (params.roof as string) === 'flat', floorHeights);
    return storeyEntries(slabYs, wallTop);
  },
};
