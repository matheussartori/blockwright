// Roof registry (category "roof"). SCAFFOLDED: the contract is defined but no roof
// modules are registered yet (structure types still emit their own `roof` op). The
// upcoming "roof typologies" pass will add modules here.
import { type ModuleSummary } from '../modules';
import type { RoofModule } from './types';

export type { RoofModule } from './types';

const ROOFS: Record<string, RoofModule> = {};

/** Look up a roof module by id (undefined if unknown). */
export function getRoof(id: string): RoofModule | undefined {
  return ROOFS[id];
}

/** Every roof module, as a module summary (for the gallery). */
export function listRoofs(): ModuleSummary[] {
  return [];
}

/** Every roof module (for the knowledge loader). */
export function roofModules(): RoofModule[] {
  return Object.values(ROOFS);
}
