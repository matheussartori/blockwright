// "modern" — a contemporary flat-roofed villa, the deliberate opposite of `house`. Where
// the house is a single pitched-roof box, the modern type owns a MODERN MASSING: two
// stacked, OFFSET cuboid volumes (the upper one set back to leave a roof terrace), FLAT
// roofs with slim parapets, big GLASS curtain walls broken by dark accent mullions, and
// glass terrace railings. It reads as white concrete + dark accent + glass — pair it with
// the `modern` decoration for the right materials.
//
// All geometry is in semantic roles (the decoration supplies the blocks); the type ships a
// white/quartz `defaults` kit so it still reads modern under a sparse decoration. The model
// never rebuilds this shell — it furnishes the open, glass-walled rooms it hands over.
import type { AuthoringOp } from '../../authoring/types';
import { planStoreys } from '@/shared/domain/storeys';
import type { ParamValues } from '../params';
import { insetHouseBox } from '../surroundings';
import type { Box, FloorPlanEntry, StructureType } from './types';

/** The modern villa's vertical levels for a box + floor count — the single source of its
 *  storey math, shared by `build()` (which needs the deck Ys) and `floors()` (which needs
 *  the walkable storeys). `gTop` is the lower roof/upper-floor deck; `uTop` the upper roof.
 *  `roofReserve` keeps that many cells free at the box top for a PITCHED roof (0 for the
 *  default flat roof, which caps the walls directly), so a gable/hip cap isn't clipped.
 *  Explicit `floorHeights` (the user's per-floor heights) take over the split when they
 *  fit; the villa's signature low 4–6 storeys remain the UNIFORM fallback only. */
function modernLevels(y0: number, y1: number, H: number, floors: number, roofReserve = 0, floorHeights?: number[]): {
  gTop: number; twoStorey: boolean; uH: number; uTop: number;
} {
  const top = y1 - roofReserve; // the highest wall course; the roof sits above it
  if (floorHeights?.length) {
    // The villa stacks at most two volumes; the ladder clamps the user's heights to fit
    // under `top - 1` (the rail/deck course legacy math reserves too).
    const n = floors >= 2 ? 2 : 1;
    const ladder = planStoreys({ baseY: y0, idealTop: top - 1, maxWallTop: top - 1, floors: n, floorHeights });
    if (ladder.wallTop <= top - 1) {
      const gTop = y0 + ladder.heights[0];
      const twoStorey = n === 2;
      const uH = twoStorey ? ladder.heights[1] : 0;
      return { gTop, twoStorey, uH, uTop: twoStorey ? gTop + uH : gTop };
    }
    // Too tight for the requested heights even after clamping → the uniform fallback.
  }
  const availH = top - y0;
  const gH = Math.max(4, Math.min(6, Math.floor(availH / (floors >= 2 ? 2 : 1))));
  const gTop = y0 + gH;
  const twoStorey = floors >= 2 && top - gTop >= 5;
  const uH = twoStorey ? Math.max(4, Math.min(6, top - gTop - 1)) : 0;
  const uTop = twoStorey ? gTop + uH : gTop;
  return { gTop, twoStorey, uH, uTop };
}

/** The selected surroundings-ring id when it genuinely fits (the inset still leaves a
 *  livable house footprint), else null. Shared by `build()` and `floors()` so the
 *  massing and the storey math always agree on which box the HOUSE occupies. */
function yardFor(outer: Box, params: ParamValues): string | null {
  const id = typeof params.surroundings === 'string' ? params.surroundings : 'none';
  if (id === 'none') return null;
  const inner = insetHouseBox(outer, id);
  return inner.W >= 7 && inner.D >= 7 ? id : null;
}

/** The set-back of the upper volume (front depth, one side) — derived from the footprint
 *  alone, so it's known before the storey split. Shared by `build()` (geometry) and the
 *  roof reserve. */
function upperSetback(box: Box): { fs: number; ss: number } {
  const fs = Math.min(4, Math.max(2, Math.floor((box.D - 1) / 3))); // front set-back depth
  const ss = box.W >= 9 ? Math.min(3, Math.floor(box.W / 5)) : 0; // side set-back (one side)
  return { fs, ss };
}

/** Cells to reserve at the box top for a pitched roof over the (set-back) upper volume:
 *  the gable/hip rise is half the smaller upper-footprint span. 0 when flat. */
