// "sakura" — a cherry-blossom cottage: RAISED on a visible stone-brick basement (the base
// reads as a storey from outside, like the references), with the main entrance up on that
// raised floor reached by an exterior stone stair that climbs in under the overhanging
// upper storey. Soft pink cherry cladding, a pink cherry-stair gable roof crowned with
// blossom cascades, leafy window boxes, and an upper-front balcony. This is the fix for
// "the sakura keeps coming out as a flat pink box" — the raised, blossom-crowned massing
// the model can't reliably invent is owned by code and SEEDED (`seedShell`), so a fresh
// build keeps this casco and only furnishes/refines it.
//
// Massing in semantic roles (the decoration supplies blocks); ships its own sakura kit.
import type { AuthoringOp } from '../../authoring/types';
import { planStoreys } from '@/shared/domain/storeys';
import { addStairCore } from './stair-core';
import { ceilingLanterns, cornerPosts, roofCap, roofFormFor, seatDoor, storeyEntries, storeySlabs } from './shell-kit';
import { insetHouseBox, yardFor } from '../surroundings';
import { box as mkBox, logProps, type Box, type FloorPlanEntry, type StructureType } from './types';

/** The cottage's plan lines for a box + params — ONE source shared by `build()` and
 *  `floors()` (the standard per-type pattern): the visible stone base, the raised main
 *  floor, the living-storey ladder (honouring explicit per-floor heights), the wall top. */
function plan(b: Box, floors: number, isFlat: boolean, floorHeights?: number[]) {
  const { y0, y1, W, D } = b;
  const baseH = Math.max(3, Math.min(4, Math.floor((y1 - y0) / 4)));
  const mainY = y0 + baseH; // the raised main floor
  const roofRings = isFlat ? 2 : Math.max(2, Math.floor(Math.min(W, D) / 2));
  const ladder = planStoreys({ baseY: mainY, idealTop: y1 - roofRings, maxWallTop: y1 - 2, floors, floorHeights });
  const slabYs = ladder.slabYs;
  const wallTop = ladder.wallTop > y1 - 2 ? Math.max(mainY + 3, y1 - 2) : ladder.wallTop;
  return { baseH, mainY, slabYs, wallTop };
}

