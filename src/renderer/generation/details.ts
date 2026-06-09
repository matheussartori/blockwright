// Pure state transitions over the Generate composer's `BuildDetails` (the model
// picks the user makes in the ⚙ Details section). These were inline `setDetails`
// callbacks in NewStructurePanel; extracted here so the rules — which fields a
// structure switch clears, how the per-floor room grid grows, the size clamp — are
// unit-tested and the component stays a thin view. No React, no IO.
//
// The `BuildDetails` model itself + the brief/selection/summary builders live in
// `brief.ts`; this module only mutates the model.
import { type BuildDetails, ROOMS_PER_FLOOR } from './brief';

/** The modern house structure + its paired decoration (auto-selected together): the
 *  modern villa is a white-and-glass archetype, so picking it defaults the look to Modern. */
const MODERN_STRUCTURE = 'modern';
const MODERN_DECORATION = 'modern';

/** The single-value Details selects driven by `setDetailField`. */
export type DetailField = 'structureType' | 'decoration' | 'roof' | 'basement';

/** A build size box, in cells. */
export interface SizeBox {
  w: number;
  d: number;
  h: number;
}

/** Min/max for any size axis (the composer's number inputs clamp to this). */
export const SIZE_MIN = 3;
export const SIZE_MAX = 64;

/** Set one of the single-value Details selects, applying the dependent-field rules:
 *  switching STRUCTURE drops the old type's params + size and clears roof/basement/rooms
 *  (the compatible set is structure-specific) — and pairs the Modern decoration with the
 *  modern house; choosing a BASEMENT re-derives the size (clears any manual override) so a
 *  cellar auto-grows the box.
 *  @param d - The current Details state.
 *  @param key - Which select changed.
 *  @param value - The new id ('' = none/auto).
 *  @returns The next Details state (a new object). */
export function setDetailField(d: BuildDetails, key: DetailField, value: string): BuildDetails {
  if (key === 'structureType') {
    // The modern house is a white-and-glass archetype — pair it with the Modern decoration
    // by default so its materials + guide come along (the user can still change it).
    const decoration = value === MODERN_STRUCTURE ? MODERN_DECORATION : '';
    return { ...d, structureType: value, decoration, params: {}, size: null, roof: '', basement: '', rooms: [] };
  }
  if (key === 'basement') {
    return { ...d, basement: value, size: null };
  }
  return { ...d, [key]: value };
}

/** Assign (or clear, with '') a room to one floor's slot, growing the per-floor
 *  rooms grid as needed and keeping every row at {@link ROOMS_PER_FLOOR} slots.
 *  @param d - The current Details state.
 *  @param floor - The 0-based floor index (bottom-up).
 *  @param slot - The room slot within the floor (0..ROOMS_PER_FLOOR-1).
 *  @param value - The room id to set, or '' to clear the slot.
 *  @returns The next Details state with a fresh `rooms` grid. */
export function assignRoom(d: BuildDetails, floor: number, slot: number, value: string): BuildDetails {
  const rooms = d.rooms.map((r) => [...r]);
  while (rooms.length <= floor) rooms.push([]);
  const row = rooms[floor];
  while (row.length < ROOMS_PER_FLOOR) row.push('');
  row[slot] = value;
  return { ...d, rooms };
}

/** Set a structure-type param value, clearing any manual size override so the box
 *  re-derives (e.g. picking "2 floors + basement" auto-grows it).
 *  @param d - The current Details state.
 *  @param name - The param name.
 *  @param value - The new value.
 *  @returns The next Details state. */
export function setDetailParam(d: BuildDetails, name: string, value: string | number): BuildDetails {
  return { ...d, params: { ...d.params, [name]: value }, size: null };
}

/** Set one axis of the explicit build size (switching the box from auto to manual),
 *  clamped to [{@link SIZE_MIN}, {@link SIZE_MAX}]. The first manual edit seeds the
 *  box from `base` (the currently-derived size) so the other axes keep their values.
 *  @param d - The current Details state.
 *  @param axis - Which dimension changed (`w`/`d`/`h`).
 *  @param value - The requested value (clamped).
 *  @param base - The currently-effective size, used to seed the box on first edit.
 *  @returns The next Details state with an explicit `size`. */
export function setDetailSize(d: BuildDetails, axis: keyof SizeBox, value: number, base: SizeBox): BuildDetails {
  const clamped = Math.max(SIZE_MIN, Math.min(SIZE_MAX, value));
  return { ...d, size: { ...(d.size ?? base), [axis]: clamped } };
}
