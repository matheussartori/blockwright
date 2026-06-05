// "full" — a full below-grade cellar: a complete storey sunk under the building, the
// same footprint as the floor above, fully buried with no exterior windows. METADATA-
// ONLY for now (no `build()` geometry, not wired into `composeStructure`); it rides
// into generation as plain-language guidance + its own knowledge guide (loaded only
// when selected) and documents the type in the gallery. A `build()` can be added
// later without touching callers.
//
// Linked to the `house` via `appliesTo`; add another structure id there to reuse it.
import type { AuthoringOp } from '../../authoring/types';
import type { BasementModule } from './types';

export const full: BasementModule = {
  id: 'full',
  label: 'Full cellar',
  category: 'basement',
  description:
    'A full below-grade storey under the whole footprint, completely buried. No glass ' +
    'windows looking into dirt — use barred vents (iron_bars) high on the wall for light. ' +
    'Reached by the stair core from the floor above. Good for storage, a workshop, or a vault.',
  knowledge: 'nbt/modules/basement/full.md',
  appliesTo: ['house'],
  // A stony foundation kit so it reads right even under a sparse decoration.
  defaults: { wall: 'minecraft:cobblestone', floor: 'minecraft:stone_bricks', ceiling: 'minecraft:cobblestone', light: 'minecraft:lantern' },
  // GENERIC: a sealed stone room — floor, ceiling, four walls, a central ceiling light.
  // No openings (it's fully buried); vertical access is carved by the circulation pass.
  build({ box, palette }): AuthoringOp[] {
    const { x0, y0, z0, x1, y1, z1 } = box;
    const floor = palette.get('floor');
    const wall = palette.get('wall');
    const ceil = palette.get('ceiling');
    const light = palette.get('light', { hanging: 'true' });
    const xm = Math.floor((x0 + x1) / 2);
    const zm = Math.floor((z0 + z1) / 2);
    return [
      { op: 'fill', from: [x0, y0, z0], to: [x1, y0, z1], state: floor },
      { op: 'fill', from: [x0, y1, z0], to: [x1, y1, z1], state: ceil },
      { op: 'walls', from: [x0, y0 + 1, z0], to: [x1, y1 - 1, z1], state: wall },
      { op: 'block', pos: [xm, y1 - 1, zm], state: light },
    ];
  },
};
