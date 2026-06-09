// "flat" — a modern flat roof: no pitch at all. The wall box is simply capped with a
// solid walkable DECK and a slim PARAPET rim around the edge (the low lip that reads as a
// flat-roof terrace, not an open box top). It carries GENERIC geometry (`build()`, any
// host) and is the roof every modern villa already builds inline — exposed here as a
// selectable typology so the classic/sakura/gothic houses can take a flat roof too.
//
// A flat roof leaves NO roof void, so it is INCOMPATIBLE with an attic (which lives in
// that void) — declared via `incompatibleWith`. Run by `composeModule` for the gallery
// preview AND when a structure delegates its roof.
import type { AuthoringOp } from '../../authoring/types';
import type { RoofModule } from './types';

export const flat: RoofModule = {
  id: 'flat',
  label: 'Flat',
  category: 'roof',
  description:
    'A modern flat roof: the walls are capped with a solid walkable deck and a slim parapet ' +
    'rim — no pitch, no ridge. Low, horizontal and contemporary; doubles as a roof terrace. ' +
    'Because it leaves no roof void, a flat roof cannot host an attic.',
  knowledge: 'nbt/modules/roof/flat.md',
  appliesTo: ['house'],
  // No roof void → no attic can live up here.
  incompatibleWith: ['storage', 'bedroom'],
  preview: { size: [9, 6, 7] },
  // A flat-cap kit so it reads right even under a sparse decoration (the decoration + host
  // palette override it). `roof`/`ceiling` = the deck, `trim` = the parapet lip.
  defaults: { roof: 'minecraft:smooth_quartz', ceiling: 'minecraft:smooth_quartz', trim: 'minecraft:quartz_slab' },
  // GENERIC: a solid deck across the footprint at the base of the roof box, plus a 1-high
  // parapet rim. The box is whatever the host hands over (the structure keeps the walls
  // high for a flat roof, so the cap is thin).
  build({ box, palette }): AuthoringOp[] {
    const { x0, y0, z0, x1, y1, z1 } = box;
    const deck = palette.get('ceiling');
    const parapet = palette.get('trim');
    const ops: AuthoringOp[] = [];
    ops.push({ op: 'fill', from: [x0, y0, z0], to: [x1, y0, z1], state: deck }); // walkable deck
    const py = Math.min(y0 + 1, y1);
    ops.push({ op: 'walls', from: [x0, py, z0], to: [x1, py, z1], state: parapet }); // parapet rim
    return ops;
  },
};
