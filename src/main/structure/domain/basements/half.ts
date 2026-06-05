// "half" — a half-buried (semi-sunk) basement: the storey sits half below grade so its
// upper course clears the ground, leaving room for a real clerestory window band that
// daylights the room. METADATA-ONLY for now (no `build()` geometry, not wired into
// `composeStructure`); it rides into generation as plain-language guidance + its own
// knowledge guide (loaded only when selected) and documents the type in the gallery.
//
// Linked to the `house` via `appliesTo`; add another structure id there to reuse it.
import type { BasementModule } from './types';

export const half: BasementModule = {
  id: 'half',
  label: 'Half-buried',
  category: 'basement',
  description:
    'A semi-sunk storey: half below grade so its top course clears the ground, giving room ' +
    'for a high clerestory window band that brings daylight in (unlike a full cellar). Reads ' +
    'as a raised ground floor over a walk-out lower level — good for a sunlit den or studio.',
  knowledge: 'nbt/modules/basement/half.md',
  appliesTo: ['house'],
};
