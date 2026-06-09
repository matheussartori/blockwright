// "modern" — a contemporary flat-roofed villa, the deliberate opposite of `house`. Where
// the house is a single pitched-roof box, the modern type owns a MODERN MASSING: two
// stacked, OFFSET cuboid volumes (the upper one set back to leave a roof terrace), FLAT
// roofs with slim parapets, big GLASS curtain walls broken by dark accent mullions, glass
// terrace railings, and an optional ground-level POOL. It reads as white concrete + dark
// accent + glass — pair it with the `modern` decoration for the right materials.
//
// All geometry is in semantic roles (the decoration supplies the blocks); the type ships a
// white/quartz `defaults` kit so it still reads modern under a sparse decoration. The model
// never rebuilds this shell — it furnishes the open, glass-walled rooms it hands over.
import type { AuthoringOp } from '../../authoring/types';
import type { StructureType } from './types';

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
    'columns, glass railings, and a ground-level pool. The modern alternative to the pitched ' +
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
    pool: {
      kind: 'enum', default: 'yes', values: ['yes', 'no'], label: 'Pool',
      labels: { yes: 'Pool', no: 'No pool' },
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
    roof: 'minecraft:smooth_quartz_slab',
    window: 'minecraft:glass_pane',
    glass: 'minecraft:glass',
    door: 'minecraft:dark_oak_door',
    fence: 'minecraft:dark_oak_fence',
    water: 'minecraft:water',
    light: 'minecraft:sea_lantern',
  },
  build({ box, params, palette }) {
    const { x0, y0, z0, x1, y1, z1, W, H, D } = box;
    const floors = params.floors as number;
    const wantPool = (params.pool as string) !== 'no';

    const air = palette.air();
    const white = palette.get('wall');
    const deck = palette.get('ceiling');
    const quartz = palette.get('floor');
    const found = palette.get('foundation');
    const dark = palette.get('pillar');
    const glass = palette.get('glass');
    const rail = palette.get('window');
    const water = palette.get('water');
    const sea = palette.get('light');

    const ops: AuthoringOp[] = [];
    const cx = Math.floor((x0 + x1) / 2);

    // --- Front pool yard (optional) -------------------------------------------------
    // A modern house faces a pool. When the plot is deep enough, reserve a shallow FRONT
    // strip as an outdoor terrace with a sunken pool; the house volume starts behind it.
    const yardD = wantPool && D >= 12 ? 4 : 0;
    const hz0 = z0 + yardD;       // the house's front wall
    if (yardD > 0) {
      ops.push({ op: 'fill', from: [x0, y0, z0], to: [x1, y0, hz0 - 1], state: found }); // paved yard
      // A pool sunk into the paving, framed by a quartz-slab rim.
      const px0 = x0 + 1, px1 = x1 - 1, pz0 = z0 + 1, pz1 = hz0 - 1;
      if (px1 - px0 >= 1 && pz1 - pz0 >= 0) {
        ops.push({ op: 'fill', from: [px0, y0, pz0], to: [px1, y0, pz1], state: water });
      }
    }

    // --- Storey heights -------------------------------------------------------------
    const gH = Math.max(4, Math.min(6, Math.floor((H - 1) / (floors >= 2 ? 2 : 1))));
    const gTop = y0 + gH;                                   // lower roof / terrace deck level
    const twoStorey = floors >= 2 && y1 - gTop >= 5;
    const uH = twoStorey ? Math.max(4, Math.min(6, y1 - gTop - 1)) : 0;
    const uTop = twoStorey ? gTop + uH : gTop;              // upper roof level

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
};
