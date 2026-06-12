// "farmhouse" — a code-built "casa de sítio": a NON-rectangular L plan (a long main wing +
// a perpendicular back wing) so the silhouette is cross-gabled, not a box, with a deep
// covered VERANDA + upper GALLERY across the main wing's front, a covered porch tucked in
// the notch, a tall exterior chimney on a gable end, and a steep DARK tiled roof. This is
// the fix for "the farmhouse keeps coming out as the classic rectangle": the massing the
// model can't reliably invent is owned by code (like modern/sakura/gothic) and SEEDED
// (`seedShell`), so a fresh build keeps this casco and only furnishes/refines it.
//
// Massing in semantic roles (the decoration supplies blocks); ships its own farmhouse kit.
import type { AuthoringOp } from '../../authoring/types';
import { planStoreys } from '@/shared/domain/storeys';
import { addStairCore } from './stair-core';
import { ceilingLanterns, cornerPosts, roofCap, roofFormFor, storeyEntries } from './shell-kit';
import { dormers, frontVeranda } from './farmhouse-parts';
import { box, logProps, type Box, type FloorPlanEntry, type StructureType } from './types';

/** The L split + storey lines for a box+params — shared by `build()` and `floors()` so the
 *  detector/stairwell pass see the SAME planes the geometry uses. The shared ladder
 *  honours the user's explicit per-floor heights when given. */
function plan(b: Box, floors: number, isFlat: boolean, floorHeights?: number[]) {
  const { x0, y0, z0, x1, y1, D } = b;
  const W = x1 - x0 + 1;
  const xn = x0 + Math.max(4, Math.ceil(W * 0.6)); // back wing's first (east) column
  const zn = z0 + Math.max(4, Math.ceil(D * 0.45)); // back wing front (the notch depth)
  const mainX1 = xn - 1; // main wing's east column
  const mainW = mainX1 - x0 + 1;
  const roofRings = isFlat ? 2 : Math.max(2, Math.floor(Math.min(mainW, D) / 2));
  const ladder = planStoreys({ baseY: y0, idealTop: y1 - roofRings, maxWallTop: y1 - 2, floors, floorHeights });
  const slabYs = ladder.slabYs;
  const wallTop = ladder.wallTop > y1 - 2 ? Math.max(y0 + 3, y1 - 2) : ladder.wallTop;
  const upperFloorY = floors >= 2 ? slabYs[1] : null;
  return { xn, zn, mainX1, slabYs, wallTop, upperFloorY };
}

