// "bedroom" — a FINISHED bedroom loft in the roof void: the gable space floored in proper
// planks as a cosy upstairs room (a bed, a rug, a side table), reached by the ladder the
// host stair core drops. The finished counterpart to the rough `storage` attic — same
// shape, a livable floor + light, and the AI furnishes the bedroom (see the guide).
//
// Delegated by a pitched-roof structure via `composeModule('attic', 'bedroom', …)` against
// the HOST palette, so the loft floor matches the house. Incompatible with a flat roof.
import type { AuthoringOp } from '../../authoring/types';
import type { AtticModule } from './types';

export const bedroom: AtticModule = {
  id: 'bedroom',
  label: 'Bedroom attic',
  category: 'attic',
  description:
    'A finished bedroom loft in the roof void: the gable space floored in proper planks as a ' +
    'cosy upstairs room — a bed under the slope, a rug and a side table — reached by a ladder ' +
    'from the top floor. Needs a pitched roof (it lives in the void underneath).',
  knowledge: 'nbt/modules/attic/bedroom.md',
  appliesTo: ['cottage'],
  incompatibleWith: ['flat'],
  // GENERIC: floor the void at its base (box.y0 = the wall top) in the finished floor
  // material + a standing lantern. The host carves the ladder step-off through this floor.
  build({ box, palette }): AuthoringOp[] {
    const { x0, y0, z0, x1, z1 } = box;
    const floorMat = palette.get('floor'); // finished planks — a livable room
    const light = palette.get('light');
    const cx = Math.floor((x0 + x1) / 2);
    const cz = Math.floor((z0 + z1) / 2);
    return [
      { op: 'fill', from: [x0 + 1, y0, z0 + 1], to: [x1 - 1, y0, z1 - 1], state: floorMat },
      { op: 'block', pos: [cx, y0 + 1, cz], state: light },
    ];
  },
};
