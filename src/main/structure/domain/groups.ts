// Structure GROUPS — a family that several structure types belong to (e.g. the
// "House" group: cottage, villa, farmhouse, raised-cottage, manor). A group is the SHARING unit for
// modules: a roof/basement/room whose `appliesTo` names a group id pairs with EVERY
// member of that group, instead of having to list each structure id. So a gable roof
// tagged `appliesTo: ['house']` is offered on every house-family structure, while one
// tagged `appliesTo: ['cottage']` stays specific to that single type. The renderer
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
  { id: 'church', label: 'Church' },
];

/** ROOM groups — the family a room PROGRAM belongs to (the everyday `general` rooms vs.
 *  the `horror` set). Distinct from {@link STRUCTURE_GROUPS}: rooms aren't shared via
 *  `appliesTo` by these ids, so they only header the room picker/gallery. A room declares
 *  its group via `defineRoom`; `listModuleCatalog` merges both group lists into the catalog
 *  so the renderer resolves either id to a label the same way. Reuses {@link StructureGroup}
 *  ({id,label}). */
export const ROOM_GROUPS: StructureGroup[] = [
  { id: 'general', label: 'General' },
  { id: 'horror', label: 'Horror' },
];

/** Look up a structure OR room group by id (undefined if unknown). */
export function getStructureGroup(id: string): StructureGroup | undefined {
  return [...STRUCTURE_GROUPS, ...ROOM_GROUPS].find((g) => g.id === id);
}