export const farmhouse: StructureType = {
  id: 'farmhouse',
  label: 'Farmhouse',
  category: 'structure',
  group: 'house',
  description:
    'A rustic country "casa de sítio": an L-shaped, cross-gabled silhouette — never a box — ' +
    'with a deep covered veranda on timber posts and an upper gallery across the front, a ' +
    'sheltered porch in the crook, exposed dark-log framing over a stone plinth, a steep dark ' +
    'tiled roof, and a tall gable-end chimney. Sprawling, lived-in, grounded.',
  knowledge: 'nbt/modules/structure/farmhouse.md',
  preview: { size: [17, 14, 13], params: { floors: 2, decoration: 'farmhouse' } },
  finalize: ['chimney'],
  maxRoomsPerFloor: 3,
  // A fresh build is SEEDED with this shell so the model keeps the sítio massing.
  seedShell: true,
  pairedDecoration: 'farmhouse',
  params: {
    floors: { kind: 'int', default: 2, min: 1, max: 3, label: 'Floors' },
    roof: {
      kind: 'enum', default: 'gable', values: ['gable', 'hip', 'flat'], label: 'Roof',
      labels: { gable: 'Gable', hip: 'Hip', flat: 'Flat' }, module: 'roof',
    },
    decay: { kind: 'unit', default: 0 },
  },
  // Warm oak boards crossed by dark stripped-log framing, a dark slate roof, a stone base.
  defaults: {
    wall: 'minecraft:oak_planks',
    floor: 'minecraft:oak_planks',
    ceiling: 'minecraft:oak_planks',
    foundation: 'minecraft:cobblestone',
    corner: 'minecraft:stripped_dark_oak_log',
    accent: 'minecraft:stripped_oak_log',
    beam: 'minecraft:stripped_dark_oak_log',
    pillar: 'minecraft:stripped_dark_oak_log',
    trim: 'minecraft:oak_slab',
    roof: 'minecraft:deepslate_tile_stairs',
    window: 'minecraft:glass_pane',
    glass: 'minecraft:glass',
    door: 'minecraft:oak_door',
    fence: 'minecraft:oak_fence',
    light: 'minecraft:lantern',
  },
  floors(b, params, floorHeights): FloorPlanEntry[] {
    const { slabYs, wallTop } = plan(b, params.floors as number, (params.roof as string) === 'flat', floorHeights);
    return storeyEntries(slabYs, wallTop);
  },
  build({ box: b, params, palette, floorHeights, composeModule }) {
    const { x0, y0, z0, x1, y1, z1 } = b;
    const floors = params.floors as number;
    const roofShape = (params.roof as string) ?? 'gable';
    const isFlat = roofShape === 'flat';
    const { xn, zn, mainX1, slabYs, wallTop, upperFloorY } = plan(b, floors, isFlat, floorHeights);

    const wall = palette.get('wall');
    const found = palette.get('foundation');
    const floorIdx = palette.get('floor');
    const fence = palette.get('fence');
    const trim = palette.get('trim', { type: 'top' });
    const corner = palette.get('corner', logProps(palette.idOf('corner')));
    const post = palette.get('pillar', logProps(palette.idOf('pillar')));
    const lantern = palette.get('light', { hanging: 'true' });

    const ops: AuthoringOp[] = [];

    // --- Foundation + per-storey floor slabs over the L union (main ∪ back wing) -------
    const slab = (y: number, st: number): void => {
      ops.push({ op: 'fill', from: [x0, y, z0], to: [mainX1, y, z1], state: st }); // main wing
      ops.push({ op: 'fill', from: [xn, y, zn], to: [x1, y, z1], state: st });      // back wing
    };
    slab(y0, found);
    for (let f = 1; f < floors; f++) slab(slabYs[f], floorIdx);

    // --- Perimeter walls along the L outline ------------------------------------------
    const wallSeg = (ax: number, az: number, bx: number, bz: number): void => {
      ops.push({ op: 'fill', from: [ax, y0, az], to: [bx, wallTop, bz], state: wall });
    };
    wallSeg(x0, z0, x0, z1);         // main wing left
    wallSeg(x0, z1, x1, z1);         // back (both wings)
    wallSeg(x1, zn, x1, z1);         // back wing right
    wallSeg(x0, z0, mainX1, z0);     // main wing front
    wallSeg(mainX1, z0, mainX1, zn); // main wing east (faces the notch)
    wallSeg(xn, zn, x1, zn);         // back wing front (faces the notch)

    // Log corner posts at the L's outer + inner corners (kit).
    ops.push(...cornerPosts([[x0, z0], [x0, z1], [x1, z1], [x1, zn], [mainX1, z0], [xn, zn]], y0, wallTop, corner));

    // --- Cross-gable roof (per wing) — respecting the user's gable/hip/flat pick. The
    // kit resolves ONE form for both wings ('roofFormFor' guarantees a cap: a pitch that
    // can't fit still caps flat — never a roofless wing); perpendicular gable ridges make
    // the intersecting cross-gable roofline (the farmhouse "H").
    const form = roofFormFor(roofShape, y1 - wallTop, palette.idOf('roof').endsWith('_stairs'));
    ops.push(...roofCap(composeModule, form, [x0, wallTop + 1, z0], [mainX1, y1, z1], 'z'));
    ops.push(...roofCap(composeModule, form, [xn, wallTop + 1, zn], [x1, y1, z1], 'x'));

    // --- The deep covered veranda + upper gallery across the MAIN wing front -----------
    const mainBox = box([x0, y0, z0], [mainX1, y1, z1]);
    ops.push(...frontVeranda(mainBox, palette, { wallTop, upperFloorY }));
    // A dormer over the back-wing front slope (its ridge runs along x, so zn is a slope).
    if (form !== 'flat' && x1 - xn >= 4) ops.push(...dormers(box([xn, y0, zn], [x1, y1, z1]), palette, wallTop, zn));

    // --- Covered porch in the notch [xn..x1, z0..zn-1] (continues the front veranda) ---
    const porchTop = (upperFloorY ?? Math.min(wallTop, y0 + 4)) - 1;
    if (porchTop - y0 >= 2) {
      ops.push({ op: 'fill', from: [xn, y0, z0], to: [x1, y0, zn - 1], state: floorIdx }); // deck
      ops.push({ op: 'fill', from: [xn, porchTop + 1, z0], to: [x1, porchTop + 1, zn - 1], state: trim }); // flat porch roof
      // Posts at the front-right corner + along the open edges; a rail between them.
      for (const [px, pz] of [[xn, z0], [x1, z0], [x1, zn - 1]] as [number, number][]) {
        ops.push({ op: 'fill', from: [px, y0 + 1, pz], to: [px, porchTop, pz], state: post });
      }
      ops.push({ op: 'line', from: [xn, y0 + 1, z0], to: [x1, y0 + 1, z0], state: fence }); // front rail
      ops.push({ op: 'line', from: [x1, y0 + 1, z0], to: [x1, y0 + 1, zn - 1], state: fence }); // side rail
      ops.push({ op: 'block', pos: [Math.floor((xn + x1) / 2), porchTop, Math.floor((z0 + zn) / 2)], state: lantern });
    }

    // --- Tall exterior chimney on the main wing's left gable end (back third) ----------
    // A stone stack rising through the roof (the AI caps it with a smoking campfire while
    // furnishing; the 'chimney' finalizer then completes/dedupes it — same as the classic).
    const chimZ = Math.max(z0 + 1, z1 - 2);
    ops.push({ op: 'fill', from: [x0, y0, chimZ], to: [x0, y1, chimZ], state: found });

    // --- A hanging lantern under each main-wing ceiling (the guaranteed-light rule, kit)
    const cx = Math.floor((x0 + mainX1) / 2), cz = Math.floor((z0 + z1) / 2);
    ops.push(...ceilingLanterns(slabYs, wallTop, cx, cz, lantern));

    // --- Stair core in the MAIN wing back-right (the stairwell pass only repairs broken
    // flights, never invents one — so a multi-storey shell must build its own). Reuses the
    // classic's proven 2-wide switchback over the main wing's clean rectangle. -----------
    if (floors >= 2) {
      const mainWing = box([x0, y0, z0], [mainX1, y1, z1]);
      addStairCore({ ops, box: mainWing, slabYs, palette });
    }

    return ops;
  },
};
