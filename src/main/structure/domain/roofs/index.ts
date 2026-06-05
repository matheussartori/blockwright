// Roof registry (category "roof"). Each roof typology is one module file (gable, hip,
// …). They are METADATA-ONLY for now: no `build()` geometry is wired into
// `composeStructure` (structure types still emit their own `roof` op) — a selected
// roof rides into generation as plain-language guidance + its own knowledge guide
// (loaded ONLY when selected, so an unused roof guide never bloats the prompt), and
// is documented in the gallery. Each roof links to the structures it fits via
// `appliesTo` (a growing list — start with `['house']`, add more later).
import { toSummary, type ModuleSummary } from '../modules';
import { gable } from './gable';
import { hip } from './hip';
import type { RoofModule } from './types';

export type { RoofModule } from './types';

const ROOFS: Record<string, RoofModule> = {
  [gable.id]: gable,
  [hip.id]: hip,
};

/** Look up a roof module by id (undefined if unknown). */
export function getRoof(id: string): RoofModule | undefined {
  return ROOFS[id];
}

/** Every roof module, as a module summary (for the composer picker + gallery). */
export function listRoofs(): ModuleSummary[] {
  return Object.values(ROOFS).map(toSummary);
}

/** Every roof module (for the knowledge loader). */
export function roofModules(): RoofModule[] {
  return Object.values(ROOFS);
}
