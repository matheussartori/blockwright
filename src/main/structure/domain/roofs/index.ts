// Roof registry (category "roof"). Each roof typology is one module file (gable, hip,
// …) carrying its own `build()` geometry — the SINGLE source of roof geometry, run via
// `composeModule` both for the gallery preview and when a structure type delegates its
// roof (the house does). A selected roof also rides into generation as plain-language
// guidance + its own knowledge guide (loaded ONLY when selected, so an unused roof guide
// never bloats the prompt), and is documented in the gallery. Each roof links to the
// structures it fits via `appliesTo` (a growing list — start with `['house']`).
import type { ModuleSummary } from '../modules';
import { createRegistry } from '../registry';
import { gable } from './gable';
import { hip } from './hip';
import { flat } from './flat';
import type { RoofModule } from './types';

export type { RoofModule } from './types';

export const registry = createRegistry<RoofModule>([gable, hip, flat]);

/** Look up a roof module by id (undefined if unknown). */
export function getRoof(id: string): RoofModule | undefined {
  return registry.get(id);
}

/** Every roof module, as a module summary (for the composer picker + gallery). */
export function listRoofs(): ModuleSummary[] {
  return registry.list();
}

/** Every roof module (for the knowledge loader). */
export function roofModules(): RoofModule[] {
  return registry.all();
}
