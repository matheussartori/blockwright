// Surroundings registry (category "surroundings"). Each yard/landscaping typology is
// one module file carrying its own `build()` geometry — the SINGLE source of that ring's
// shape, run via `composeModule` when a structure type DELEGATES its grounds (the modern
// villa does: it insets its massing by the shared `SURROUND_MARGINS` and hands the full
// box over). A selected surroundings module also rides into generation as plain-language
// guidance + its own knowledge guide (loaded ONLY when selected), and is listed in the
// gallery. Each links to the structures it fits via `appliesTo` (a yard is composed
// around a specific massing, so the list is explicit — start with `['modern']`).
import { surroundMargins } from '@/shared/domain/surroundings';
import type { ModuleSummary } from '../modules';
import { createRegistry } from '../registry';
import { box, type Box } from '../structure-types/types';
import { modern } from './modern';
import type { SurroundingsModule } from './types';

export type { SurroundingsModule } from './types';

export const registry = createRegistry<SurroundingsModule>([modern]);

/** Look up a surroundings module by id (undefined if unknown). */
export function getSurroundings(id: string): SurroundingsModule | undefined {
  return registry.get(id);
}

/** Every surroundings module, as a module summary (for the composer picker + gallery). */
export function listSurroundings(): ModuleSummary[] {
  return registry.list();
}

/** Every surroundings module (for the knowledge loader). */
export function surroundingsModules(): SurroundingsModule[] {
  return registry.all();
}

/** The HOUSE footprint inside a build box that reserves a surroundings ring: the box
 *  inset by the module's shared margins (the ring is horizontal only — the full height
 *  is kept). Identity for 'none'/unknown ids. The structure type lays its massing in
 *  this inner box; the module re-derives the same bounds from the same constants, so
 *  the two always agree on where the house ends and the yard begins.
 *  @param b - The full (already expanded) build box.
 *  @param id - The selected surroundings-module id ('none'/'' = no ring).
 *  @returns The inner house {@link Box} (== `b` when no ring applies). */
export function insetHouseBox(b: Box, id: string | undefined): Box {
  const m = surroundMargins(id);
  if (!m) return b;
  return box([b.x0 + m.side, b.y0, b.z0 + m.front], [b.x1 - m.side, b.y1, b.z1 - m.back]);
}
