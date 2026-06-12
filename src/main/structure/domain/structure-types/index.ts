// Structure-type registry (category "structure"). Register a new archetype here (one
// file per type) and it immediately composes with every decoration — that's the whole
// point of the type↔decoration split. Names are validated against this registry before
// a build runs. (Basements/roofs are their own categories now; see ../basements,
// ../roofs.)
import { toSummary, type ModuleSummary } from '../modules';
import { paramFields } from '../params';
import { createRegistry } from '../registry';
import { classic } from './classic';
import { farmhouse } from './farmhouse';
import { gothic } from './gothic';
import { modern } from './modern';
import { sakura } from './sakura';
import type { FinalizePass, StructureType } from './types';

export type { StructureType, BuildArgs, RolePalette, Box, FinalizePass } from './types';

export const registry = createRegistry<StructureType>([classic, modern, farmhouse, sakura, gothic]);

/** Look up a structure type by id (undefined if unknown). */
export function getStructureType(id: string): StructureType | undefined {
  return registry.get(id);
}

/** The structure GROUP id a type belongs to (undefined for an unknown id) — the host
 *  link `moduleAppliesTo` resolves so a group-tagged module shares across the family. */
export function structureGroupOf(id: string | undefined): string | undefined {
  return id ? registry.get(id)?.group : undefined;
}

/** Is `id` a registered structure type? (Aliases are resolved in compose, not here.) */
export function isStructureType(id: string): boolean {
  return registry.has(id);
}

/** Every registered structure-type id (for validation / UI / prompts). */
export function structureTypeIds(): string[] {
  return registry.ids();
}

/** Every structure type, as a module summary (for the composer picker + gallery),
 *  carrying its tunable params so the Details controls are registry-driven. */
export function listStructureTypes(): ModuleSummary[] {
  return registry.all().map((t) => ({
    ...toSummary(t),
    group: t.group,
    params: paramFields(t.params),
    maxRoomsPerFloor: t.maxRoomsPerFloor,
    pairedDecoration: t.pairedDecoration,
  }));
}

/** Every structure module (for the knowledge loader / gallery preview). */
export function structureModules(): StructureType[] {
  return registry.all();
}

/** The code post-processing passes a structure type opts into (empty for an unknown
 *  id). Drives the compile pipeline's per-structure gating — the modular "which fix
 *  applies to which structure" lookup. */
export function structureFinalizers(id: string | undefined): FinalizePass[] {
  return (id ? registry.get(id)?.finalize : undefined) ?? [];
}
