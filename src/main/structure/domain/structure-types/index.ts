// Structure-type registry (category "structure"). Register a new archetype here (one
// file per type) and it immediately composes with every decoration — that's the whole
// point of the type↔decoration split. Names are validated against this registry before
// a build runs. (Basements/roofs are their own categories now; see ../basements,
// ../roofs.)
import { toSummary, type ModuleSummary } from '../modules';
import { paramFields } from '../params';
import { createRegistry } from '../registry';
import { church } from './church';
import { cottage } from './cottage';
import { farmhouse } from './farmhouse';
import { keep } from './keep';
import { manor } from './manor';
import { raisedCottage } from './raised-cottage';
import { spire } from './spire';
import { villa } from './villa';
import type { FinalizePass, StructureType } from './types';

export type { StructureType, BuildArgs, RolePalette, Box, FinalizePass } from './types';

export const registry = createRegistry<StructureType>([cottage, villa, farmhouse, raisedCottage, manor, keep, spire, church]);

/** Legacy structure-type ids → their current id. The form-based rename (2026-06) replaced
 *  the old theme-named ids; a project `.nbt`/chat persisted under an old id still resolves
 *  through this map so saved builds keep working. (Decoration ids were NOT renamed.) */
const LEGACY_ALIASES: Record<string, string> = {
  classic: 'cottage',
  modern: 'villa',
  sakura: 'raised-cottage',
  gothic: 'manor',
  'tower-classic': 'keep',
  'haunted-tower': 'spire',
};

/** Resolve a possibly-legacy id to the current registered id. */
function resolveId(id: string): string {
  return LEGACY_ALIASES[id] ?? id;
}

/** Look up a structure type by id (undefined if unknown). Resolves legacy aliases. */
export function getStructureType(id: string): StructureType | undefined {
  return registry.get(resolveId(id));
}

/** The structure GROUP id a type belongs to (undefined for an unknown id) — the host
 *  link `moduleAppliesTo` resolves so a group-tagged module shares across the family. */
export function structureGroupOf(id: string | undefined): string | undefined {
  return id ? registry.get(resolveId(id))?.group : undefined;
}

/** Is `id` a registered structure type (or a legacy alias of one)? */
export function isStructureType(id: string): boolean {
  return registry.has(resolveId(id));
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
  return (id ? registry.get(resolveId(id))?.finalize : undefined) ?? [];
}
