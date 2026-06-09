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
import type { ParamValues } from '../params';
import type { Box, FloorPlanEntry, StructureType } from './types';

/** The modern villa's vertical levels for a box + floor count — the single source of its
 *  storey math, shared by `build()` (which needs the deck Ys) and `floors()` (which needs
 *  the walkable storeys). `gTop` is the lower roof/upper-floor deck; `uTop` the upper roof. */
function modernLevels(y0: number, y1: number, H: number, floors: number): {
  gTop: number; twoStorey: boolean; uH: number; uTop: number;
} {
  const gH = Math.max(4, Math.min(6, Math.floor((H - 1) / (floors >= 2 ? 2 : 1))));
  const gTop = y0 + gH;
  const twoStorey = floors >= 2 && y1 - gTop >= 5;
  const uH = twoStorey ? Math.max(4, Math.min(6, y1 - gTop - 1)) : 0;
  const uTop = twoStorey ? gTop + uH : gTop;
  return { gTop, twoStorey, uH, uTop };
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
  // Multi-level circulation cleanup; NO chimney (modern houses have none).
  finalize: ['stairs'],
  // A fresh AI build is SEEDED with this code-built shell (the model can't reliably
  // invent the modern silhouette) — it keeps the massing and furnishes the interior.
  seedShell: true,
  params: {
    floors: { kind: 'int', default: 2, min: 1, max: 3, label: 'Floors' },
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
    roof: 'minecraft:smooth_quartz_slab',
    window: 'minecraft:glass_pane',
    glass: 'minecraft:glass',
    door: 'minecraft:dark_oak_door',
    fence: 'minecraft:dark_oak_fence',
    water: 'minecraft:water',
    light: 'minecraft:sea_lantern',
  },
  build({ box, params, palette }) {
    const { x0, y0, z0, x1, y1, z1, W, H } = box;
    const floors = params.floors as number;

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

    // The house volume fills the whole footprint (the front pool yard was removed — a
    // water feature will return later as a separate, opt-in element).
    const hz0 = z0; // the house's front wall

    // --- Storey heights (shared with floors() via modernLevels) ---------------------
    const { gTop, twoStorey, uTop } = modernLevels(y0, y1, H, floors);

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
      const fs = Math.min(4, Math.max(2, Math.floor((z1 - hz0) / 3))); // front set-back depth
      const ss = W >= 9 ? Math.min(3, Math.floor(W / 5)) : 0;          // side set-back (one side)
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
      ops.push({ op: 'fill', from: [ux0, uTop, uz0], to: [ux1, uTop, uz1], state: deck }); // upper flat roof
      // Glass rail around the open terrace (the lower roof NOT under the upper volume).
      roofRail(ops, x0, x1, hz0, z1, gTop + 1, rail);
      // A doorway from the upper room out onto the terrace (open the front-centre pane).
      ops.push({ op: 'fill', from: [cx, gTop + 1, uz0], to: [cx, gTop + 2, uz0], state: air });
      // Parapet rail around the upper roof.
      roofRail(ops, ux0, ux1, uz0, uz1, uTop + 1, rail);
    } else {
      // Single storey: the lower roof is the main terrace — rail its whole rim.
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
  floors(box: Box, params: ParamValues): FloorPlanEntry[] {
    const { gTop, twoStorey } = modernLevels(box.y0, box.y1, box.H, params.floors as number);
    if (twoStorey) {
      return [
        { from: box.y0, to: gTop - 1, role: 'ground' },
        { from: gTop, to: box.y1, role: 'upper' },
      ];
    }
    return [{ from: box.y0, to: box.y1, role: 'ground' }];
  },
};
