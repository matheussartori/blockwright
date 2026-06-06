// "hip" — a four-sided pitched roof: every wall is topped by a slope, meeting at a
// short central ridge (or a point on a square plan). It carries GENERIC geometry
// (`build()` — a single hip `roof` op over the host's wall box, works on any structure).
// No host-specific integration yet (a hip wraps evenly on every side, so it needs no
// gable-end detailing) — add an `integrations` entry when a host wants one. Run by
// `composeModule` — for the gallery preview AND the house's roof delegation.
//
// Linked to the `house` via `appliesTo`; add another structure id there to reuse it.
import type { AuthoringOp } from '../../authoring/types';
import type { RoofModule } from './types';

export const hip: RoofModule = {
  id: 'hip',
  label: 'Hip',
  category: 'roof',
  description:
    'A four-sided pitched roof: all four walls slope up to a short ridge (or a point on a ' +
    'square plan), so there are no vertical gable ends. Reads as more solid and formal than a ' +
    'gable, and wraps an overhanging eave evenly on every side.',
  knowledge: 'nbt/modules/roof/hip.md',
  appliesTo: ['house'],
  preview: { size: [9, 9, 7] },
  defaults: { roof: 'minecraft:oak_stairs', wall: 'minecraft:oak_planks' },
  // GENERIC: one hip roof op over the wall box (slopes on all four sides).
  build({ box, palette }): AuthoringOp[] {
    const { x0, y0, z0, x1, y1, z1 } = box;
    const stair = palette.get('roof'); // a *_stairs block — the roof op climbs it
    const fill = palette.get('wall');
    return [{ op: 'roof', from: [x0, y0, z0], to: [x1, y1, z1], state: stair, style: 'hip', fill }];
  },
};
