// Exterior registry (category "exterior"). Each exterior finishing STYLE is one module
// file (farmhouse / sakura / gothic) carrying a material `skin` (re-clad overlay over the
// decoration) + optional additive `build()` geometry (signature exterior volumes). The
// compose layer applies the SELECTED exterior to a structure type's build when a
// `template` op names one via `exterior:<id>` (and for the gallery preview). A selected
// exterior also rides into generation as guidance + its own knowledge guide (loaded only
// when selected), and is listed in the gallery. Each links to the pitched houses it fits
// via `appliesTo` (classic/cabin/l-shaped — never modern).
import type { ModuleSummary } from '../modules';
import { createRegistry } from '../registry';
import { farmhouse } from './farmhouse';
import { sakura } from './sakura';
import { gothic } from './gothic';
import type { ExteriorModule } from './types';

export type { ExteriorModule } from './types';

const registry = createRegistry<ExteriorModule>([farmhouse, sakura, gothic]);

/** Look up an exterior module by id (undefined if unknown). */
export function getExterior(id: string): ExteriorModule | undefined {
  return registry.get(id);
}

/** Every exterior module, as a module summary (for the composer picker + gallery). */
export function listExteriors(): ModuleSummary[] {
  return registry.list();
}

/** Every exterior module (for the knowledge loader). */
export function exteriorModules(): ExteriorModule[] {
  return registry.all();
}
