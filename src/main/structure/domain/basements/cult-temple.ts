// "cult-temple" — a hidden ritual chamber: a sealed blackstone undercroft built around a
// central raised altar dais with a summoning circle inlaid in the floor, four corner ritual
// pillars, and the cold blue glow of soul lanterns (with a single beam-of-light lantern
// hanging over the altar). Like every module it is built in terms of ROLES; its own
// `defaults` are a blackstone/polished-blackstone kit so it reads as a dark sanctum even
// under a sparse or warm decoration, and it pairs best with the `haunted` decoration.
//
// The build is the MASSING only (shell + altar + circle + pillars + lighting). The block-
// built dressing that completes the dread — a soul campfire on the altar, candle rings,
// skulls on the pillars, cobwebs, sculk veins — is documented for the generator in the
// knowledge guide (those props are placed by the AI, like all interiors).
import type { AuthoringOp } from '../../authoring/types';
import { type FootprintShape, makeFootprint } from '../footprint';
import { mulberry32 } from '../rng';
import { logProps } from '../structure-types/types';
import type { BasementModule } from './types';

export const cultTemple: BasementModule = {
  id: 'cult-temple',
  label: 'Cult temple',
  category: 'basement',
  description:
    'A hidden ritual chamber: a sealed blackstone undercroft built around a raised altar ' +
    'dais with a summoning circle inlaid in the floor, four corner ritual pillars, and the ' +
    'cold blue glow of soul lanterns. Dress it with a soul campfire on the altar, candle ' +
    'rings, skulls, and cobwebs. Pairs best with the Haunted look.',
  knowledge: 'nbt/modules/basement/cult-temple.md',
  appliesTo: ['house'],
  preview: { size: [11, 7, 11] },
  params: {
    decay: { kind: 'unit', default: 0.4 },
    shape: { kind: 'enum', default: 'rect', values: ['rect', 'plus', 'auto'] },
  },
  // A blackstone sanctum kit so it reads dark even under a sparse or warm decoration.
  defaults: {
    wall: 'minecraft:polished_blackstone_bricks',
    floor: 'minecraft:blackstone',
    ceiling: 'minecraft:polished_blackstone_bricks',
    foundation: 'minecraft:blackstone',
    pillar: 'minecraft:polished_blackstone',
    accent: 'minecraft:chiseled_polished_blackstone', // altar dais + summoning circle
    trim: 'minecraft:polished_blackstone_brick_slab', // cornice + altar table
    roof: 'minecraft:polished_blackstone_brick_stairs',
    light: 'minecraft:soul_lantern',
  },
  build({ box, params, palette, seed }): AuthoringOp[] {
    const { x0, y0, z0, x1, y1, z1, W, D } = box;
    const decay = params.decay as number;
    const shape = params.shape as FootprintShape;
    const fp = makeFootprint({ x0, z0, x1, z1 }, shape, seed);
    const rnd = mulberry32(seed ^ 0x6a17_5eed);

    const floor = palette.get('floor');
    const accent = palette.get('accent'); // dais + circle
    const wall = palette.get('wall');
    const ceil = palette.get('ceiling');
    const pillar = palette.get('pillar', logProps(palette.idOf('pillar')));
    const cornice = palette.get('trim', { type: 'top' });
    const altarTop = palette.get('trim', { type: 'top' });
    const hangLight = palette.get('light', { hanging: 'true' });
    const cornerLight = palette.get('light');
    const mossyWall = palette.weather('wall');
    const crackedFloor = palette.weather('floor');

    const xm = Math.floor((x0 + x1) / 2);
    const zm = Math.floor((z0 + z1) / 2);

    const ops: AuthoringOp[] = [];

    // Sealed chamber: floor + ceiling on every footprint column; perimeter columns get a
    // full-height wall. No openings (buried) — the circulation pass carves the stair down.
    for (const [x, z] of fp.columns()) {
      ops.push({ op: 'block', pos: [x, y0, z], state: floor });
      ops.push({ op: 'block', pos: [x, y1, z], state: ceil });
      if (fp.isEdge(x, z)) ops.push({ op: 'fill', from: [x, y0 + 1, z], to: [x, y1 - 1, z], state: wall });
    }

    // Cornice band: an INTERIOR slab ledge ringing the chamber one cell inside the wall,
    // just under the ceiling. It must NOT overwrite the perimeter wall's top course (a
    // top-slab there left an open slit around the basement — the "vão no topo da parede"
    // defect), so the structural wall stays full to the ceiling and the cornice is decor.
    if (W > 2 && D > 2) ops.push({ op: 'walls', from: [x0 + 1, y1 - 1, z0 + 1], to: [x1 - 1, y1 - 1, z1 - 1], state: cornice });

    // Summoning circle: an accent ring inlaid in the floor around the altar (radius r+1).
    const r = Math.max(1, Math.min(2, Math.floor(Math.min(W, D) / 2) - 2));
    const cr = r + 1;
    for (let x = xm - cr; x <= xm + cr; x++) {
      for (let z = zm - cr; z <= zm + cr; z++) {
        if (!fp.has(x, z) || fp.isEdge(x, z)) continue;
        const onRing = Math.abs(x - xm) === cr || Math.abs(z - zm) === cr;
        if (onRing) ops.push({ op: 'block', pos: [x, y0, z], state: accent });
      }
    }

    // Raised altar dais: a 1-tall accent platform (±r), a central pedestal of pillar with a
    // slab altar table, and a beam-of-light soul lantern hanging from the ceiling above it.
    for (let x = xm - r; x <= xm + r; x++) {
      for (let z = zm - r; z <= zm + r; z++) {
        if (fp.has(x, z) && !fp.isEdge(x, z)) ops.push({ op: 'block', pos: [x, y0 + 1, z], state: accent });
      }
    }
    if (y1 - 1 > y0 + 3) {
      ops.push({ op: 'fill', from: [xm, y0 + 2, zm], to: [xm, y0 + 3, zm], state: pillar });
      ops.push({ op: 'block', pos: [xm, y0 + 4, zm], state: altarTop });
      ops.push({ op: 'block', pos: [xm, y1 - 1, zm], state: hangLight });
    }

    // Four corner ritual pillars (inset from the corners), each capped with a soul lantern.
    const ix0 = x0 + 2, ix1 = x1 - 2, iz0 = z0 + 2, iz1 = z1 - 2;
    for (const x of [ix0, ix1]) {
      for (const z of [iz0, iz1]) {
        if (!fp.has(x, z) || fp.isEdge(x, z)) continue;
        ops.push({ op: 'fill', from: [x, y0 + 1, z], to: [x, y1 - 2, z], state: pillar });
        ops.push({ op: 'block', pos: [x, y1 - 1, z], state: cornerLight });
      }
    }

    // Decay: weather scattered wall + floor cells to their mossy/cracked variants (no effect
    // under a decoration with no `weather` map — then the chamber stays intact).
    if (decay > 0) {
      for (const [x, z] of fp.columns()) {
        if (fp.isEdge(x, z)) {
          for (let y = y0 + 1; y < y1; y++) if (rnd() < decay * 0.3) ops.push({ op: 'block', pos: [x, y, z], state: mossyWall });
        } else if (rnd() < decay * 0.15) {
          ops.push({ op: 'block', pos: [x, y0, z], state: crackedFloor });
        }
      }
    }
    return ops;
  },
};
