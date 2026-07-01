// "keep" — the first member of the `tower` group: a battlemented stone KEEP. A
// tall, square stone shaft with a stacked plan of narrow storeys, arrow-slit windows, a
// seated arched doorway on a stone plinth, a connected switchback stair core linking every
// level, and a CRENELLATED parapet (merlons + crenel gaps) crowning a walkable roof deck.
// Unlike the house types it OWNS its crown in code (no roof module slot) — the battlement is
// the tower's identity, not a pluggable cap.
//
// Like every seeded type it is `seedShell`: a fresh build compiles this shell, locks it, and
// the model only furnishes the clean levels it hands over. Everything is emitted in terms of
// semantic roles; the decoration supplies the concrete blocks, and the type ships its own
// stone `defaults` kit so it reads as a keep even under a sparse decoration. The Basement,
// Surroundings and Room modules (every registered one) link to the `tower` group; Roof and
// Attic do not (the crown is built-in).
import type { AuthoringOp } from '../../authoring/types';
import { planStoreys } from '@/shared/domain/storeys';
import { mulberry32 } from '../rng';
import type { ParamValues } from '../params';
import { insetHouseBox, yardFor } from '../surroundings';
import type { Box, FloorPlanEntry, StructureType } from './types';
import { addStairCore } from './stair-core';
import { arrowSlit, crenellations, roofHatch } from './crown';
import { ceilingLanterns, seatDoor, storeyEntries, storeySlabs } from './shell-kit';

/** The tower's level plan — ONE source shared by `build()` and `floors()`. The shaft stacks
 *  N walkable storeys, then a single course is reserved at the top for the merlon ring above
 *  the roof deck (the deck itself coincides with the top storey's ceiling at `wallTop`). */
function plan(b: Box, params: ParamValues, floorHeights?: number[]) {
  const { y0, y1 } = b;
  const floors = params.floors as number;
  const maxWallTop = y1 - 1; // reserve one cell above the deck for the merlon course
  const ladder = planStoreys({ baseY: y0, idealTop: maxWallTop, maxWallTop, floors, floorHeights });
  const wallTop = Math.min(ladder.wallTop, maxWallTop);
  return { storeyCount: floors, slabYs: ladder.slabYs, wallTop };
}

