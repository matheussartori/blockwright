// "crypt" — a sunken burial vault: a sealed stone undercroft with a central processional
// aisle flanked by rows of catacomb columns, a slab cornice under the ceiling, and tiers
// of bone burial niches (loculi) recessed along the long walls. Soul lanterns light it
// with a cold blue glow. It is built in terms of ROLES (so a decoration supplies the
// concrete blocks); its own `defaults` are a deepslate/bone kit so it reads as a tomb even
// under a sparse or warm decoration, and it pairs best with the `haunted` decoration.
//
// The build is the MASSING only (shell + columns + aisle + niches + lighting). The block-
// built dressing that makes it dreadful — skulls in the niches, cobwebs, candles, a soul
// campfire on the central tomb — is documented for the generator in the knowledge guide
// (those props are placed by the AI, like all interiors).
import type { AuthoringOp } from '../../authoring/types';
import { type FootprintShape, makeFootprint } from '../footprint';
import { mulberry32 } from '../rng';
import { logProps } from '../structure-types/types';
import type { BasementModule } from './types';

export const crypt: BasementModule = {
  id: 'crypt',
  label: 'Crypt',
  category: 'basement',
  description:
    'A sunken burial vault: a sealed stone undercroft with a central processional aisle ' +
    'flanked by catacomb columns, a slab cornice under the ceiling, and tiers of bone ' +
    'burial niches along the walls, lit by the cold blue flame of soul lanterns. Dress it ' +
    'with skulls, cobwebs, candles, and a central tomb. Pairs best with the Haunted look.',
  knowledge: 'nbt/modules/basement/crypt.md',
  appliesTo: ['house', 'tower'],
  preview: { size: [11, 6, 11] },
  params: {
    decay: { kind: 'unit', default: 0.45 },
    shape: { kind: 'enum', default: 'rect', values: ['rect', 'l', 't', 'u', 'plus', 'auto'] },
  },
  // A deepslate/bone tomb kit so it reads right even under a sparse or warm decoration.
  defaults: {
    wall: 'minecraft:deepslate_bricks',
    floor: 'minecraft:deepslate_tiles',
    ceiling: 'minecraft:deepslate_bricks',
    foundation: 'minecraft:cobbled_deepslate',
    pillar: 'minecraft:polished_deepslate',
    accent: 'minecraft:bone_block', // niche shelves + the aisle runner
    trim: 'minecraft:deepslate_brick_slab', // cornice + niche lintels
    roof: 'minecraft:deepslate_brick_stairs', // column springers
    light: 'minecraft:soul_lantern',
  },
  build({ box, params, palette, seed }): AuthoringOp[] {
    const { x0, y0, z0, x1, y1, z1 } = box;
    const decay = params.decay as number;
    const shape = params.shape as FootprintShape;
    const fp = makeFootprint({ x0, z0, x1, z1 }, shape, seed);
    const rnd = mulberry32(seed ^ 0x5eed_c0de);

    const floor = palette.get('floor');
    const aisle = palette.get('accent'); // bone runner / niche shelves
    const wall = palette.get('wall');
    const ceil = palette.get('ceiling');
    const pillar = palette.get('pillar', logProps(palette.idOf('pillar')));
    const cornice = palette.get('trim', { type: 'top' });
    const lintel = palette.get('trim', { type: 'bottom' });
    const hangLight = palette.get('light', { hanging: 'true' });
    const wallLight = palette.get('light');
    const mossyWall = palette.weather('wall');
    const crackedFloor = palette.weather('floor');

    const xm = Math.floor((x0 + x1) / 2);

    const ops: AuthoringOp[] = [];

    // Sealed vault: floor + ceiling on every footprint column; perimeter columns get a
    // full-height wall. No openings (buried) — the circulation pass carves the stair down.
    for (const [x, z] of fp.columns()) {
      ops.push({ op: 'block', pos: [x, y0, z], state: floor });
      ops.push({ op: 'block', pos: [x, y1, z], state: ceil });
      if (fp.isEdge(x, z)) ops.push({ op: 'fill', from: [x, y0 + 1, z], to: [x, y1 - 1, z], state: wall });
    }

    // Cornice: an INTERIOR slab ledge ringing the vault one cell inside the wall, just under
    // the ceiling — it must NOT replace the perimeter wall's top course (a top-slab there left
    // an open slit around the basement), so the structural wall stays full to the ceiling.
    if (x1 - x0 > 2 && z1 - z0 > 2) ops.push({ op: 'walls', from: [x0 + 1, y1 - 1, z0 + 1], to: [x1 - 1, y1 - 1, z1 - 1], state: cornice });

    // Processional aisle: a bone runner straight down the centre of the floor.
    for (let z = z0 + 1; z <= z1 - 1; z++) if (fp.has(xm, z)) ops.push({ op: 'block', pos: [xm, y0, z], state: aisle });

    // Catacomb columns: two rows flanking the aisle on a 3-block grid, each capped with a
    // hanging soul lantern just under the ceiling. The central aisle column line is skipped.
    for (let x = x0 + 2; x <= x1 - 2; x += 3) {
      if (x === xm) continue;
      for (let z = z0 + 2; z <= z1 - 2; z += 3) {
        if (!fp.has(x, z) || fp.isEdge(x, z)) continue;
        ops.push({ op: 'fill', from: [x, y0 + 1, z], to: [x, y1 - 2, z], state: pillar });
        ops.push({ op: 'block', pos: [x, y1 - 1, z], state: hangLight });
      }
    }

    // Burial niches (loculi): along both long walls, a bone shelf at chest height with a
    // slab lintel above it — a wall of tombs. A wall lantern lights every other niche.
    for (let z = z0 + 2; z <= z1 - 2; z += 2) {
      for (const xEdge of [x0, x1]) {
        if (!fp.has(xEdge, z) || !fp.isEdge(xEdge, z)) continue;
        const inward = xEdge === x0 ? 1 : -1;
        const nx = xEdge + inward; // one cell in from the wall (interior)
        if (!fp.has(nx, z)) continue;
        ops.push({ op: 'block', pos: [nx, y0 + 1, z], state: aisle }); // bone shelf
        ops.push({ op: 'block', pos: [nx, y0 + 2, z], state: lintel }); // slab lintel
        if (((z - z0) & 1) === 0 && y1 - 2 > y0 + 2) ops.push({ op: 'block', pos: [xEdge, y1 - 2, z], state: wallLight });
      }
    }

    // Decay: weather scattered wall + floor cells to their mossy/cracked variants (no
    // effect under a decoration with no `weather` map, e.g. cozy — then it stays intact).
    if (decay > 0) {
      for (const [x, z] of fp.columns()) {
        if (fp.isEdge(x, z)) {
          for (let y = y0 + 1; y < y1; y++) if (rnd() < decay * 0.35) ops.push({ op: 'block', pos: [x, y, z], state: mossyWall });
        } else if (rnd() < decay * 0.2) {
          ops.push({ op: 'block', pos: [x, y0, z], state: crackedFloor });
        }
      }
    }
    return ops;
  },
};
