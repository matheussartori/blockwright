// Basement registry (category "basement"). SCAFFOLDED: the contract is defined and a
// seed module is registered so the gallery can describe it, but basements are not yet
// wired into `composeStructure` (no preview / not selectable in the composer). The
// upcoming "modular basement" pass will attach these beneath a host structure.
import { toSummary, type ModuleSummary } from '../modules';
import { basement } from './basement';
import type { BasementModule } from './types';

export type { BasementModule } from './types';

const BASEMENTS: Record<string, BasementModule> = {
  [basement.id]: basement,
};

/** Look up a basement module by id (undefined if unknown). */
export function getBasement(id: string): BasementModule | undefined {
  return BASEMENTS[id];
}

/** Every basement module, as a module summary (for the gallery). */
export function listBasements(): ModuleSummary[] {
  return Object.values(BASEMENTS).map(toSummary);
}

/** Every basement module (for the knowledge loader). */
export function basementModules(): BasementModule[] {
  return Object.values(BASEMENTS);
}
