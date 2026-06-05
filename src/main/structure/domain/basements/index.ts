// Basement registry (category "basement"). Each basement typology is one module file
// (full, half, modular …). They are METADATA-ONLY for now: no `build()` geometry is
// wired into `composeStructure` — a selected basement rides into generation as
// plain-language guidance + its own knowledge guide (loaded ONLY when selected, so an
// unused basement guide never bloats the prompt) and is documented in the gallery.
// Each basement links to the structures it fits via `appliesTo` (a growing list —
// start with `['house']`, add more later). The "modular" seed keeps a `build()` for
// the upcoming geometry pass; full/half are guidance-only.
import { toSummary, type ModuleSummary } from '../modules';
import { basement } from './basement';
import { full } from './full';
import { half } from './half';
import type { BasementModule } from './types';

export type { BasementModule } from './types';

const BASEMENTS: Record<string, BasementModule> = {
  [full.id]: full,
  [half.id]: half,
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
