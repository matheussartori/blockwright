// A tiny registry factory shared by every module category (structure / decoration /
// basement / roof / room). Each category's `index.ts` used to hand-roll the same
// `Record<id, Module>` plus `get`/`ids`/`list`/`all` accessors; this collapses that
// boilerplate to one well-tested implementation, so adding a category — or growing an
// existing one — is a one-liner and the accessors can never drift between categories.
import { toSummary, type ModuleMeta, type ModuleSummary } from './modules';

/** The accessors every category registry exposes over its modules. */
export interface Registry<T extends ModuleMeta> {
  /** Look up a module by id (undefined if unknown). */
  get(id: string): T | undefined;
  /** Is `id` a registered module? */
  has(id: string): boolean;
  /** Every registered id (insertion order). */
  ids(): string[];
  /** Every registered module (insertion order) — for the knowledge loader / previews. */
  all(): T[];
  /** Every module projected to the renderer-facing summary (composer picker + gallery). */
  list(): ModuleSummary[];
}

/**
 * Build a registry from a list of modules, keyed by each module's `id`.
 *
 * @typeParam T - The concrete module type for this category (extends {@link ModuleMeta}).
 * @param modules - The modules to register. A later module with a duplicate id wins.
 * @returns A {@link Registry} exposing the shared lookup/list accessors.
 */
export function createRegistry<T extends ModuleMeta>(modules: T[]): Registry<T> {
  const byId: Record<string, T> = {};
  for (const m of modules) byId[m.id] = m;
  return {
    get: (id) => byId[id],
    has: (id) => id in byId,
    ids: () => Object.keys(byId),
    all: () => Object.values(byId),
    list: () => Object.values(byId).map(toSummary),
  };
}
