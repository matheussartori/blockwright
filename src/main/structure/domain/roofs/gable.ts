// "gable" — a classic two-sided pitched roof with a triangular gable end at each
// end of the ridge. METADATA-ONLY for now: it carries no `build()` geometry and is
// not wired into `composeStructure`. It rides into generation as plain-language
// guidance + its own knowledge guide (loaded only when selected), and documents the
// type in the gallery. A `build()` + ops can be added later without touching callers.
//
// Linked to the `house` via `appliesTo`; add another structure id there to reuse it.
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
};
