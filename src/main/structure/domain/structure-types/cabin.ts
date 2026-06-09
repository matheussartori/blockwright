// "cabin" — a rustic log-and-stone cabin: raised on a stone plinth, log corner posts and
// timber walls, a STEEP gable roof with deep overhangs (delegated to the roof module), a
// covered front PORCH on log posts with fence railings + steps, and a stone chimney. The
// woodsy counterpart to the clean `modern` villa; pairs with the default `cozy` decoration.
//
// Geometry is in semantic roles (the decoration supplies blocks); the type ships a spruce/
// cobblestone kit so it reads rustic even under a sparse decoration. A fresh build is SEEDED
// with this shell (`seedShell`) so the model finishes a guaranteed cabin, not a plain box.
import type { AuthoringOp } from '../../authoring/types';
import { logProps, type StructureType } from './types';

export const cabin: StructureType = {
  id: 'cabin',
  label: 'Cabin',
  category: 'structure',
  group: 'house',
  description:
    'A rustic log-and-stone cabin: a raised stone plinth, log corner posts and timber walls, ' +
    'a steep gable roof with deep eaves, a covered front porch on log posts with railings and ' +
    'steps, and a stone chimney. The cozy, woodsy alternative to the modern villa.',
  knowledge: 'nbt/modules/structure/cabin.md',
  preview: { size: [13, 12, 13], params: {} },
  finalize: ['stairs', 'chimney'],
  seedShell: true,
  params: {
    floors: { kind: 'int', default: 1, min: 1, max: 4, label: 'Floors' },
    // A cabin is gable-identity; a flat cap is offered as the modern alternative.
    roof: {
      kind: 'enum', default: 'gable', values: ['gable', 'flat'], label: 'Roof',
      labels: { gable: 'Gable', flat: 'Flat' }, module: 'roof',
    },
    decay: { kind: 'unit', default: 0 },
  },
  defaults: {
    wall: 'minecraft:spruce_planks',
    floor: 'minecraft:spruce_planks',
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

    const air = palette.air();
    const wall = palette.get('wall');
    const found = palette.get('foundation');
    const floorIdx = palette.get('floor');
    const win = palette.get('window');
    const fence = palette.get('fence');
    const post = palette.get('pillar', logProps(palette.idOf('pillar')));
    const corner = palette.get('corner', logProps(palette.idOf('corner')));
    const lantern = palette.get('light', { hanging: 'true' });

    const ops: AuthoringOp[] = [];
    const cx = Math.floor((x0 + x1) / 2);

    // A covered front PORCH eats a shallow strip of the footprint; the cabin starts behind it.
    const porchD = D >= 10 ? 3 : 0;
    const hz0 = z0 + porchD;

    // --- Raised stone plinth --------------------------------------------------------
    const baseH = 1;
    const floorY = y0 + baseH;
    ops.push({ op: 'fill', from: [x0, y0, z0], to: [x1, y0, z1], state: found });        // ground slab
    ops.push({ op: 'walls', from: [x0, y0, hz0], to: [x1, floorY, z1], state: found });   // plinth ring
    ops.push({ op: 'fill', from: [x0, floorY, hz0], to: [x1, floorY, z1], state: floorIdx }); // cabin floor

    // --- Storeys + shell ------------------------------------------------------------
    const roofShape = (params.roof as string) ?? 'gable';
    const isFlat = roofShape === 'flat';
    // A flat roof just needs a deck + parapet (2); a steep gable needs its rings.
    const roofRings = isFlat ? 2 : Math.max(2, Math.floor(Math.min(W, D) / 2)); // a STEEP gable
    let storeyH = Math.max(4, Math.floor((y1 - floorY - roofRings) / floors));
    let wallTop = floorY + storeyH * floors;
    while (wallTop + 2 > y1 && storeyH > 3) { storeyH--; wallTop = floorY + storeyH * floors; }
    if (wallTop > y1 - 2) wallTop = Math.max(floorY + 3, y1 - 2);

    ops.push({ op: 'walls', from: [x0, floorY, hz0], to: [x1, wallTop, z1], state: wall });
    for (const [px, pz] of [[x0, hz0], [x0, z1], [x1, hz0], [x1, z1]] as [number, number][]) {
      ops.push({ op: 'fill', from: [px, floorY, pz], to: [px, wallTop, pz], state: corner });
    }
    // A floor slab for each storey above the ground (up to 4 storeys).
    for (let f = 1; f < floors; f++) {
      const midY = floorY + f * storeyH;
      if (midY < wallTop) ops.push({ op: 'fill', from: [x0 + 1, midY, hz0 + 1], to: [x1 - 1, midY, z1 - 1], state: floorIdx });
    }

    // --- Roof: a steep gable, or a flat cap (both delegated to the roof module) -------
    if (isFlat) {
      ops.push(...composeModule('roof', 'flat', [x0, wallTop + 1, hz0], [x1, y1, z1]));
    } else {
      const ridge: 'x' | 'z' = W <= D ? 'z' : 'x';
      ops.push(...composeModule('roof', 'gable', [x0, wallTop + 1, hz0], [x1, y1, z1], { ridge }));
    }

    // --- Entrance + windows ---------------------------------------------------------
    ops.push({ op: 'block', pos: [cx, floorY + 1, hz0], state: palette.get('door', { facing: 'north', half: 'lower', hinge: 'left', open: 'false', powered: 'false' }) });
    ops.push({ op: 'block', pos: [cx, floorY + 2, hz0], state: palette.get('door', { facing: 'north', half: 'upper', hinge: 'left', open: 'false', powered: 'false' }) });
    for (let f = 0; f < floors; f++) {
      const wy = floorY + f * storeyH + 2;
      if (wy >= wallTop) break;
      for (const x of [x0 + 2, x1 - 2]) {
        ops.push({ op: 'block', pos: [x, wy, hz0], state: win });
        ops.push({ op: 'block', pos: [x, wy, z1], state: win });
      }
      for (const z of [Math.floor((hz0 + z1) / 2)]) {
        ops.push({ op: 'block', pos: [x0, wy, z], state: win });
        ops.push({ op: 'block', pos: [x1, wy, z], state: win });
      }
    }

    // --- Covered front porch --------------------------------------------------------
    if (porchD > 0) {
      const py = floorY;
      ops.push({ op: 'fill', from: [x0, py, z0], to: [x1, py, hz0 - 1], state: floorIdx }); // deck
      // Log posts at the porch front corners, up to a small porch roof.
      const porchTop = Math.min(wallTop, py + 3);
      for (const px of [x0, x1]) ops.push({ op: 'fill', from: [px, py + 1, z0], to: [px, porchTop, z0], state: post });
      ops.push({ op: 'fill', from: [x0, porchTop + 1, z0], to: [x1, porchTop + 1, hz0 - 1], state: floorIdx }); // porch roof
      // Fence railing along the porch front (leaving a centre gap for steps).
      for (let x = x0; x <= x1; x++) {
        if (Math.abs(x - cx) <= 1) continue;
        ops.push({ op: 'block', pos: [x, py + 1, z0], state: fence });
      }
      // A couple of steps down at the centre.
      ops.push({ op: 'block', pos: [cx, y0, z0], state: found });
    }

    // --- Stone chimney up a side wall -----------------------------------------------
    const chimX = x1;
    const cz = Math.floor((hz0 + z1) / 2);
    ops.push({ op: 'fill', from: [chimX, floorY, cz], to: [chimX, y1, cz], state: found });

    // --- Light under each ceiling ---------------------------------------------------
    for (let f = 0; f < floors; f++) {
      const ceil = f + 1 < floors ? floorY + (f + 1) * storeyH : wallTop;
      if (ceil - 1 > floorY + f * storeyH) ops.push({ op: 'block', pos: [cx, ceil - 1, cz], state: lantern });
    }
    void air;
    return ops;
  },
};