export const keep: StructureType = {
  id: 'keep',
  label: 'Keep',
  category: 'structure',
  group: 'tower',
  description:
    'A battlemented stone keep: a tall square shaft of stacked narrow storeys with arrow-slit ' +
    'windows, a seated arched doorway on a stone plinth, a connected switchback stair core, and ' +
    'a crenellated parapet crowning a walkable roof deck. Owns its crown in code (no roof slot); ' +
    'links to every Basement, Surroundings and Room module. Decoration supplies the materials.',
  knowledge: 'nbt/modules/structure/keep.md',
  preview: { size: [9, 22, 9], params: { floors: 3 } },
  // A tall, narrow keep — one interior program per cramped level reads best.
  maxRoomsPerFloor: 1,
  // Seeded + locked like every other type: the code-built shell is compiled and the model
  // only furnishes the interior. The stone "castle" look is its identity, auto-paired in
  // the composer (the user can still change it — every decoration is universal).
  seedShell: true,
  pairedDecoration: 'castle',
  params: {
    floors: { kind: 'int', default: 3, min: 1, max: 8, label: 'Floors' },
    // Surfaced as the separate "Surroundings" module select (hidden from the type's own
    // controls). Every registered yard links to the `tower` group, so all are offered.
    surroundings: {
      kind: 'enum', default: 'none', values: ['none', 'modern', 'garden', 'graveyard'], label: 'Surroundings',
      labels: { none: 'None', modern: 'Modern', garden: 'Garden', graveyard: 'Graveyard' }, module: 'surroundings',
    },
    decay: { kind: 'unit', default: 0.15 },
  },
  defaults: {
    wall: 'minecraft:stone_bricks',
    foundation: 'minecraft:cobblestone',
    floor: 'minecraft:spruce_planks',
    ceiling: 'minecraft:stone_bricks',
    corner: 'minecraft:stone_bricks',
    accent: 'minecraft:chiseled_stone_bricks',
    roof: 'minecraft:stone_brick_stairs', // the interior stair core reuses this *_stairs block
    window: 'minecraft:glass_pane',
    door: 'minecraft:spruce_door',
    fence: 'minecraft:spruce_fence',
    ladder: 'minecraft:ladder',
    light: 'minecraft:lantern',
  },
  build({ box: outer, params, palette, seed, floorHeights, surroundSizing, composeModule }) {
    // A picked surroundings ring reserves the outer margins for the yard; the KEEP is laid in
    // the inset box and the ring module wraps it over the full box (the house-type pattern).
    const yard = yardFor(outer, params, surroundSizing);
    const box = yard ? insetHouseBox(outer, yard, surroundSizing) : outer;
    const { x0, y0, z0, x1, y1, z1, W, D, H } = box;
    const floors = params.floors as number;
    const decay = params.decay as number;

    const air = palette.air();
    const wall = palette.get('wall');
    const floorIdx = palette.get('floor');
    const found = palette.get('foundation');
    const deck = palette.get('ceiling');
    const win = palette.get('window');
    const mossy = palette.weather('wall');
    const lantern = palette.get('light', { hanging: 'true' });

    const rnd = mulberry32(seed);
    const ops: AuthoringOp[] = [];
    const cx = Math.floor((x0 + x1) / 2);
    const cz = Math.floor((z0 + z1) / 2);

    // The yard first (it never overlaps the inset keep).
    if (yard) {
      ops.push(...composeModule('surroundings', yard, [outer.x0, outer.y0, outer.z0], [outer.x1, outer.y1, outer.z1], { surroundSizing }));
    }

    // --- Level plan (shared with floors() via plan()) ---------------------------
    const { slabYs, wallTop } = plan(box, params, floorHeights);
    const groundY = slabYs[0];

    // --- Shaft -----------------------------------------------------------------
    ops.push({ op: 'fill', from: [x0, y0, z0], to: [x1, y0, z1], state: found }); // foundation slab
    ops.push({ op: 'walls', from: [x0, y0, z0], to: [x1, wallTop, z1], state: wall }); // 4-sided stone shaft
    // Stone plinth course at the ground base (the keep sits on a heavier stone water-table).
    ops.push({ op: 'walls', from: [x0, groundY, z0], to: [x1, groundY, z1], state: found });
    // Upper-storey floor slabs (the ground slab is the foundation's).
    ops.push(...storeySlabs(slabYs, { x0, z0, x1, z1 }, wallTop, floorIdx));

    // --- Crown (built-in — the tower OWNS it, no roof module) -------------------
    // A solid roof DECK across the full footprint at the wall top (caps the shaft, covers
    // every interior column), then a crenellated parapet one course above it.
    ops.push({ op: 'fill', from: [x0, wallTop, z0], to: [x1, wallTop, z1], state: deck });
    ops.push(...crenellations({ x0, z0, x1, z1 }, wallTop + 1, wall));

    // --- Entrance --------------------------------------------------------------
    // The seated front door + a hanging lantern just inside, so the doorway reads finished.
    ops.push(...seatDoor(palette, cx, groundY + 1, z0));
    const ceilGround = slabYs.length > 1 ? slabYs[1] : wallTop;
    if (ceilGround - 1 > groundY) ops.push({ op: 'block', pos: [cx, ceilGround - 1, z0 + 1], state: lantern });

    // --- Arrow-slit windows: a narrow 2-tall slit centred on each wall, per storey ----
    for (let f = 0; f < floors; f++) {
      const wy = slabYs[f] + 2; // sill, two cells above the floor slab
      if (wy + 1 >= wallTop) continue; // no headroom left under the deck for a slit
      const slit = (x: number, z: number): void => { ops.push(...arrowSlit(x, z, wy, wy + 1, win)); };
      if (f !== 0) slit(cx, z0); // skip the front-ground wall — the door is there
      slit(cx, z1);
      slit(x0, cz);
      slit(x1, cz);
    }

    // --- Guaranteed light + circulation ----------------------------------------
    ops.push(...ceilingLanterns(slabYs, wallTop, cx, cz, lantern));
    // A switchback stair core (falls back to a flush wall ladder when the footprint is too
    // tight — the common case for a narrow tower), linking every walkable storey.
    addStairCore({ ops, box: { x0, y0, z0, x1, y1, z1, W, D, H }, slabYs, palette });
    // The keep's CROWN is content (the battlemented walkable deck), so it ALWAYS gets its
    // own access — even a single-storey tower. The stair core only links the interior
    // storeys; this hatch ladder climbs the TOP storey up THROUGH the deck and pops the
    // player onto the roof. (The stairwell pass never touches it: the deck isn't a labelled
    // storey plane, so it sees no gap here.)
    ops.push(...roofHatch({ x0, z0, x1, z1 }, slabYs[slabYs.length - 1], wallTop, palette));

    // --- Decay (cozy keeps this at 0): weather + chip the shaft, sparing corners ------
    if (decay > 0) {
      for (let y = groundY + 1; y <= wallTop - 1; y++) {
        for (let x = x0; x <= x1; x++) {
          for (let z = z0; z <= z1; z++) {
            if (x !== x0 && x !== x1 && z !== z0 && z !== z1) continue; // walls only
            if ((x === x0 || x === x1) && (z === z0 || z === z1)) continue; // keep corners
            const r = rnd();
            if (r < decay * 0.08) ops.push({ op: 'block', pos: [x, y, z], state: air });
            else if (r < decay * 0.08 + decay * 0.3) ops.push({ op: 'block', pos: [x, y, z], state: mossy });
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
