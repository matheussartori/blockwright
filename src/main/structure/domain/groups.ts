// Structure GROUPS — a family that several structure types belong to (e.g. the
// "House" group: classic, modern, farmhouse, sakura, gothic). A group is the SHARING unit for
// modules: a roof/basement/room whose `appliesTo` names a group id pairs with EVERY
// member of that group, instead of having to list each structure id. So a gable roof
// tagged `appliesTo: ['house']` is offered on every house-family structure, while one
// tagged `appliesTo: ['classic']` stays specific to that single type. The renderer
// reads a group both to header the gallery rail / Details select and (via the host's
// group) to resolve `moduleAppliesTo`. Pure data — labels are registry data (like
// module labels), so deliberately untranslated.

/** A named family of structure types. */
export interface StructureGroup {
  /** Stable id, used in a module's `appliesTo` to share it across the whole group. */
  id: string;
  /** Human label for the gallery rail header + the Details optgroup. */
  label: string;
}

/** The registered structure groups. Add a group here, then point each member
 *  structure type's `group` at its id. */
export const STRUCTURE_GROUPS: StructureGroup[] = [
  { id: 'house', label: 'House' },
  { id: 'tower', label: 'Tower' },
];

/** Look up a group by id (undefined if unknown). */
export function getStructureGroup(id: string): StructureGroup | undefined {
  return STRUCTURE_GROUPS.find((g) => g.id === id);
}
