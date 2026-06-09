// "storage" — a rough STORAGE LOFT in the roof void: the gable space floored over as a
// plain attic for chests, barrels and odds-and-ends, reached by the ladder the host stair
// core drops. The floor is the rough plinth material (not finished planks) and a single
// standing lantern keeps it lit. The AI furnishes the clutter (see the knowledge guide).
//
// Delegated by a pitched-roof structure via `composeModule('attic', 'storage', …)` against
// the HOST palette, so the loft floor matches the house. Incompatible with a flat roof.
import type { AuthoringOp } from '../../authoring/types';
import type { AtticModule } from './types';

export const storage: AtticModule = {
  id: 'storage',
  label: 'Storage attic',
  category: 'attic',
  description:
    'A rough storage loft in the roof void: the gable space floored over for chests, barrels ' +
    'and odds-and-ends, reached by a ladder from the top floor. Plain and utilitarian — not a ' +
    'living space. Needs a pitched roof (it lives in the void underneath).',
  knowledge: 'nbt/modules/attic/storage.md',
  appliesTo: ['classic'],
  incompatibleWith: ['flat'],
  // GENERIC: floor the void at its base (box.y0 = the wall top) in the rough plinth
  // material + a standing lantern. The host carves the ladder step-off through this floor.
  build({ box, palette }): AuthoringOp[] {
    const { x0, y0, z0, x1, z1 } = box;
    const floorMat = palette.get('foundation'); // rough loft boards/stone, not finished planks
    const light = palette.get('light');
    const cx = Math.floor((x0 + x1) / 2);
    const cz = Math.floor((z0 + z1) / 2);
    return [
      { op: 'fill', from: [x0 + 1, y0, z0 + 1], to: [x1 - 1, y0, z1 - 1], state: floorMat },
      { op: 'block', pos: [cx, y0 + 1, cz], state: light },
    ];
  },
};
