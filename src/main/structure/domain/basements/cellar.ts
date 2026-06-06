// "cellar" — a sunken cellar carved to a varied footprint (rect/L/T/U/plus,
// seeded, so it isn't always a square box): a SEALED stone shell with a distinct
// floor/ceiling and a grid of lit support pillars. No built-in vertical access —
// the ceiling stays solid so terrain can't reveal the interior; the circulation
// pass carves the stairwell down from the building above. Ported from the old
// `large_basement` template (materials → `defaults`, weathering/decay → theme).
import type { AuthoringOp } from '../../authoring/types';
import { type FootprintShape, makeFootprint } from '../footprint';
import { mulberry32 } from '../rng';
import { logProps } from '../structure-types/types';
import type { BasementModule } from './types';

export const cellar: BasementModule = {
  id: 'cellar',
  label: 'Cellar',
  category: 'basement',
  description:
    'A sunken stone cellar on a varied footprint (rect/L/T/U/plus): a sealed shell with a ' +
    'distinct floor and ceiling and a grid of lit support pillars. A versatile undercroft for ' +
    'storage, a workshop, or the start of a larger complex beneath the building.',
  knowledge: 'nbt/modules/basement/cellar.md',
  appliesTo: ['house', 'tower'],
  preview: { size: [11, 6, 11] },
  params: {
    decay: { kind: 'unit', default: 0.25 },
    shape: { kind: 'enum', default: 'auto', values: ['rect', 'l', 't', 'u', 'plus', 'auto'] },
  },
  defaults: {
    wall: 'minecraft:cobblestone',
    floor: 'minecraft:stone_bricks',
    ceiling: 'minecraft:cobblestone',
    pillar: 'minecraft:stone_bricks',
    light: 'minecraft:lantern',
  },
  build({ box, params, palette, seed }) {
    const { x0, y0, z0, x1, y1, z1 } = box;
    const decay = params.decay as number;
    const shape = params.shape as FootprintShape;

    const wall = palette.get('wall');
    const floorIdx = palette.get('floor');
    const ceil = palette.get('ceiling');
    const pillar = palette.get('pillar', logProps(palette.idOf('pillar')));
    const light = palette.get('light');
    const mossy = palette.weather('wall');

    const ops: AuthoringOp[] = [];
    const fp = makeFootprint({ x0, z0, x1, z1 }, shape, seed);

    // Floor + ceiling on every footprint column; perimeter columns also get a
    // full-height wall (interior columns stay hollow → cleared to air on compile).
    for (const [x, z] of fp.columns()) {
      ops.push({ op: 'block', pos: [x, y0, z], state: floorIdx });
      ops.push({ op: 'block', pos: [x, y1, z], state: ceil });
      if (fp.isEdge(x, z)) ops.push({ op: 'fill', from: [x, y0 + 1, z], to: [x, y1 - 1, z], state: wall });
    }

    // Support pillars on a 4-block grid, but only on interior footprint cells; each
    // capped with a light just under the ceiling so the cellar reads as lit.
    for (let x = x0 + 3; x <= x1 - 3; x += 4) {
      for (let z = z0 + 3; z <= z1 - 3; z += 4) {
        if (!fp.has(x, z) || fp.isEdge(x, z)) continue;
        ops.push({ op: 'fill', from: [x, y0 + 1, z], to: [x, y1 - 1, z], state: pillar });
        ops.push({ op: 'block', pos: [x, y1 - 1, z], state: light });
      }
    }

    // Decay: weather some perimeter wall cells with moss.
    if (decay > 0) {
      const rnd = mulberry32(seed ^ 0x9e3779b9);
      for (const [x, z] of fp.columns()) {
        if (!fp.isEdge(x, z)) continue;
        for (let y = y0 + 1; y < y1; y++) {
          if (rnd() < decay * 0.3) ops.push({ op: 'block', pos: [x, y, z], state: mossy });
        }
      }
    }
    return ops;
  },
};
