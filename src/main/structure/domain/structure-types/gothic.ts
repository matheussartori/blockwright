// "gothic" — a dark manor: blackened timber-and-blackstone walls picked out with pale
// stone belt courses (the "predominantly black with white details" look), a STEEP dark
// slate roof, and three signature moves from the references — a covered front PORTICO
// (a colonnade'd corridor across the facade), a mini CORNER TOWER rising past the roofline
// to a stepped cap + finial, and a GLASS CHAPEL wing down the left side (the wall of tall
// grey windows). Brooding, vertical, asymmetric. This is the fix for "the gothic keeps
// coming out as a plain dark box" — the towered, portico'd massing the model can't reliably
// invent is owned by code and SEEDED (`seedShell`), so a fresh build only finishes it.
//
// Massing in semantic roles (the decoration supplies blocks); ships its own gothic kit.
import type { AuthoringOp } from '../../authoring/types';
import { addStairCore } from './classic';
import { box as mkBox, logProps, type StructureType } from './types';

export const gothic: StructureType = {
  id: 'gothic',
  label: 'Gothic',
  category: 'structure',
  group: 'house',
  description:
    'A dark gothic manor: blackened timber-and-blackstone walls picked out with pale stone ' +
    'belt courses, a steep slate roof, a covered front portico, a mini corner tower rising ' +
    'past the roofline to a pointed cap, and a glass chapel wing of tall grey windows down ' +
    'one side. Brooding, vertical and asymmetric — soul-lit and manorly.',
  knowledge: 'nbt/modules/structure/gothic.md',
  preview: { size: [15, 16, 13], params: { decoration: 'gothic', floors: 2 } },
  finalize: ['stairs', 'chimney'],
  maxRoomsPerFloor: 3,
  // A fresh build is SEEDED with this shell so the model keeps the towered manor massing.
  seedShell: true,
  params: {
    floors: { kind: 'int', default: 2, min: 1, max: 3, label: 'Floors' },
    roof: {
      kind: 'enum', default: 'gable', values: ['gable', 'hip', 'flat'], label: 'Roof',
      labels: { gable: 'Gable', hip: 'Hip', flat: 'Flat' }, module: 'roof',
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
  },
  build({ box, params, palette, composeModule }) {
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
    const door = (half: 'lower' | 'upper') =>
      palette.get('door', { facing: 'north', half, hinge: 'left', open: 'false', powered: 'false' });

    const ops: AuthoringOp[] = [];
    const cx = Math.floor((x0 + x1) / 2);
    const cz = Math.floor((z0 + z1) / 2);

    // A covered front PORTICO eats a shallow front strip; the manor stands behind it.
    const portD = D >= 10 ? 2 : 0;
    const hz0 = z0 + portD; // the manor's front wall (behind the portico)

    // --- Storeys (a STEEP gable identity) ---------------------------------------------
    const roofShape = (params.roof as string) ?? 'gable';
    const isFlat = roofShape === 'flat';
    const isHip = roofShape === 'hip';
    const roofRings = isFlat ? 2 : Math.max(3, Math.floor(Math.min(W, D - portD) / 2));
    let storeyH = Math.max(4, Math.floor((y1 - y0 - roofRings) / floors));
    let wallTop = y0 + storeyH * floors;
    while (wallTop + 2 > y1 && storeyH > 3) { storeyH--; wallTop = y0 + storeyH * floors; }
    if (wallTop > y1 - 2) wallTop = Math.max(y0 + 3, y1 - 2);

    // --- Foundation + per-storey floor slabs ------------------------------------------
    ops.push({ op: 'fill', from: [x0, y0, hz0], to: [x1, y0, z1], state: found });
    ops.push({ op: 'fill', from: [x0, y0, hz0], to: [x1, y0, z1], state: floorIdx });
    for (let f = 1; f < floors; f++) {
      const midY = y0 + f * storeyH;
      if (midY < wallTop) ops.push({ op: 'fill', from: [x0 + 1, midY, hz0 + 1], to: [x1 - 1, midY, z1 - 1], state: floorIdx });
    }

    // --- Dark shell + log quoins ------------------------------------------------------
    ops.push({ op: 'walls', from: [x0, y0, hz0], to: [x1, wallTop, z1], state: wall });
    for (const [px, pz] of [[x0, hz0], [x0, z1], [x1, hz0], [x1, z1]] as [number, number][]) {
      ops.push({ op: 'fill', from: [px, y0, pz], to: [px, wallTop, pz], state: corner });
    }
    // White belt courses: a pale ring at each upper floor line + a cornice at the eaves.
    for (let f = 1; f < floors; f++) {
      const midY = y0 + f * storeyH;
      if (midY < wallTop) ops.push({ op: 'walls', from: [x0, midY, hz0], to: [x1, midY, z1], state: accent });
    }
    ops.push({ op: 'walls', from: [x0, wallTop, hz0], to: [x1, wallTop, z1], state: accent });

    // --- Roof: a steep slate gable/hip (delegated), or a flat cap ----------------------
    const roofFrom: [number, number, number] = [x0, wallTop + 1, hz0];
    const roofTo: [number, number, number] = [x1, y1, z1];
    if (isFlat) ops.push(...composeModule('roof', 'flat', roofFrom, roofTo));
    else if (isHip) ops.push(...composeModule('roof', 'hip', roofFrom, roofTo));
    else ops.push(...composeModule('roof', 'gable', roofFrom, roofTo, { ridge: W <= D ? 'z' : 'x' }));

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

    // --- Covered front portico: a colonnade'd corridor across the facade ---------------
    if (portD > 0) {
      const portTop = Math.min(wallTop - 1, y0 + Math.max(3, storeyH - 1));
      ops.push({ op: 'fill', from: [x0, y0, z0], to: [x1, y0, hz0 - 1], state: floorIdx }); // deck
      ops.push({ op: 'fill', from: [x0, portTop + 1, z0], to: [x1, portTop + 1, hz0 - 1], state: trim }); // flat roof
      for (let x = x0; x <= x1; x += 2) ops.push({ op: 'fill', from: [x, y0 + 1, z0], to: [x, portTop, z0], state: post }); // columns
      ops.push({ op: 'line', from: [x0, portTop, z0], to: [x1, portTop, z0], state: accent }); // pale lintel
      for (const lx of [cx - 2, cx + 2]) if (lx > x0 && lx < x1) ops.push({ op: 'block', pos: [lx, portTop, z0 + 1], state: lantern });
    }

    // --- Pointed-arch entry on the manor front (recessed under the portico) ------------
    ops.push({ op: 'fill', from: [cx, y0 + 1, hz0], to: [cx, y0 + 2, hz0], state: air });
    ops.push({ op: 'block', pos: [cx, y0 + 1, hz0], state: door('lower') });
    ops.push({ op: 'block', pos: [cx, y0 + 2, hz0], state: door('upper') });
    for (const px of [cx - 1, cx + 1]) ops.push({ op: 'fill', from: [px, y0 + 1, hz0], to: [px, y0 + 3, hz0], state: accent }); // jambs
    ops.push({ op: 'line', from: [cx - 1, y0 + 3, hz0], to: [cx + 1, y0 + 3, hz0], state: accent }); // lintel
    ops.push({ op: 'block', pos: [cx, y0 + 4 <= wallTop ? y0 + 4 : wallTop, hz0], state: accent }); // pinnacle

    // --- Tall windows with pale sills, front + right + back (skip the entry/chapel) -----
    for (let f = 0; f < floors; f++) {
      const wy = y0 + f * storeyH + 2;
      if (wy + 1 >= wallTop) break;
      for (const x of [x0 + 2, x1 - 2]) {
        if (f === 0 && Math.abs(x - cx) <= 1) continue;
        ops.push({ op: 'fill', from: [x, wy, hz0], to: [x, wy + 1, hz0], state: win });
        ops.push({ op: 'block', pos: [x, wy - 1, hz0], state: accent });
      }
      ops.push({ op: 'fill', from: [x1, wy, cz], to: [x1, wy + 1, cz], state: win }); // right side
      ops.push({ op: 'fill', from: [cx, wy, z1], to: [cx, wy + 1, z1], state: win }); // back
    }

    // --- Soul lanterns under each ceiling ---------------------------------------------
    for (let f = 0; f < floors; f++) {
      const ceil = f + 1 < floors ? y0 + (f + 1) * storeyH : wallTop;
      if (ceil - 1 > y0 + f * storeyH) ops.push({ op: 'block', pos: [cx, ceil - 1, cz], state: lantern });
    }

    // --- Interior stair core (behind the portico); the stairwell pass only REPAIRS it ---
    if (floors >= 2) {
      const slabYs: number[] = [];
      for (let f = 0; f < floors; f++) slabYs.push(y0 + f * storeyH);
      addStairCore(ops, mkBox([x0, y0, hz0], [x1, y1, z1]), slabYs, storeyH, false, wallTop, palette.get('roof'), floorIdx, air, 0, 0, () => palette.get('ladder', { facing: 'west' }));
    }
    return ops;
  },
};
