// Structure-type registry (category "structure"). Register a new archetype here (one
// file per type) and it immediately composes with every decoration — that's the whole
// point of the type↔decoration split. Names are validated against this registry before
// a build runs. (Basements/roofs are their own categories now; see ../basements,
// ../roofs.)
import { toSummary, type ModuleSummary } from '../modules';
import { paramFields } from '../params';
import { house } from './house';
import { tower } from './tower';
import type { StructureType } from './types';

export type { StructureType, BuildArgs, RolePalette, Box } from './types';

const STRUCTURE_TYPES: Record<string, StructureType> = {
  [house.id]: house,
  [tower.id]: tower,
};

/** Look up a structure type by id (undefined if unknown). */
export function getStructureType(id: string): StructureType | undefined {
  return STRUCTURE_TYPES[id];
}

/** Is `id` a registered structure type? (Aliases are resolved in compose, not here.) */
export function isStructureType(id: string): boolean {
  return id in STRUCTURE_TYPES;
}

/** Every registered structure-type id (for validation / UI / prompts). */
export function structureTypeIds(): string[] {
  return Object.keys(STRUCTURE_TYPES);
}

/** Every structure type, as a module summary (for the composer picker + gallery),
 *  carrying its tunable params so the Details controls are registry-driven. */
export function listStructureTypes(): ModuleSummary[] {
  return Object.values(STRUCTURE_TYPES).map((t) => ({ ...toSummary(t), params: paramFields(t.params) }));
}

/** Every structure module (for the knowledge loader / gallery preview). */
export function structureModules(): StructureType[] {
  return Object.values(STRUCTURE_TYPES);
}