export const sakura: StructureType = {
  id: 'sakura',
  label: 'Sakura house',
  category: 'structure',
  group: 'house',
  description:
    'A cherry-blossom cottage raised on a visible stone-brick basement: the entrance sits up ' +
    'on the raised main floor, reached by an exterior stone stair that climbs in under the ' +
    'overhanging upper storey. Soft pink cherry cladding, a pink gable roof crowned with ' +
    'blossom cascades, leafy window boxes and an upper-front balcony. Romantic and springtime.',
  knowledge: 'nbt/modules/structure/sakura.md',
  preview: { size: [13, 14, 11], params: { decoration: 'sakura', floors: 2 } },
  finalize: ['chimney'],
  maxRoomsPerFloor: 2,
  // A fresh build is SEEDED with this shell so the model keeps the raised blossom massing.
  seedShell: true,
  pairedDecoration: 'sakura',
  params: {
    floors: { kind: 'int', default: 2, min: 1, max: 3, label: 'Floors' },
    roof: {
      kind: 'enum', default: 'gable', values: ['gable', 'flat'], label: 'Roof',
      labels: { gable: 'Gable', flat: 'Flat' }, module: 'roof',
    },
    // Surfaced as the "Surroundings" module select (hidden from the type's own Details
    // controls like `roof`); a pick insets the house and delegates the yard ring.
    surroundings: {
      kind: 'enum', default: 'none', values: ['none', 'garden'], label: 'Surroundings',
      labels: { none: 'None', garden: 'Garden' }, module: 'surroundings',
    },
    decay: { kind: 'unit', default: 0 },
  },
  // Pink cherry cladding on a pale stone-brick base, a pink cherry-stair roof, blossoms.
  defaults: {
    wall: 'minecraft:cherry_planks',
    floor: 'minecraft:cherry_planks',
    ceiling: 'minecraft:cherry_planks',
    foundation: 'minecraft:stone_bricks',
    corner: 'minecraft:cherry_log',
    accent: 'minecraft:stripped_cherry_log',
    beam: 'minecraft:stripped_cherry_log',
    pillar: 'minecraft:cherry_log',
    trim: 'minecraft:cherry_slab',
    roof: 'minecraft:cherry_stairs',
    window: 'minecraft:glass_pane',
    glass: 'minecraft:glass',
    door: 'minecraft:cherry_door',
    fence: 'minecraft:cherry_fence',
    plant: 'minecraft:cherry_leaves',
    light: 'minecraft:lantern',
  },
  build({ box: outer, params, palette, floorHeights, surroundSizing, composeModule }) {
    // A picked surroundings ring reserves the box's outer margins for the yard: the
    // HOUSE is laid in the inset box, and the ring module wraps it over the full box.
    const yard = yardFor(outer, params, surroundSizing);
    const box = yard ? insetHouseBox(outer, yard, surroundSizing) : outer;
    const { x0, y0, z0, x1, y1, z1, W, D } = box;
    const floors = params.floors as number; // cherry living storeys above the stone base

    const air = palette.air();
    const wall = palette.get('wall');
    const base = palette.get('foundation'); // stone bricks — the visible basement
    const floorIdx = palette.get('floor');
    const win = palette.get('window');
    const fence = palette.get('fence');
    const corner = palette.get('corner', logProps(palette.idOf('corner')));
    const post = palette.get('pillar', logProps(palette.idOf('pillar')));
    const leaf = palette.get('plant', { persistent: 'true' });
    const lantern = palette.get('light', { hanging: 'true' });

    const ops: AuthoringOp[] = [];
    const cx = Math.floor((x0 + x1) / 2);
    const cz = Math.floor((z0 + z1) / 2);

    // The yard first (it never overlaps the inset house, so order is cosmetic).
    if (yard) {
      ops.push(...composeModule('surroundings', yard, [outer.x0, outer.y0, outer.z0], [outer.x1, outer.y1, outer.z1], { surroundSizing }));
    }

    // --- Levels: a VISIBLE stone basement, then the raised cherry living storey(s),
    // from the shared plan() (the same planes floors() reports). ------------------------
    const roofShape = (params.roof as string) ?? 'gable';
    const isFlat = roofShape === 'flat';
    const { baseH, mainY, slabYs, wallTop } = plan(box, floors, isFlat, floorHeights);

    // --- Visible stone basement (ground slab + plinth ring + barred vents) ------------
    // Basement openings are ALWAYS iron bars, never glass — a pane in a cellar wall
    // reads wrong (the below-grade rule in 05-building-houses applies to code shells too).
    const bars = palette.get('bars');
    ops.push({ op: 'fill', from: [x0, y0, z0], to: [x1, y0, z1], state: base });          // ground slab
    ops.push({ op: 'walls', from: [x0, y0, z0], to: [x1, mainY, z1], state: base });        // plinth ring
    ops.push({ op: 'fill', from: [x0, mainY, z0], to: [x1, mainY, z1], state: floorIdx });   // raised floor
    const bwy = y0 + Math.max(1, Math.floor(baseH / 2));
    ops.push({ op: 'block', pos: [x0, bwy, cz], state: bars });
    ops.push({ op: 'block', pos: [x1, bwy, cz], state: bars });
    ops.push({ op: 'block', pos: [cx, bwy, z1], state: bars });

    // --- Cherry living shell over the base (kit: posts + storey slabs) ------------------
    ops.push({ op: 'walls', from: [x0, mainY, z0], to: [x1, wallTop, z1], state: wall });
    ops.push(...cornerPosts([[x0, z0], [x0, z1], [x1, z0], [x1, z1]], mainY, wallTop, corner));
    ops.push(...storeySlabs(slabYs, { x0, z0, x1, z1 }, wallTop, floorIdx));

    // --- Roof: a pink cherry gable (delegated), or a flat cap. `roofFormFor` is the kit
    // GUARANTEE: a pitch that can't fit still caps FLAT — never a roofless cottage. ------
    const form = roofFormFor(roofShape, y1 - wallTop, palette.idOf('roof').endsWith('_stairs'));
    ops.push(...roofCap(composeModule, form, [x0, wallTop + 1, z0], [x1, y1, z1], W <= D ? 'z' : 'x'));

    // --- Raised front entry reached by an exterior stone stair -------------------------
    // The cherry upper storey overhangs the stair, so the entry is covered + recessed
    // (the move that reads "sakura" — the climb up to a raised door, like the references).
    // The recess is a SEALED exterior alcove: side walls, stone backing below the door
    // and a soffit close the bay off from the rooms, so the door is the real in/out
    // boundary — never a freestanding stub the interior can walk around.
    const run = Math.max(1, Math.min(baseH, D - 3));
    const entryZ = z0 + run; // the recessed entry facade plane
    if (W >= 5 && entryZ < z1) {
      ops.push({ op: 'fill', from: [cx - 1, y0 + 1, z0], to: [cx + 1, mainY + 2, entryZ - 1], state: air }); // open the climb + bay
      for (let i = 0; i < run; i++) {
        ops.push({ op: 'fill', from: [cx - 1, y0 + i, z0 + i], to: [cx + 1, y0 + i, z0 + i], state: base }); // stone steps climbing inward
      }
      for (const sx of [cx - 2, cx + 2]) { // alcove side walls: stone shaft below, cherry above
        ops.push({ op: 'fill', from: [sx, y0 + 1, z0 + 1], to: [sx, mainY - 1, entryZ], state: base });
        ops.push({ op: 'fill', from: [sx, mainY, z0 + 1], to: [sx, mainY + 3, entryZ], state: wall });
      }
      ops.push({ op: 'fill', from: [cx - 1, y0 + 1, entryZ], to: [cx + 1, mainY - 1, entryZ], state: base }); // seal the cellar behind the climb
      ops.push({ op: 'fill', from: [cx - 1, mainY + 3, z0 + 1], to: [cx + 1, mainY + 3, entryZ], state: floorIdx }); // alcove soffit
      ops.push({ op: 'fill', from: [cx - 1, mainY, entryZ], to: [cx + 1, mainY + 2, entryZ], state: wall }); // recessed facade
      ops.push({ op: 'fill', from: [cx, mainY + 1, entryZ], to: [cx, mainY + 2, entryZ], state: air });      // door slot
      ops.push(...seatDoor(palette, cx, mainY + 1, entryZ));
      for (const px of [cx - 1, cx + 1]) ops.push({ op: 'fill', from: [px, mainY, z0], to: [px, mainY + 2, z0], state: post }); // overhang posts
      if (run >= 2) ops.push({ op: 'block', pos: [cx, mainY + 2, entryZ - 1], state: lantern }); // hung from the soffit, over the landing
    } else {
      ops.push(...seatDoor(palette, cx, mainY + 1, z0));
    }

    // --- Cherry windows + leafy window boxes on the living storeys ---------------------
    for (let f = 0; f < floors; f++) {
      const wy = slabYs[f] + 2;
      if (wy >= wallTop) break;
      for (const x of [x0 + 2, x1 - 2]) {
        if (f === 0 && Math.abs(x - cx) <= 1) continue; // keep the entry bay clear
        ops.push({ op: 'block', pos: [x, wy, z0], state: win });
        ops.push({ op: 'block', pos: [x, wy - 1, z0], state: leaf }); // blossom window box
        ops.push({ op: 'block', pos: [x, wy, z1], state: win });
      }
      ops.push({ op: 'block', pos: [x0, wy, cz], state: win });
      ops.push({ op: 'block', pos: [x1, wy, cz], state: win });
    }

    // --- Upper-front balcony: a cherry rail + posts over the covered entry -------------
    if (floors >= 2) {
      const balY = slabYs[1];
      if (balY + 2 < wallTop) {
        ops.push({ op: 'line', from: [x0 + 1, balY + 1, z0], to: [x1 - 1, balY + 1, z0], state: fence });
        for (const px of [x0 + 1, x1 - 1]) ops.push({ op: 'block', pos: [px, balY + 2, z0], state: post });
      }
    }

    // --- Blossom crown: a leaf garland along the front eave + cascades down the corners -
    const eaveY = wallTop;
    ops.push({ op: 'line', from: [x0, eaveY, z0], to: [x1, eaveY, z0], state: leaf });
    const drop = Math.max(2, Math.floor((eaveY - mainY) * 0.5));
    for (const [lx, lz] of [[x0, z0], [x1, z0]] as [number, number][]) {
      ops.push({ op: 'fill', from: [lx, eaveY - drop, lz], to: [lx, eaveY, lz], state: leaf });
    }

    // --- Lanterns under each ceiling (the guaranteed-light rule, kit) ------------------
    ops.push(...ceilingLanterns(slabYs, wallTop, cx, cz, lantern));

    // --- Interior stair core for the cherry storeys (the stairwell pass only REPAIRS;
    // a code-built shell must lay its own climb). Stairs where a 45° run fits, else a ladder.
    if (floors >= 2) {
      addStairCore({ ops, box: mkBox([x0, mainY, z0], [x1, y1, z1]), slabYs, palette });
    }
    return ops;
  },
  // Authoritative storeys, from the SAME plan() build() uses: the visible stone base as
  // a basement-grade level, then the cherry living storeys.
  floors(outer: Box, params, floorHeights, surroundSizing): FloorPlanEntry[] {
    // The SAME house-box inset build() applies: a surroundings ring narrows the footprint.
    const yard = yardFor(outer, params, surroundSizing);
    const b = yard ? insetHouseBox(outer, yard, surroundSizing) : outer;
    const { mainY, slabYs, wallTop } = plan(b, params.floors as number, (params.roof as string) === 'flat', floorHeights);
    return [
      { from: b.y0, to: Math.max(b.y0, mainY - 1), role: 'basement' },
      ...storeyEntries(slabYs, wallTop),
    ];
  },
};