function modernRoofReserve(box: Box, pitched: boolean): number {
  if (!pitched) return 0;
  const { fs, ss } = upperSetback(box);
  return Math.max(2, Math.floor(Math.min(box.W - ss, box.D - fs) / 2));
}

/** Lay a glass CURTAIN WALL along one face: glass fill between full-height dark accent
 *  mullions every few columns, so the facade reads as window bands, not punched holes. */
function curtainWall(
  ops: AuthoringOp[],
  axis: 'x' | 'z',
  fixed: number,
  a: number,
  b: number,
  yLo: number,
  yHi: number,
  glass: number,
  mullion: number,
): void {
  for (let c = a; c <= b; c++) {
    const isMullion = (c - a) % 3 === 0 || c === b; // a dark fin every 3 + one at the end
    const state = isMullion ? mullion : glass;
    const from: [number, number, number] = axis === 'x' ? [c, yLo, fixed] : [fixed, yLo, c];
    const to: [number, number, number] = axis === 'x' ? [c, yHi, fixed] : [fixed, yHi, c];
    ops.push({ op: 'fill', from, to, state });
  }
}

/** A glass-pane railing around the rim of a flat roof/terrace box at height `y`
 *  (the four edges of x0..x1 × z0..z1). */
function roofRail(ops: AuthoringOp[], x0: number, x1: number, z0: number, z1: number, y: number, rail: number): void {
  ops.push({ op: 'line', from: [x0, y, z0], to: [x1, y, z0], state: rail });
  ops.push({ op: 'line', from: [x0, y, z1], to: [x1, y, z1], state: rail });
  ops.push({ op: 'line', from: [x0, y, z0], to: [x0, y, z1], state: rail });
  ops.push({ op: 'line', from: [x1, y, z0], to: [x1, y, z1], state: rail });
}

