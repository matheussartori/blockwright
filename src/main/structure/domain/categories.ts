// The registry-of-registries: ONE category-keyed map over the per-category registries,
// so a lookup by (category, id) is a single map access instead of a `category === 'roof'
// ? getRoof(id) : …` ternary repeated across compose + preview + slot resolution. Adding
// a module category means registering it here once; every category-generic call site then
// works for it automatically. The typed per-category getters (getRoof, getDecoration, …)
// still exist for code that knows its category statically — this is the dynamic path.
import type { ModuleCategory, ModuleMeta } from './modules';
import type { GeometryModule } from './geometry-module';
import type { Registry } from './registry';
import { registry as structureRegistry } from './structure-types';
import { registry as decorationRegistry } from './decorations';
import { registry as roofRegistry } from './roofs';
import { registry as basementRegistry } from './basements';
import { registry as atticRegistry } from './attics';
import { registry as roomRegistry } from './rooms';
import { registry as surroundingsRegistry } from './surroundings';

/** Every category's registry, keyed by category. A `Registry<T>` (T extends ModuleMeta)
 *  is assignable to `Registry<ModuleMeta>` (T appears only in covariant return positions),
 *  so the heterogeneous registries unify here without loss. */
const REGISTRIES: Record<ModuleCategory, Registry<ModuleMeta>> = {
  structure: structureRegistry,
  decoration: decorationRegistry,
  roof: roofRegistry,
  basement: basementRegistry,
  attic: atticRegistry,
  room: roomRegistry,
  surroundings: surroundingsRegistry,
};

/** Look up a module by (category, id) — the dynamic dispatch the category-generic call
 *  sites use (the Details slot resolver, the gallery preview). Returns the base
 *  {@link ModuleMeta}; use {@link getGeometryModule} when the geometry hooks are needed. */
export function getModule(category: ModuleCategory, id: string): ModuleMeta | undefined {
  return REGISTRIES[category].get(id);
}

/** The categories whose modules carry compose-able geometry (build/integrations). */
export type GeometryCategory = 'roof' | 'basement' | 'attic' | 'surroundings';

/** The geometry registries, narrowed so a lookup returns a {@link GeometryModule} (with the
 *  `build`/`integrations`/`defaults`/`params` hooks the compose layer runs). */
const GEOMETRY_REGISTRIES: Record<GeometryCategory, Registry<GeometryModule>> = {
  roof: roofRegistry,
  basement: basementRegistry,
  attic: atticRegistry,
  surroundings: surroundingsRegistry,
};

/** Look up a geometry-bearing module by (category, id) — the compose layer's dispatch,
 *  typed so the caller can run the module's `build()`/`integrations` directly. */
export function getGeometryModule(category: GeometryCategory, id: string): GeometryModule | undefined {
  return GEOMETRY_REGISTRIES[category].get(id);
}
