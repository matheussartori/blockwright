// Pure state transitions over the Generate composer's `BuildDetails` (the model
// picks the user makes in the ⚙ Details section). These were inline `setDetails`
// callbacks in NewStructurePanel; extracted here so the rules — which fields a
// structure switch clears, how the per-floor room grid grows, the size clamp — are
// unit-tested and the component stays a thin view. No React, no IO.
//
// The `BuildDetails` model itself + the brief/selection/summary builders live in
// `brief.ts`; this module only mutates the model.
import {
  type BuildDetails,
  DEFAULT_STOREY_H,
  EMPTY_SLOTS,
  MAX_STOREY_H,
  MIN_FLOOR_H,
  ROOMS_PER_FLOOR,
  defaultFloorHeights,
} from './brief';
import type { ModuleSlotKey } from '@/shared/domain/module-slots';
import type { GenerationModule } from '@/shared/types';

/** The single-value Details selects driven by `setDetailField`: the structure pill plus
 *  every single-select module slot (decoration/roof/basement/attic/surroundings). */
export type DetailField = 'structureType' | ModuleSlotKey;

/** The roof id that leaves no roof void, so it cannot host an attic (see the `flat` roof
 *  module's `incompatibleWith`). Picking it clears any attic selection. */
const FLAT_ROOF = 'flat';

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
 *  switching STRUCTURE drops the old type's params/size/heights and clears roof/basement/
 *  rooms (the compatible set is structure-specific) — and pairs the identity decoration
 *  the chosen module DECLARES (`pairedDecoration`, registry-driven — no type→decoration
 *  map here). Editing any OTHER slot now PRESERVES the user's explicit size — a
 *  basement/attic still auto-grows the box only while the size is on auto (it derives them
 *  in via `effectiveSize`), so the box never snaps back under the user's typed dimensions.
 *  @param d - The current Details state.
 *  @param key - Which select changed.
 *  @param value - The new id ('' = none/auto).
 *  @param struct - The newly-chosen structure module (catalog lookup of `value`), so a
 *    structure pick pairs the decoration its module declares. Only read for `structureType`.
 *  @returns The next Details state (a new object). */
