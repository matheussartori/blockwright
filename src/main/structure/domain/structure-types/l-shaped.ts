// "l-shaped" — a house whose footprint is an L: a long MAIN wing plus a perpendicular BACK
// wing sharing the back-left corner, leaving a front-right NOTCH that becomes a sheltered
// terrace in the crook. Two per-wing gable roofs (delegated to the roof module) and a railed
// terrace give it more character than a plain box. Pairs with the default `cozy` decoration.
//
// Geometry is in semantic roles (the decoration supplies blocks). A fresh build is SEEDED
// with this shell (`seedShell`) so the model finishes a guaranteed L-plan, not a rectangle.
import type { AuthoringOp } from '../../authoring/types';
import { logProps, type StructureType } from './types';

export const lShaped: StructureType = {
  id: 'l-shaped',
  label: 'L-shaped house',
  category: 'structure',
  description:
    'A house with an L-shaped footprint: a long main wing and a perpendicular back wing meeting ' +
    'at a right angle, leaving a sheltered terrace in the inner corner. Two pitched roofs and a ' +
    'railed courtyard give it a split, characterful silhouette instead of a single box.',
  knowledge: 'nbt/modules/structure/l-shaped.md',
  preview: { size: [15, 12, 13], params: {} },
  finalize: ['stairs', 'chimney'],
  seedShell: true,
  params: {
    floors: { kind: 'int', default: 2, min: 1, max: 3, label: 'Floors' },
    decay: { kind: 'unit', default: 0 },
  },
  defaults: {
    wall: 'minecraft:spruce_planks',
    floor: 'minecraft:oak_planks',
    ceiling: 'minecraft:spruce_planks',
    foundation: 'minecraft:cobblestone',
    corner: 'minecraft:spruce_log',
    accent: 'minecraft:stripped_spruce_log',
    beam: 'minecraft:spruce_log',
    pillar: 'minecraft:spruce_log',
    trim: 'minecraft:spruce_slab',
    roof: 'minecraft:spruce_stairs',
    window: 'minecraft:glass_pane',
    glass: 'minecraft:glass',
    door: 'minecraft:spruce_door',
    fence: 'minecraft:spruce_fence',
    light: 'minecraft:lantern',
  },
  build({ box, params, palette, composeModule }) {
    const { x0, y0, z0, x1, y1, z1, W, D } = box;
    const floors = params.floors as number;

    const wall = palette.get('wall');
    const found = palette.get('foundation');
    const floorIdx = palette.get('floor');
    const win = palette.get('window');
    const fence = palette.get('fence');
    const corner = palette.get('corner', logProps(palette.idOf('corner')));
    const lantern = palette.get('light', { hanging: 'true' });

    const ops: AuthoringOp[] = [];

    // The L: a main wing (left, full depth) + a back wing (right, only the back part),
    // leaving a front-right notch as the terrace. `xn` splits the wings; `zn` is the back
    // wing's front (the notch depth).
    const xn = x0 + Math.max(3, Math.ceil(W * 0.6)); // first column of the back/right wing
    const zn = z0 + Math.max(3, Math.ceil(D * 0.45)); // back wing starts here (notch depth)
    const mainX1 = xn - 1;                            // main wing's east column

    // --- Storeys --------------------------------------------------------------------
    const roofRings = Math.max(2, Math.floor(Math.min(mainX1 - x0 + 1, D) / 2));
    let storeyH = Math.max(4, Math.floor((y1 - y0 - roofRings) / floors));
    let wallTop = y0 + storeyH * floors;
    while (wallTop + 2 > y1 && storeyH > 3) { storeyH--; wallTop = y0 + storeyH * floors; }
    if (wallTop > y1 - 2) wallTop = Math.max(y0 + 3, y1 - 2);

    // --- Floors + foundation (main wing ∪ back wing) --------------------------------
    const slab = (y: number, st: number): void => {
      ops.push({ op: 'fill', from: [x0, y, z0], to: [mainX1, y, z1], state: st });   // main wing
      ops.push({ op: 'fill', from: [xn, y, zn], to: [x1, y, z1], state: st });        // back wing
    };
    slab(y0, found);
    for (let f = 0; f < floors; f++) slab(y0 + f * storeyH, floorIdx);

    // --- Perimeter walls along the L outline ----------------------------------------
    const wallSeg = (ax: number, az: number, bx: number, bz: number): void => {
      ops.push({ op: 'fill', from: [ax, y0, az], to: [bx, wallTop, bz], state: wall });
    };
    wallSeg(x0, z0, x0, z1);          // left side (main wing)
    wallSeg(x0, z1, x1, z1);          // back side (both wings)
    wallSeg(x1, zn, x1, z1);          // right side (back wing)
    wallSeg(x0, z0, mainX1, z0);      // main wing front
    wallSeg(mainX1, z0, mainX1, zn);  // notch-facing wall of the main wing
    wallSeg(xn, zn, x1, zn);          // notch-facing front of the back wing

    // Log corner posts at the L's outer corners + the inner corner.
    for (const [px, pz] of [[x0, z0], [x0, z1], [x1, z1], [x1, zn], [mainX1, z0], [xn, zn]] as [number, number][]) {
      ops.push({ op: 'fill', from: [px, y0, pz], to: [px, wallTop, pz], state: corner });
    }

    // --- Per-wing gable roofs (delegated to the roof module) ------------------------
    ops.push(...composeModule('roof', 'gable', [x0, wallTop + 1, z0], [mainX1, y1, z1], { ridge: 'z' }));
    ops.push(...composeModule('roof', 'gable', [xn, wallTop + 1, zn], [x1, y1, z1], { ridge: 'x' }));

    // --- Entrance (main wing front) + windows ---------------------------------------
    const dx = Math.floor((x0 + mainX1) / 2);
    ops.push({ op: 'block', pos: [dx, y0 + 1, z0], state: palette.get('door', { facing: 'north', half: 'lower', hinge: 'left', open: 'false', powered: 'false' }) });
    ops.push({ op: 'block', pos: [dx, y0 + 2, z0], state: palette.get('door', { facing: 'north', half: 'upper', hinge: 'left', open: 'false', powered: 'false' }) });
    for (let f = 0; f < floors; f++) {
      const wy = y0 + f * storeyH + 2;
      if (wy >= wallTop) break;
      ops.push({ op: 'block', pos: [x0, wy, Math.floor((z0 + z1) / 2)], state: win }); // main wing left
      ops.push({ op: 'block', pos: [x1, wy, Math.floor((zn + z1) / 2)], state: win }); // back wing right
      ops.push({ op: 'block', pos: [Math.floor((xn + x1) / 2), wy, z1], state: win });  // back face
      if (dx - 2 >= x0) ops.push({ op: 'block', pos: [dx - 2, wy, z0], state: win });
      if (dx + 2 <= mainX1) ops.push({ op: 'block', pos: [dx + 2, wy, z0], state: win });
    }

    // --- Terrace in the notch (deck + railing) --------------------------------------
    ops.push({ op: 'fill', from: [xn, y0, z0], to: [x1, y0, zn - 1], state: floorIdx }); // deck
    for (let x = xn; x <= x1; x++) ops.push({ op: 'block', pos: [x, y0 + 1, z0], state: fence }); // front rail
    for (let z = z0; z < zn; z++) ops.push({ op: 'block', pos: [x1, y0 + 1, z], state: fence });  // right rail

    // --- Light under each main-wing ceiling -----------------------------------------
    const cz = Math.floor((z0 + z1) / 2);
    for (let f = 0; f < floors; f++) {
      const ceil = f + 1 < floors ? y0 + (f + 1) * storeyH : wallTop;
      if (ceil - 1 > y0 + f * storeyH) ops.push({ op: 'block', pos: [dx, ceil - 1, cz], state: lantern });
    }
    return ops;
  },
};
