// "hip" — a four-sided pitched roof: every wall is topped by a slope, meeting at a
// short central ridge (or a point on a square plan). No gable walls. METADATA-ONLY
// for now (no `build()` geometry, not wired into `composeStructure`); it rides into
// generation as plain-language guidance + its own knowledge guide and documents the
// type in the gallery. A `build()` can be added later without touching callers.
//
// Linked to the `house` via `appliesTo`; add another structure id there to reuse it.
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
};
