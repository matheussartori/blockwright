// "full" — a full below-grade cellar: a complete storey sunk under the building, the
// same footprint as the floor above, fully buried with no exterior windows. METADATA-
// ONLY for now (no `build()` geometry, not wired into `composeStructure`); it rides
// into generation as plain-language guidance + its own knowledge guide (loaded only
// when selected) and documents the type in the gallery. A `build()` can be added
// later without touching callers.
//
// Linked to the `house` via `appliesTo`; add another structure id there to reuse it.
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
};
