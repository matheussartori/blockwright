// Attic registry (category "attic"). Each attic typology is one module file (storage /
// bedroom) carrying its own `build()` geometry — the SINGLE source of attic geometry, run
// via `composeModule` when a pitched-roof structure delegates its attic (the classic house
// does). A selected attic also rides into generation as plain-language guidance + its own
// knowledge guide (loaded ONLY when selected), and is documented in the gallery. Each attic
// links to the structures it fits via `appliesTo` and conflicts with the flat roof via
// `incompatibleWith` (no roof void).
import type { ModuleSummary } from '../modules';
import { createRegistry } from '../registry';
import { storage } from './storage';
import { bedroom } from './bedroom';
import type { AtticModule } from './types';

export type { AtticModule } from './types';

export const registry = createRegistry<AtticModule>([storage, bedroom]);

/** Look up an attic module by id (undefined if unknown). */
export function getAttic(id: string): AtticModule | undefined {
  return registry.get(id);
}

/** Every attic module, as a module summary (for the composer picker + gallery). */
export function listAttics(): ModuleSummary[] {
  return registry.list();
}

/** Every attic module (for the knowledge loader). */
export function atticModules(): AtticModule[] {
  return registry.all();
}
