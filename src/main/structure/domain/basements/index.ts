// Basement registry (category "basement"). Each basement typology is one module file
// (cellar, crypt, cult-temple). They carry their own `build()` geometry (run via
// `composeModule`/`composeModulePreview`) AND a knowledge guide loaded ONLY when the
// basement is selected (so an unused basement guide never bloats the prompt). Each
// links to the structures it fits via `appliesTo` (a growing list — e.g. `['house']`).
// Add a basement: new file + register below + a guide under
// `knowledge/nbt/modules/basement/<id>.md`.
import type { ModuleSummary } from '../modules';
import { createRegistry } from '../registry';
import { cellar } from './cellar';
import { crypt } from './crypt';
import { cultTemple } from './cult-temple';
import type { BasementModule } from './types';

export type { BasementModule } from './types';

const registry = createRegistry<BasementModule>([cellar, crypt, cultTemple]);

/** Look up a basement module by id (undefined if unknown). */
export function getBasement(id: string): BasementModule | undefined {
  return registry.get(id);
}

/** Every basement module, as a module summary (for the gallery). */
export function listBasements(): ModuleSummary[] {
  return registry.list();
}

/** Every basement module (for the knowledge loader). */
export function basementModules(): BasementModule[] {
  return registry.all();
}
