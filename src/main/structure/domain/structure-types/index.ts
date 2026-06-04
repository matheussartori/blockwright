// Structure-type registry. Register a new archetype here (one file per type) and it
// immediately composes with every decoration theme — that's the whole point of the
// type↔theme split. Names are validated against this registry (plus compose's
// aliases) before a build runs.
import { basement } from './basement';
import { house } from './house';
import type { StructureType } from './types';

export type { StructureType, BuildArgs, RolePalette, Box } from './types';

const STRUCTURE_TYPES: Record<string, StructureType> = {
  [house.id]: house,
  [basement.id]: basement,
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