export const modern: StructureType = {
  id: 'modern',
  label: 'Modern house',
  category: 'structure',
  group: 'house',
  description:
    'A contemporary flat-roofed villa: stacked, offset white-concrete volumes with a set-back ' +
    'upper floor and roof terrace, floor-to-ceiling glass curtain walls broken by dark accent ' +
    'columns, and glass railings. The modern alternative to the pitched ' +
    'House — pair it with the Modern decoration for white-and-glass materials.',
  knowledge: 'nbt/modules/structure/modern.md',
  // Previewed (and seeded) under the modern decoration so the white/glass palette reads.
  preview: { size: [15, 13, 13], params: { decoration: 'modern' } },
  // NO chimney finalizer (modern houses have none); circulation is the always-on pass.
  // A fresh AI build is SEEDED with this code-built shell (the model can't reliably
  // invent the modern silhouette) — it keeps the massing and furnishes the interior.
  seedShell: true,
  pairedDecoration: 'modern',
  params: {
    floors: { kind: 'int', default: 2, min: 1, max: 3, label: 'Floors' },
    // Surfaced as the "Roof" module select (category 'roof'), so it's hidden from the
    // type's own Details controls (`module: 'roof'`). Default FLAT keeps the modern villa's
    // identity; gable/hip crown the upper volume with a low white-quartz pitch.
    roof: {
      kind: 'enum', default: 'flat', values: ['flat', 'gable', 'hip'], label: 'Roof',
      labels: { flat: 'Flat', gable: 'Gable', hip: 'Hip' }, module: 'roof',
    },
    // Surfaced as the "Surroundings" module select (hidden from the type's own Details
    // controls like `roof`). A non-'none' pick INSETS the house by the shared ring
    // margins and delegates the yard geometry to that surroundings module.
    surroundings: {
      kind: 'enum', default: 'none', values: ['none', 'modern'], label: 'Surroundings',
      labels: { none: 'None', modern: 'Modern' }, module: 'surroundings',
    },
    decay: { kind: 'unit', default: 0 }, // modern is always crisp
  },
  // A white-concrete / quartz / dark-accent / glass kit (used when the decoration is sparse;
  // the Modern decoration maps the same intent).
  defaults: {
    wall: 'minecraft:white_concrete',
    floor: 'minecraft:smooth_quartz',
    ceiling: 'minecraft:white_concrete',
    foundation: 'minecraft:smooth_stone',
    corner: 'minecraft:polished_blackstone',
    accent: 'minecraft:polished_blackstone',
    pillar: 'minecraft:polished_blackstone',
    beam: 'minecraft:polished_blackstone',
    trim: 'minecraft:smooth_quartz_slab',
    // Only used when the user picks a gable/hip roof (the flat default caps with `ceiling`
    // + `trim`); a white-quartz pitch keeps the modern look. The decoration overrides it.
    roof: 'minecraft:smooth_quartz_stairs',
    window: 'minecraft:glass_pane',
    glass: 'minecraft:glass',
    door: 'minecraft:dark_oak_door',
    fence: 'minecraft:dark_oak_fence',
    water: 'minecraft:water',
    light: 'minecraft:sea_lantern',
  },
  build({ box: outer, params, palette, floorHeights, composeModule }) {
    // A picked surroundings ring reserves the box's outer margins for the yard: the
    // HOUSE is laid in the inset box, and the ring module wraps it over the full box.
    const yard = yardFor(outer, params);
    const box = yard ? insetHouseBox(outer, yard) : outer;
    const { x0, y0, z0, x1, y1, z1, H } = box;
    const floors = params.floors as number;
    const roofShape = (params.roof as string) ?? 'flat';
    const pitched = roofShape === 'gable' || roofShape === 'hip';
    const roofReserve = modernRoofReserve(box, pitched);

    const air = palette.air();
    const white = palette.get('wall');
    const deck = palette.get('ceiling');
    const quartz = palette.get('floor');
    const found = palette.get('foundation');
    const dark = palette.get('pillar');
    const glass = palette.get('glass');
    const rail = palette.get('window');
    const sea = palette.get('light');

    const ops: AuthoringOp[] = [];
    const cx = Math.floor((x0 + x1) / 2);

    // The yard first (it never overlaps the inset house, so order is cosmetic — laying
    // it first means any future overlap resolves in the house's favour).
    if (yard) {
      ops.push(...composeModule('surroundings', yard, [outer.x0, outer.y0, outer.z0], [outer.x1, outer.y1, outer.z1]));
    }

    // The house volume fills the whole footprint (the front pool yard was removed — a
    // water feature will return later as a separate, opt-in element).
    const hz0 = z0; // the house's front wall

    // --- Storey heights (shared with floors() via modernLevels) ---------------------
    const { gTop, twoStorey, uTop } = modernLevels(y0, y1, H, floors, roofReserve, floorHeights);

    // --- Lower volume (full house footprint) ----------------------------------------
    ops.push({ op: 'fill', from: [x0, y0, hz0], to: [x1, y0, z1], state: found });   // floor base
    ops.push({ op: 'fill', from: [x0, y0, hz0], to: [x1, y0, z1], state: quartz });  // interior floor
    ops.push({ op: 'walls', from: [x0, y0, hz0], to: [x1, gTop, z1], state: white }); // white shell
    // Dark accent corner columns, full height.
    for (const [px, pz] of [[x0, hz0], [x0, z1], [x1, hz0], [x1, z1]] as [number, number][]) {
      ops.push({ op: 'fill', from: [px, y0, pz], to: [px, gTop, pz], state: dark });
    }
    // Glass curtain walls on all four ground faces (between the corner columns).
    const gLo = y0 + 1, gHi = gTop - 1;
    if (gHi >= gLo) {
      curtainWall(ops, 'x', hz0, x0 + 1, x1 - 1, gLo, gHi, glass, dark); // front
      curtainWall(ops, 'x', z1, x0 + 1, x1 - 1, gLo, gHi, glass, dark);  // back
      curtainWall(ops, 'z', x0, hz0 + 1, z1 - 1, gLo, gHi, glass, dark); // left
      curtainWall(ops, 'z', x1, hz0 + 1, z1 - 1, gLo, gHi, glass, dark); // right
    }
    // The lower roof = a flat walkable deck over the whole footprint.
    ops.push({ op: 'fill', from: [x0, gTop, hz0], to: [x1, gTop, z1], state: deck });

    // Entrance: a centred opening in the front glass + the seated door.
    ops.push({ op: 'fill', from: [cx, y0 + 1, hz0], to: [cx, y0 + 2, hz0], state: air });
    ops.push({ op: 'block', pos: [cx, y0 + 1, hz0], state: palette.get('door', { facing: 'north', half: 'lower', hinge: 'left', open: 'false', powered: 'false' }) });
    ops.push({ op: 'block', pos: [cx, y0 + 2, hz0], state: palette.get('door', { facing: 'north', half: 'upper', hinge: 'left', open: 'false', powered: 'false' }) });

    // --- Upper volume (set back from the front → a roof terrace) ---------------------
    if (twoStorey) {
      const { fs, ss } = upperSetback(box);
      const ux0 = x0, ux1 = x1 - ss;
      const uz0 = hz0 + fs, uz1 = z1;
      ops.push({ op: 'fill', from: [ux0, gTop, uz0], to: [ux1, gTop, uz1], state: quartz }); // upper floor
      ops.push({ op: 'walls', from: [ux0, gTop, uz0], to: [ux1, uTop, uz1], state: white });
      for (const [px, pz] of [[ux0, uz0], [ux0, uz1], [ux1, uz0], [ux1, uz1]] as [number, number][]) {
        ops.push({ op: 'fill', from: [px, gTop, pz], to: [px, uTop, pz], state: dark });
      }
      const uLo = gTop + 1, uHi = uTop - 1;
      if (uHi >= uLo) {
        curtainWall(ops, 'x', uz0, ux0 + 1, ux1 - 1, uLo, uHi, glass, dark); // upper front (over the terrace)
        curtainWall(ops, 'x', uz1, ux0 + 1, ux1 - 1, uLo, uHi, glass, dark);
        curtainWall(ops, 'z', ux0, uz0 + 1, uz1 - 1, uLo, uHi, glass, dark);
        curtainWall(ops, 'z', ux1, uz0 + 1, uz1 - 1, uLo, uHi, glass, dark);
      }
      ops.push({ op: 'fill', from: [ux0, uTop, uz0], to: [ux1, uTop, uz1], state: deck }); // upper ceiling (deck under a pitch, or the flat roof)
      // Glass rail around the open terrace (the lower roof NOT under the upper volume).
      roofRail(ops, x0, x1, hz0, z1, gTop + 1, rail);
      // A doorway from the upper room out onto the terrace (open the front-centre pane).
      ops.push({ op: 'fill', from: [cx, gTop + 1, uz0], to: [cx, gTop + 2, uz0], state: air });
      if (pitched) {
        // A low pitched cap over the upper volume — the modern villa "honours" the roof pick.
        ops.push(...composeModule('roof', roofShape, [ux0, uTop + 1, uz0], [ux1, y1, uz1]));
      } else {
        roofRail(ops, ux0, ux1, uz0, uz1, uTop + 1, rail); // parapet rail around the flat upper roof
      }
    } else if (pitched) {
      // Single storey + a pitched pick: cap the whole footprint instead of a terrace.
      ops.push(...composeModule('roof', roofShape, [x0, gTop + 1, hz0], [x1, y1, z1]));
    } else {
      // Single storey, flat: the lower roof is the main terrace — rail its whole rim.
      roofRail(ops, x0, x1, hz0, z1, gTop + 1, rail);
    }

    // --- Light: recessed sea-lantern strips in each ceiling -------------------------
    ops.push({ op: 'block', pos: [cx, gTop - 1, Math.floor((hz0 + z1) / 2)], state: sea });
    if (twoStorey) ops.push({ op: 'block', pos: [cx, uTop - 1, Math.floor((hz0 + z1) / 2)], state: sea });

    return ops;
  },
  // Authoritative storeys (the SAME level math `build()` uses) so the viewer labels the
  // flat-roofed villa's floors exactly, instead of the geometric detector mistaking its
  // stacked flat decks for extra storeys.
  floors(box: Box, params: ParamValues, floorHeights?: number[]): FloorPlanEntry[] {
    // The SAME house-box inset build() applies: a surroundings ring narrows the footprint,
    // and the pitched-roof reserve scales with the HOUSE's spans, not the full box's.
    const yard = yardFor(box, params);
    const b = yard ? insetHouseBox(box, yard) : box;
    const roofShape = (params.roof as string) ?? 'flat';
    const reserve = modernRoofReserve(b, roofShape === 'gable' || roofShape === 'hip');
    const { gTop, twoStorey } = modernLevels(b.y0, b.y1, b.H, params.floors as number, reserve, floorHeights);
    if (twoStorey) {
      return [
        { from: b.y0, to: gTop - 1, role: 'ground' },
        { from: gTop, to: b.y1, role: 'upper' },
      ];
    }
    return [{ from: b.y0, to: b.y1, role: 'ground' }];
  },
};
