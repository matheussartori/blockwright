// "house" — a storeyed building with a pitched stair roof, framed corner posts, a
// carved door and windows, and optional decay (holes + weathering). Ported from the
// old `abandoned_house` template; the material choices it used to default to now live
// in `defaults` (its kit), and the decay/weathering it baked in now comes from the
// theme — so `house` + the `abandoned` theme reproduces the old output exactly.
import type { AuthoringOp } from '../../authoring/types';
import { mulberry32 } from '../rng';
import type { StructureType } from './types';
import { logProps } from './types';

export const house: StructureType = {
  id: 'house',
  label: 'House',
  params: {
    floors: { kind: 'int', default: 1, min: 1, max: 4 },
    decay: { kind: 'unit', default: 0.2 },
  },
  defaults: {
    wall: 'minecraft:cobblestone',
    corner: 'minecraft:spruce_log',
    accent: 'minecraft:spruce_log',
    floor: 'minecraft:spruce_planks',
    roof: 'minecraft:spruce_stairs',
    window: 'minecraft:glass_pane',
  },
  build({ box, params, palette, seed }) {
    const { x0, y0, z0, x1, y1, z1, W, D, H } = box;
    const floors = params.floors as number;
    const decay = params.decay as number;

    const air = palette.air();
    const wall = palette.get('wall');
    const corner = palette.get('corner', logProps(palette.idOf('corner')));
    const floorIdx = palette.get('floor');
    const win = palette.get('window');
    const mossy = palette.weather('wall');

    const ops: AuthoringOp[] = [];

    // Reserve the top of the box for the roof (it climbs ~1 ring per step), but keep
    // walls at least 3 tall; fall back to a flat top for very short boxes.
    const roofName = palette.idOf('roof');
    const roofRings = Math.max(1, Math.floor(Math.min(W, D) / 2));
    let wallTop = y1 - roofRings;
    const doRoof = roofName.endsWith('_stairs') && H >= 5 && wallTop >= y0 + 3;
    if (!doRoof) wallTop = y1;

    ops.push({ op: 'fill', from: [x0, y0, z0], to: [x1, y0, z1], state: wall }); // foundation slab
    ops.push({ op: 'walls', from: [x0, y0, z0], to: [x1, wallTop, z1], state: wall }); // shell (4 sides)
    for (const [cx, cz] of [[x0, z0], [x0, z1], [x1, z0], [x1, z1]] as [number, number][]) {
      ops.push({ op: 'fill', from: [cx, y0, cz], to: [cx, wallTop, cz], state: corner }); // framed corner posts
    }

    // Upper-storey floor slabs, spread evenly up the wall.
    const storeyH = Math.max(3, Math.floor((wallTop - y0) / floors));
    for (let f = 1; f < floors; f++) {
      const fy = y0 + f * storeyH;
      if (fy < wallTop - 1) ops.push({ op: 'fill', from: [x0 + 1, fy, z0 + 1], to: [x1 - 1, fy, z1 - 1], state: floorIdx });
    }

    // Door: a 1-wide, 2-tall opening centred on the front (z0) wall.
    const doorX = Math.floor((x0 + x1) / 2);
    ops.push({ op: 'fill', from: [doorX, y0 + 1, z0], to: [doorX, y0 + 2, z0], state: air });

    // Windows: one band per storey on every wall, skipping the door column.
    for (let f = 0; f < floors; f++) {
      const wy = y0 + f * storeyH + 2;
      if (wy >= wallTop) break;
      for (let x = x0 + 2; x <= x1 - 2; x += 3) {
        if (x === doorX && f === 0) continue;
        ops.push({ op: 'block', pos: [x, wy, z0], state: win });
        ops.push({ op: 'block', pos: [x, wy, z1], state: win });
      }
      for (let z = z0 + 2; z <= z1 - 2; z += 3) {
        ops.push({ op: 'block', pos: [x0, wy, z], state: win });
        ops.push({ op: 'block', pos: [x1, wy, z], state: win });
      }
    }

    if (doRoof) ops.push({ op: 'roof', from: [x0, wallTop + 1, z0], to: [x1, y1, z1], state: palette.get('roof'), style: 'gable', fill: wall });

    // Decay: punch holes and weather the walls (corners + foundation spared so the
    // frame and roof stay supported). Deterministic per box.
    if (decay > 0) {
      const rnd = mulberry32(seed);
      for (let y = y0 + 1; y <= wallTop; y++) {
        for (let x = x0; x <= x1; x++) {
          for (let z = z0; z <= z1; z++) {
            if (x !== x0 && x !== x1 && z !== z0 && z !== z1) continue; // walls only
            if ((x === x0 || x === x1) && (z === z0 || z === z1)) continue; // keep corners
            const r = rnd();
            if (r < decay * 0.12) ops.push({ op: 'block', pos: [x, y, z], state: air });
            else if (r < decay * 0.12 + decay * 0.25) ops.push({ op: 'block', pos: [x, y, z], state: mossy });
          }
        }
      }
    }
    return ops;
  },
};