export function setDetailField(
  d: BuildDetails,
  key: DetailField,
  value: string,
  struct?: GenerationModule,
): BuildDetails {
  if (key === 'structureType') {
    // Switching structure clears every slot (the compatible set is structure-specific) +
    // the params/size/heights/rooms. A structure with an identity look pairs the
    // decoration its module declares, so its materials + guide come along.
    const decoration = struct?.pairedDecoration ?? '';
    return {
      ...d,
      ...EMPTY_SLOTS,
      decoration,
      structureType: value,
      params: {},
      size: null,
      floorHeights: null,
      basementH: null,
      atticH: null,
      rooms: [],
    };
  }
  const next: BuildDetails = { ...d, [key]: value };
  // A flat roof leaves no roof void → it can't host an attic; clear any attic pick so the
  // two can't be selected together (mirrors the attic module's `incompatibleWith: ['flat']`).
  if (key === 'roof' && value === FLAT_ROOF) next.attic = '';
  // A cleared slot drops its custom band height (it described a band that no longer exists).
  if (!next.basement) next.basementH = null;
  if (!next.attic) next.atticH = null;
  return next;
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

/** Add a room module to a floor (the planner's add/remove model), capped at `max`
 *  rooms on that floor. Duplicates are allowed — two bedrooms is a valid floor. Grows
 *  the rooms grid to the floor as needed and normalises every row to its assigned ids
 *  (no padding); a no-op when the floor is already full or `id` is empty.
 *  @param d - The current Details state.
 *  @param floor - The 0-based floor index (bottom-up).
 *  @param id - The room module id to add.
 *  @param max - The floor's room cap (the structure's `maxRoomsPerFloor`).
 *  @returns The next Details state. */
export function addRoom(d: BuildDetails, floor: number, id: string, max: number): BuildDetails {
  if (!id) return d;
  const rooms = d.rooms.map((r) => r.filter(Boolean));
  while (rooms.length <= floor) rooms.push([]);
  if (rooms[floor].length >= max) return d;
  rooms[floor] = [...rooms[floor], id];
  return { ...d, rooms };
}

/** Remove the room at `index` on a floor (the planner's add/remove model).
 *  @param d - The current Details state.
 *  @param floor - The 0-based floor index (bottom-up).
 *  @param index - The position of the room to drop within that floor's list.
 *  @returns The next Details state. */
export function removeRoomAt(d: BuildDetails, floor: number, index: number): BuildDetails {
  const rooms = d.rooms.map((r) => r.filter(Boolean));
  if (!rooms[floor]) return d;
  rooms[floor] = rooms[floor].filter((_, i) => i !== index);
  return { ...d, rooms };
}

/** Set a structure-type param value, PRESERVING the user's explicit size (a param change
 *  no longer snaps the box back to auto — the bug where typing floors wiped the dimensions).
 *  When the FLOORS count changes and per-floor heights are active, the heights array is
 *  resized to match (new floors copy the top storey's height; removed floors drop off) so
 *  the total height grows/shrinks with the floor count, like a linked stack.
 *  @param d - The current Details state.
 *  @param name - The param name.
 *  @param value - The new value.
 *  @returns The next Details state. */
export function setDetailParam(d: BuildDetails, name: string, value: string | number): BuildDetails {
  const params = { ...d.params, [name]: value };
  let floorHeights = d.floorHeights;
  if (name === 'floors' && floorHeights) {
    const n = Math.max(1, Math.trunc(Number(value)) || 1);
    floorHeights = resizeHeights(floorHeights, n);
  }
  return { ...d, params, floorHeights };
}

/** Grow/shrink a per-floor height array to `n` entries: extra floors copy the last
 *  storey's height (or the default), removed floors drop off the top. */
function resizeHeights(heights: number[], n: number): number[] {
  if (n === heights.length) return heights;
  if (n < heights.length) return heights.slice(0, n);
  const fill = heights[heights.length - 1] ?? DEFAULT_STOREY_H;
  return [...heights, ...Array.from({ length: n - heights.length }, () => fill)];
}

/** Switch the build's height control between "total" (a single H field driving every storey
 *  equally) and "per floor" (one height per above-ground storey, optionally linked). Entering
 *  per-floor mode seeds each storey from the current effective height so the build doesn't
 *  jump; leaving it clears the per-floor heights (the total H takes back over).
 *  @param d - The current Details state.
 *  @param mode - 'total' or 'floors'.
 *  @param struct - The chosen structure module (seeds the per-floor heights).
 *  @returns The next Details state. */
export function setHeightMode(d: BuildDetails, mode: 'total' | 'floors', struct: GenerationModule | undefined): BuildDetails {
  if (mode === 'total') return { ...d, floorHeights: null, basementH: null, atticH: null };
  if (d.floorHeights && d.floorHeights.length) return d; // already per-floor
  return { ...d, floorHeights: defaultFloorHeights(d, struct) };
}

/** Set one floor's interior height (clamped to [{@link MIN_FLOOR_H}, {@link MAX_STOREY_H}] —
 *  every floor is at least 5 blocks). When `linked`, every floor moves to the same value
 *  (the chain/link affordance — raise the ground floor and the whole stack follows);
 *  otherwise only `index` changes.
 *  @param d - The current Details state (a no-op unless per-floor heights are active).
 *  @param index - The 0-based floor to edit (bottom-up).
 *  @param value - The requested height (clamped).
 *  @param linked - Move every floor together when true.
 *  @returns The next Details state. */
export function setFloorHeight(d: BuildDetails, index: number, value: number, linked: boolean): BuildDetails {
  if (!d.floorHeights) return d;
  const v = Math.max(MIN_FLOOR_H, Math.min(MAX_STOREY_H, Math.trunc(value) || MIN_FLOOR_H));
  const floorHeights = linked
    ? d.floorHeights.map(() => v)
    : d.floorHeights.map((h, i) => (i === index ? v : h));
  return { ...d, floorHeights };
}

/** The non-floor bands of the Height panel whose height the user can size directly. */
export type BandKey = 'basement' | 'attic';

/** Set the picked basement/attic band's height (clamped to [{@link MIN_FLOOR_H},
 *  {@link MAX_STOREY_H}] — the attic/basement is a level too, so the 5-block floor rule
 *  applies). A no-op when that slot isn't picked.
 *  @param d - The current Details state.
 *  @param band - Which band to size.
 *  @param value - The requested height (clamped).
 *  @returns The next Details state. */
export function setBandHeight(d: BuildDetails, band: BandKey, value: number): BuildDetails {
  if (!d[band]) return d;
  const v = Math.max(MIN_FLOOR_H, Math.min(MAX_STOREY_H, Math.trunc(value) || MIN_FLOOR_H));
  return band === 'basement' ? { ...d, basementH: v } : { ...d, atticH: v };
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
