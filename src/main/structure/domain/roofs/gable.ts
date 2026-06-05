// "gable" — a classic two-sided pitched roof with a triangular gable end at each end
// of the ridge. It carries GENERIC geometry (`build()` — a single gable `roof` op over
// the host's wall box, works on any structure) PLUS a HOUSE-SPECIFIC integration
// (`integrations.house` — gable-end vents, which only make sense over a house's attic).
// Run by `composeModule` (gallery preview today; structure-type delegation later).
//
// Linked to the `house` via `appliesTo`; add another structure id (and optionally an
// `integrations` entry for it) to reuse it on another structure.
import type { AuthoringOp } from '../../authoring/types';
import type { RoofModule } from './types';

export const gable: RoofModule = {
  id: 'gable',
  label: 'Gable',
  category: 'roof',
  description:
    'A classic two-sided pitched roof: two slopes meeting at a single ridge, with a ' +
    'triangular gable wall closing each end. The most common cottage/house roof — simple, ' +
    'steep enough to read as a proper pitch, and the easy home for an attic in the void.',
  knowledge: 'nbt/modules/roof/gable.md',
  appliesTo: ['house'],
  preview: { size: [9, 9, 7] },
  // A roof kit so it reads right even under a sparse decoration (the decoration overrides it).
  defaults: { roof: 'minecraft:oak_stairs', wall: 'minecraft:oak_planks' },
  // GENERIC: one gable roof op over the wall box; ridge runs along the longer axis.
  build({ box, palette }): AuthoringOp[] {
    const { x0, y0, z0, x1, y1, z1, W, D } = box;
    const stair = palette.get('roof'); // a *_stairs block — the roof op climbs it
    const fill = palette.get('wall'); // closes the gable ends
    const ridge: 'x' | 'z' = W <= D ? 'z' : 'x';
    return [{ op: 'roof', from: [x0, y0, z0], to: [x1, y1, z1], state: stair, style: 'gable', ridge, fill }];
  },
  // HOUSE-SPECIFIC: a small vent at each gable end's peak (houses have attics to breathe).
  integrations: {
    house({ box, palette }): AuthoringOp[] {
      const { x0, y0, z0, x1, y1, z1, W, D } = box;
      const vent = palette.get('window');
      const ridge: 'x' | 'z' = W <= D ? 'z' : 'x';
      const ventY = y0 + Math.max(1, Math.floor((y1 - y0) / 2));
      if (ridge === 'z') {
        const xm = Math.floor((x0 + x1) / 2);
        return [
          { op: 'block', pos: [xm, ventY, z0], state: vent },
          { op: 'block', pos: [xm, ventY, z1], state: vent },
        ];
      }
      const zm = Math.floor((z0 + z1) / 2);
      return [
        { op: 'block', pos: [x0, ventY, zm], state: vent },
        { op: 'block', pos: [x1, ventY, zm], state: vent },
      ];
    },
  },
};
