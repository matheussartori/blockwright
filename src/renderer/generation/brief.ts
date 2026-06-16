// Pure helpers behind the Generate composer's "Details" section: they turn the
// user's module picks (BuildDetails) into the three things generation needs — the
// plain-language `[Build details]` brief appended to the model prompt, the structured
// `BuildSelection` that drives knowledge-guide loading, and the display-ready
// `BuildBrief` card shown in the chat. Extracted from NewStructurePanel so they're
// unit-testable in isolation and the component stays a thin view. No React, no IO.
import type { BuildBrief, BuildSelection, GenerationCatalog, GenerationModule } from '@/shared/types';
import { presetForScale, scaleForArea } from '@/shared/domain/furnishing';
import { moduleAppliesTo } from '@/shared/domain/applies-to';
import { MODULE_SLOTS, type ModuleSlotKey } from '@/shared/domain/module-slots';
import {
  ATTIC_OVERHEAD,
  DEFAULT_BASEMENT_H,
  DEFAULT_STOREY_H,
  MAX_BASEMENT_LEVELS,
  MAX_STOREY_H,
  MIN_FLOOR_H,
  basementCeilingLayer,
  basementDepth,
  heightOverhead,
} from '@/shared/domain/storeys';
import {
  type SurroundSizing,
  expandSizeForSurroundings,
  resolveSurroundMargins,
} from '@/shared/domain/surroundings';

/** Max interior rooms a single floor can be assigned in the composer. */
export const ROOMS_PER_FLOOR = 2;

/** The build modules the user picked for a fresh build: a structure type, one id per
 *  single-select module SLOT (decoration/roof/basement/attic/surroundings — the per-slot
 *  fields DERIVE from {@link ModuleSlotKey}, so a new category needs no edit here), the
 *  structure's tunable params, an optional size override, and the per-floor rooms. They
 *  describe WHAT to build as plain-language guidance AND ride along as a structured
 *  selection so the system prompt loads only those modules' guides. They never emit a
 *  `template` op — the model designs the build itself (no stamped initial shell). */
export type BuildDetails = Record<ModuleSlotKey, string> & {
  structureType: string;
  /** Structure-type param values, keyed by param name. Missing keys fall back to
   *  the param's default when the brief is built. */
  params: Record<string, string | number>;
  /** Explicit build size [W, D, H]. `null` = use the size derived from the params
   *  (so picking floors/basement/attic auto-sizes the box); set when the user edits.
   *  Editing a param/slot now PRESERVES this (it no longer snaps back to auto). */
  size: { w: number; d: number; h: number } | null;
  /** Per-floor interior storey heights (index = above-ground floor, bottom-up), or `null`
   *  for "total height" mode (the single H field drives every storey equally). When set,
   *  the total build height is DERIVED from these + the roof/basement overhead, so the
   *  user can make a tall ground floor over a low upper one. Length tracks the `floors`
   *  param (see `setDetailParam`). */
  floorHeights: number[] | null;
  /** Per-LEVEL basement heights (cells, top-down: index 0 is the level directly beneath
   *  the ground floor), or `null` for the default (a single {@link DEFAULT_BASEMENT_H}
   *  level). The array length is the level count (1..{@link MAX_BASEMENT_LEVELS}). Only
   *  meaningful while a basement is picked. */
  basementHeights: number[] | null;
  /** The basement FOOTPRINT [w, d] in cells, or `null` to match the house footprint. When
   *  larger than the house the compiled box grows in X/Z (the basement is excavated beyond
   *  the house walls). Only meaningful while a basement is picked. */
  basementArea: { w: number; d: number } | null;
  /** Height of the picked ATTIC band (cells) — the attic is always the TOPMOST level and
   *  its band ENGULFS the roof zone (attic headroom + roof reserve, nothing above it).
   *  `null` = the default (roof reserve + {@link ATTIC_OVERHEAD}). */
  atticH: number | null;
  /** The user's explicit per-side surroundings ring margins in cells (the manual yard-size
   *  control: `side` = X each side, `front`/`back` = Z). `null` = the auto, footprint-scaled
   *  ring. Only meaningful while a surroundings module is picked. */
  surroundSizing: SurroundSizing | null;
  /** Interior room modules assigned per floor (index = floor, 0-based, bottom-up). Each
   *  floor holds up to 2 room ids; '' marks an empty slot. Only meaningful for a storeyed
   *  structure (one with a `floors` param). */
  rooms: string[][];
};

/** Every module slot, unset ('') — the reset applied on a structure switch too. */
export const EMPTY_SLOTS = Object.fromEntries(MODULE_SLOTS.map((s) => [s.key, ''])) as Record<ModuleSlotKey, string>;

/** The empty Details state — nothing picked yet. */
export const EMPTY_DETAILS: BuildDetails = {
  structureType: '',
  ...EMPTY_SLOTS,
  params: {},
  size: null,
  floorHeights: null,
  basementHeights: null,
  basementArea: null,
  atticH: null,
  surroundSizing: null,
  rooms: [],
};

// Storey-height bounds + the neutral default come from the shared storey ladder
// (`shared/domain/storeys.ts`) — the SAME constants the structure types build with —
// re-exported so the composer controls keep importing them from here. MIN_FLOOR_H is
// the every-floor-≥5-blocks rule.
export { DEFAULT_STOREY_H, MAX_STOREY_H, MIN_FLOOR_H, MAX_BASEMENT_LEVELS, DEFAULT_BASEMENT_H };

/** "m:ss" from a millisecond duration.
 *  @param ms - Elapsed time in milliseconds.
 *  @returns The duration formatted as minutes:zero-padded-seconds (e.g. "2:05"). */
export function formatElapsed(ms: number): string {
  const total = Math.floor(ms / 1000);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

/** The number of above-ground storeys the chosen structure + params describe (the
 *  `floors` int param), or 0 when the structure has no such param — i.e.
 *  whether the per-floor room editor applies.
 *  @param struct - The chosen structure module (or undefined if none picked).
 *  @param params - The current param values keyed by param name.
 *  @returns The storey count (≥ 0); 0 when the structure has no `floors` param. */
export function floorCount(
  struct: GenerationModule | undefined,
  params: Record<string, string | number>,
): number {
  const p = (struct?.params ?? []).find((x) => x.name === 'floors');
  if (!p) return 0;
  return Math.max(0, Number(params.floors ?? p.default));
}

/** The room ids assigned to a given floor.
 *  @param d - The current Details state.
 *  @param i - The 0-based floor index (bottom-up).
 *  @returns A fixed-length array of {@link ROOMS_PER_FLOOR} room ids, padded with ''. */
export function floorRooms(d: BuildDetails, i: number): string[] {
  const row = d.rooms[i] ?? [];
  return Array.from({ length: ROOMS_PER_FLOOR }, (_, s) => row[s] ?? '');
}

/** The room ids actually assigned to a floor (variable-length, '' stripped) — the
 *  planner's add/remove model. Unlike {@link floorRooms} (fixed 2 slots) this is
 *  uncapped on read; the per-floor cap is enforced when adding (see `addRoom`).
 *  @param d - The current Details state.
 *  @param i - The 0-based floor index (bottom-up).
 *  @returns The floor's assigned room ids, in order. */
export function roomsOnFloor(d: BuildDetails, i: number): string[] {
  return (d.rooms[i] ?? []).filter(Boolean);
}

/** The max interior rooms a single floor of the chosen structure accepts: the
 *  structure's declared `maxRoomsPerFloor`, else the generic default. Drives the
 *  planner's per-floor cap so a roomier house allows more than a tight cabin.
 *  @param struct - The chosen structure module (or undefined).
 *  @returns The per-floor room cap (≥ 1). */
export function maxRoomsForStructure(struct: GenerationModule | undefined): number {
  return Math.max(1, struct?.maxRoomsPerFloor ?? ROOMS_PER_FLOOR);
}

/** The full param set for the chosen structure: the user's picks merged over each
 *  param's default — so the brief always names every structural param explicitly,
 *  never leaving floors/basement/attic to the model to infer.
 *  @param d - The current Details state (its `params` override the defaults).
 *  @param struct - The chosen structure module (or undefined → empty result).
 *  @returns Every declared param, with the user's value or the param default. */
export function resolveDetailParams(
  d: BuildDetails,
  struct: GenerationModule | undefined,
): Record<string, string | number> {
  const out: Record<string, string | number> = {};
  for (const p of struct?.params ?? []) out[p.name] = d.params[p.name] ?? p.default;
  return out;
}

/** A sensible default build size for the chosen structure + params, so the box is
 *  never too small for the levels asked for (the old "suffocatingly small" failure).
 *  A storeyed structure (one with a `floors` param) sizes its height to fit the
 *  basement + floors + roof; others get a tall-ish default. The user can override.
 *  @param struct - The chosen structure module (or undefined).
 *  @param params - The resolved param values (floors/basement/attic drive the height).
 *  @returns The derived build box as `{ w, d, h }`. */
export function derivedSize(
  struct: GenerationModule | undefined,
  params: Record<string, string | number>,
): { w: number; d: number; h: number } {
  const hasFloors = (struct?.params ?? []).some((p) => p.name === 'floors');
  const w = 11, d = 11;
  if (!hasFloors) return { w: 9, d: 9, h: 16 }; // a non-storeyed structure
  const floors = Number(params.floors ?? 1);
  const h = floors * DEFAULT_STOREY_H + overhead(params, w, d);
  return { w, d, h };
}

/** The resolved structure params with the basement/attic/roof SLOTS folded in (they're
 *  their own selects now, not house params, but still drive the derived height — the roof
 *  pick decides whether the box pays a pitch reserve or just a flat deck). */
function paramsWithSlots(d: BuildDetails, struct: GenerationModule | undefined): Record<string, string | number> {
  const out = resolveDetailParams(d, struct);
  return { ...out, basement: d.basement || 'none', attic: d.attic || 'none', roof: d.roof || out.roof || '' };
}

/** The shared roof-aware {@link heightOverhead}, fed from the slot-folded params — the
 *  SAME function the structure types' total budget agrees with, so a flat-roofed build
 *  no longer pays a phantom pitch reserve. */
function overhead(params: Record<string, string | number>, w: number, d: number): number {
  return heightOverhead({
    w,
    d,
    roof: typeof params.roof === 'string' ? params.roof : undefined,
    basement: !!params.basement && params.basement !== 'none',
    attic: !!params.attic && params.attic !== 'none',
  });
}

/** Just the roof reserve of the overhead (no basement/attic) — what an attic band's
 *  default swallows. */
function roofReserve(params: Record<string, string | number>, w: number, d: number): number {
  return heightOverhead({ w, d, roof: typeof params.roof === 'string' ? params.roof : undefined });
}

/** The non-storey vertical BANDS of the box: the picked basement at the bottom (the
 *  sum of its per-level heights, see {@link basementHeightsOf}), and the TOP band — when an attic
 *  is picked it is always the topmost level and ENGULFS the whole roof zone (custom
 *  height or roof reserve + {@link ATTIC_OVERHEAD}; `roof` is then 0, nothing sits above
 *  it), otherwise the roof reserve alone. */
function bandHeights(
  d: BuildDetails,
  params: Record<string, string | number>,
  w: number,
  dd: number,
): { basement: number; attic: number; roof: number } {
  const roof = roofReserve(params, w, dd);
  // The vault depth + a dedicated ceiling layer when the basement footprint exceeds the house
  // (the SAME +1 compose.ts reserves, so the promised box height matches the laid shell).
  const basement = d.basement ? basementDepth(basementHeightsOf(d)) + basementCeilingLayer(d.basementArea, w, dd) : 0;
  const attic = d.attic ? (d.atticH ?? roof + ATTIC_OVERHEAD) : 0;
  return { basement, attic, roof: d.attic ? 0 : roof };
}

/** The picked basement's per-LEVEL heights (top-down), defaulting to a single
 *  {@link DEFAULT_BASEMENT_H} level when the user hasn't sized them. Empty when no
 *  basement is picked.
 *  @param d - The current Details state.
 *  @returns One height per below-grade level (length = the level count), or []. */
export function basementHeightsOf(d: BuildDetails): number[] {
  if (!d.basement) return [];
  return d.basementHeights ?? [DEFAULT_BASEMENT_H];
}

/** The picked basement's FOOTPRINT [w, d], defaulting to the house footprint (the
 *  effective W×D) when the user hasn't enlarged it. Null when no basement is picked.
 *  @param d - The current Details state.
 *  @param struct - The chosen structure module (drives the default house footprint).
 *  @returns The basement footprint `{ w, d }`, or null. */
export function basementAreaOf(
  d: BuildDetails,
  struct: GenerationModule | undefined,
): { w: number; d: number } | null {
  if (!d.basement) return null;
  if (d.basementArea) return d.basementArea;
  const sz = effectiveSize(d, struct);
  return { w: sz.w, d: sz.d };
}

/** A fresh default basement: one level at the neutral per-level depth. */
export function defaultBasementHeights(): number[] {
  return [DEFAULT_BASEMENT_H];
}

/** The total build height implied by explicit per-floor storey heights: their sum plus
 *  the basement/attic-or-roof bands (honouring the user's custom band heights).
 *  The inverse of "split a total H across N equal storeys".
 *  @param d - The current Details state (custom `basementH`/`atticH` ride in from here).
 *  @param floorHeights - The interior storey heights, bottom-up.
 *  @param params - The resolved slot-folded params (roof pick drives the reserve).
 *  @param w - Build width (roof reserve scales with the footprint).
 *  @param dd - Build depth.
 *  @returns The total box height. */
export function totalHeightFromFloors(
  d: BuildDetails,
  floorHeights: number[],
  params: Record<string, string | number>,
  w: number,
  dd: number,
): number {
  const sum = floorHeights.reduce((a, b) => a + b, 0);
  const bands = bandHeights(d, params, w, dd);
  return sum + bands.basement + bands.attic + bands.roof;
}

/** Seed the per-floor height editor: a uniform storey height for every above-ground floor,
 *  back-derived from the currently-effective total so switching into per-floor mode keeps
 *  the same overall height. Clamped to [{@link MIN_FLOOR_H}, {@link MAX_STOREY_H}].
 *  @param d - The current Details state.
 *  @param struct - The chosen structure module.
 *  @returns One height per floor (all equal), length = the resolved floor count (≥ 1). */
export function defaultFloorHeights(d: BuildDetails, struct: GenerationModule | undefined): number[] {
  const params = paramsWithSlots(d, struct);
  const n = Math.max(1, floorCount(struct, params));
  const base = d.size ?? derivedSize(struct, params);
  const storeys = base.h - overhead(params, base.w, base.d);
  const each = Math.round(storeys / n) || DEFAULT_STOREY_H;
  const clamped = Math.max(MIN_FLOOR_H, Math.min(MAX_STOREY_H, each));
  return Array.from({ length: n }, () => clamped);
}

/** The non-storey vertical SEGMENTS of the effective box, for the planner's 3D preview
 *  and the Height panel's basement/attic rows: the selected basement band at the bottom,
 *  and the TOP band — a picked attic is always the topmost level, engulfing the roof
 *  zone (`roof` is then 0); without one the roof reserve caps the box. Honours the
 *  user's custom per-level basement heights / `atticH`. `basementLevels` carries the
 *  per-level depths (top-down) so the 3D preview can draw one band per level.
 *  @param d - The current Details state.
 *  @param struct - The chosen structure module.
 *  @returns Heights in cells; zeros/[] for the slots that aren't picked. */
export function previewOverheads(
  d: BuildDetails,
  struct: GenerationModule | undefined,
): { basement: number; basementLevels: number[]; attic: number; roof: number } {
  const params = paramsWithSlots(d, struct);
  const sz = effectiveSize(d, struct);
  return { ...bandHeights(d, params, sz.w, sz.d), basementLevels: basementHeightsOf(d) };
}

/** The effective size: the user's override, else the derived default. The selected
 *  basement module (now its own select, not a house param) is folded back in so a
 *  basement still auto-grows the box. When per-floor heights are set, the total height is
 *  computed from them (W/D still come from the explicit/derived box).
 *  @param d - The current Details state (an explicit `size` wins).
 *  @param struct - The chosen structure module (drives the derived fallback).
 *  @returns The build box `{ w, d, h }` to use. */
export function effectiveSize(
  d: BuildDetails,
  struct: GenerationModule | undefined,
): { w: number; d: number; h: number } {
  const params = paramsWithSlots(d, struct);
  const base = d.size ?? derivedSize(struct, params);
  if (d.floorHeights && d.floorHeights.length) {
    return { w: base.w, d: base.d, h: totalHeightFromFloors(d, d.floorHeights, params, base.w, base.d) };
  }
  return base;
}

/** The compiled BUILD BOX for the picked details: the {@link effectiveSize} building
 *  SHELL expanded by the selected surroundings ring's margins (identity when none is
 *  picked) AND grown to fit the basement footprint when the user enlarged it beyond the
 *  house (the basement is excavated underground past the house walls; the house stays
 *  centered over it). The composer's size fields keep SHELL semantics — the user's W×D
 *  is the house — so the expansion happens only where the box is consumed: the structured
 *  selection (the shell seed compiles at this size) and the brief/card.
 *  @param d - The current Details state.
 *  @param struct - The chosen structure module.
 *  @returns The compiled box `{ w, d, h }` (≥ the shell + ring + basement on every axis). */
export function buildBoxSize(
  d: BuildDetails,
  struct: GenerationModule | undefined,
): { w: number; d: number; h: number } {
  const sz = effectiveSize(d, struct);
  const grown = expandSizeForSurroundings(sz.w, sz.d, d.surroundings, d.surroundSizing);
  const basement = basementAreaOf(d, struct);
  const w = Math.max(grown.w, basement?.w ?? 0);
  const dd = Math.max(grown.d, basement?.d ?? 0);
  return { w, d: dd, h: sz.h };
}

/** The surroundings RING margins (per side) the picked yard adds around the building
 *  shell, honouring the user's per-axis size scale — for the 3D preview's ground-level
 *  ring and the yard-size readout. `null` when no surroundings module is picked.
 *  @param d - The current Details state.
 *  @param struct - The chosen structure module (drives the shell size the ring scales with).
 *  @returns The ring's `{ side, front, back }` cell margins, or null. */
export function surroundRing(
  d: BuildDetails,
  struct: GenerationModule | undefined,
): { side: number; front: number; back: number } | null {
  if (!d.surroundings || d.surroundings === 'none') return null;
  const sz = effectiveSize(d, struct);
  return resolveSurroundMargins(d.surroundings, sz.w, sz.d, d.surroundSizing);
}

/** The interior floor area (cells) one room gets on a storey: the build's interior
 *  footprint (W−2)×(D−2), split between the rooms that share the floor. This is what
 *  tiers the furnishing density (`scaleForArea`), so a big floor reads "grand" and a
 *  small one "snug".
 *  @param size - The build box `{ w, d, h }`.
 *  @param roomsOnFloor - How many rooms share this storey (≥ 1).
 *  @returns The interior area in cells available to each room. */
export function roomArea(size: { w: number; d: number; h: number }, roomsOnFloor: number): number {
  const interior = Math.max(1, size.w - 2) * Math.max(1, size.d - 2);
  return Math.round(interior / Math.max(1, roomsOnFloor));
}

/** Small string→seed hash + a tiny seeded PRNG, so the auto room assignment is STABLE for a
 *  given structure/decoration/size (re-rendering the same build picks the same rooms) without
 *  pulling in the main-process rng (this is renderer-pure). */
function hashSeed(str: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}
function seededRng(seed: number): () => number {
  let a = seed >>> 0;
  return () => { a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

/** Decorations whose mood is dark/occult — an unspecified floor of such a build should be
 *  programmed from the HORROR room family (ritual/dungeon/morgue/seance), not the everyday set. */
const DARK_DECORATIONS = new Set(['haunted', 'cursed', 'gothic']);
const DARK_STRUCTURES = new Set(['gothic', 'haunted-tower']);

/**
 * The per-floor rooms used to PROGRAM the build. When the user assigned rooms by hand they win
 * (verbatim). When they DIDN'T — the common "I just picked a structure + decoration" case that
 * left giant floors empty — rooms are AUTO-ASSIGNED from the structure + decoration: appropriate
 * to the structure (`appliesTo`), in the right MOOD family (horror for dark looks, else general),
 * seeded for stable variety, and DOUBLED on a "grand" floor (so a huge storey gets two programs
 * → twice the furnishing). This is what stops an unspecified big floor coming out bare; the
 * specified case already had the space×preset treatment.
 *
 * @returns The per-floor room-id rows + whether they were auto-assigned (so the brief can say so).
 */
function effectiveRoomRows(
  d: BuildDetails, s: GenerationModule | undefined, catalog: GenerationCatalog | null, n: number,
): { rows: string[][]; auto: boolean } {
  const userRows = Array.from({ length: n }, (_, i) => roomsOnFloor(d, i));
  if (userRows.some((r) => r.length)) return { rows: userRows, auto: false };
  if (!s || !catalog) return { rows: userRows, auto: false };
  // Rooms that fit this structure (via appliesTo + its group), preferring the mood family.
  const fits = catalog.room.filter((r) => moduleAppliesTo(r.appliesTo, s.id, s.group));
  if (!fits.length) return { rows: userRows, auto: false };
  const horror = DARK_DECORATIONS.has(d.decoration ?? '') || DARK_STRUCTURES.has(s.id);
  const moodPool = fits.filter((r) => r.group === (horror ? 'horror' : 'general'));
  const pool = (moodPool.length ? moodPool : fits).map((r) => r.id);
  // Seeded shuffle so the same build is stable but different builds vary.
  const size = effectiveSize(d, s);
  const rng = seededRng(hashSeed(`${s.id}|${d.decoration ?? ''}|${size.w}x${size.d}x${size.h}|${n}`));
  const order = [...pool];
  for (let i = order.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [order[i], order[j]] = [order[j], order[i]]; }
  const maxPer = maxRoomsForStructure(s);
  const grandFloor = scaleForArea(roomArea(size, 1)).scale === 'grand'; // a one-room floor already huge
  const rows: string[][] = [];
  let cursor = 0;
  for (let i = 0; i < n; i++) {
    const count = grandFloor && maxPer >= 2 && order.length >= 2 ? 2 : 1;
    const row: string[] = [];
    for (let c = 0; c < count; c++) { row.push(order[cursor % order.length]); cursor++; }
    rows.push([...new Set(row)]); // distinct within a floor
  }
  return { rows, auto: true };
}

/** The per-floor interior program, in plain language for the model: one line per floor
 *  that has rooms assigned (bottom-up), naming each room AND — the SPACE × DECORATION
 *  organism — its computed space tier and the matching furnishing PRESET (a decoration-
 *  agnostic base layout the chosen decoration re-skins). This is what stops a big floor
 *  coming out empty: the area is computed from the build size, a tier is picked, and the
 *  preset's furniture zones are spelled out so the model furnishes to the room, not below
 *  it. When the user assigned NO rooms, they're auto-assigned from the structure +
 *  decoration (see {@link effectiveRoomRows}) so an unspecified build still gets programmed
 *  floors. '' if the structure isn't storeyed.
 *  @param d - The current Details state.
 *  @param catalog - The module catalog (for room id → label/presets), or null.
 *  @returns A "Room plan" brief fragment, or '' when there are no per-floor rooms. */
export function buildRoomPlan(d: BuildDetails, catalog: GenerationCatalog | null): string {
  const s = catalog?.structure.find((m) => m.id === d.structureType);
  const n = floorCount(s, resolveDetailParams(d, s));
  if (!n) return '';
  const size = effectiveSize(d, s);
  const deco = d.decoration ? catalog?.decoration.find((m) => m.id === d.decoration) : undefined;
  const roomOf = (id: string) => catalog?.room.find((m) => m.id === id);
  const { rows, auto } = effectiveRoomRows(d, s, catalog, n);
  const lines: string[] = [];
  for (let i = 0; i < n; i++) {
    const ids = rows[i] ?? [];
    if (!ids.length) continue;
    const area = roomArea(size, ids.length);
    const tier = scaleForArea(area);
    for (const id of ids) {
      const room = roomOf(id);
      const label = room?.label ?? id;
      const preset = presetForScale(room?.presets, tier.scale);
      const head = `  - Floor ${i + 1} · ${label} — ${tier.label.toLowerCase()} space (~${area} cells): ${tier.density}`;
      if (!preset) {
        lines.push(head);
        continue;
      }
      const items = preset.furnishings.map((f) => `      · ${f}`).join('\n');
      lines.push(`${head}\n    Base it on the "${preset.label}" preset — ${preset.summary}\n${items}`);
    }
  }
  if (!lines.length) return '';
  const skin = deco
    ? `The presets are a BASE layout only — re-skin every piece in the "${deco.label}" decoration's materials and mood. `
    : `The presets are a BASE layout only — re-skin every piece in the chosen decoration's materials and mood. `;
  // When the user named no rooms, the plan was inferred from the structure + decoration — tell
  // the model it's a SUGGESTED program it should commit to (and may vary the look of), so an
  // unspecified build still comes back with fully furnished floors rather than empty halls.
  const intro = auto
    ? `- Room plan (auto-assigned — the user named no rooms, so these are inferred from the ` +
      `structure + decoration; treat them as the intended program and fully furnish each floor). `
    : `- Room plan — furnish each floor to its SPACE (see each room's module guide). `;
  return (
    `${intro}` +
    `Up to two rooms share a floor; partition the storey so each is a real, separated space. ` +
    `${skin}Match the furnishing density to the space — never leave a large room half-empty, and never cram a small one:\n` +
    `${lines.join('\n')}\n`
  );
}

/** Build the structured-hints block appended to the prompt, or '' if no structure
 *  module was chosen. The structure picker is OPTIONAL guidance: it tells the model
 *  WHAT to build (type, decoration, size, per-type params) in plain language and asks
 *  it to design the build ITSELF from scratch with its own ops. It deliberately does
 *  NOT emit a `template` op — no stamped initial shell (that made every house look the
 *  same); the per-type params (floors/basement/attic/…) ride along only as intent.
 *  @param d - The current Details state.
 *  @param catalog - The module catalog (for id → label/params lookups), or null.
 *  @returns The "[Build details]" prompt fragment, or '' when no structure was picked. */
export function buildBrief(d: BuildDetails, catalog: GenerationCatalog | null): string {
  if (!d.structureType) return '';
  const s = catalog?.structure.find((m) => m.id === d.structureType);
  const deco = d.decoration ? catalog?.decoration.find((m) => m.id === d.decoration) : undefined;
  const sz = effectiveSize(d, s);
  const bx = buildBoxSize(d, s);
  const label = s?.label ?? d.structureType;
  const decoClause = deco ? ` with the "${deco.label}" decoration (its materials and mood)` : '';
  // With a surroundings ring, the user's dimensions are the BUILDING SHELL — the
  // compiled box is larger, and the outer margin belongs to the yard, not the house.
  const sizeClause = bx.w !== sz.w || bx.d !== sz.d
    ? `with a building shell of roughly ${sz.w}×${sz.h}×${sz.d} (W×H×D) inside a ${bx.w}×${bx.h}×${bx.d} box — ` +
      `the outer margin is the surroundings ring, NOT more house`
    : `roughly ${sz.w}×${sz.h}×${sz.d} (W×H×D)`;
  // Plain-language characteristics from the per-type params (floors/attic/…),
  // skipping internal-only knobs the user never sets as design intent.
  const traits = Object.entries(resolveDetailParams(d, s))
    .filter(([k]) => k !== 'seed' && k !== 'decay')
    .map(([k, v]) => `${k}: ${v}`)
    .join(', ');
  // One bullet per picked slot that carries a brief line (decoration is folded into the
  // structure sentence above, so it has no `brief`). Loops MODULE_SLOTS → a new category's
  // bullet shows up for free once it declares one.
  const slotLines = MODULE_SLOTS
    .filter((slot) => slot.brief && d[slot.key])
    .map((slot) => slot.brief!(catalog?.[slot.key].find((m) => m.id === d[slot.key])?.label ?? d[slot.key]))
    .join('');
  // Explicit per-floor storey heights, whenever the user set them (equal heights count
  // too — they're still an explicit pick, not the auto split). Directive, with the
  // absolute floor-slab Y of each storey so the model has exact planes, not just deltas.
  let heightLine = '';
  if (d.floorHeights && d.floorHeights.length) {
    let slabY = 0;
    const lines = d.floorHeights.map((h, i) => {
      const at = slabY;
      slabY += h;
      return `floor ${i + 1} = ${h} blocks (slab at y=${at})`;
    });
    heightLine =
      `- Storey heights (slab-to-slab, bottom-up, y relative to the ground floor): ${lines.join(', ')}. ` +
      `Each storey's floor slab MUST sit at its stated level — respect these heights exactly.\n`;
    // The basement/attic bands the user sized in the same panel (the attic band is the
    // TOPMOST level — it owns the whole attic + roof zone, nothing sits above it).
    const bands = previewOverheads(d, s);
    if (bands.basement) {
      const levels = bands.basementLevels;
      const levelClause =
        levels.length > 1
          ? `${levels.length} stacked below-grade levels (top-down: ${levels
              .map((h, i) => `B${i + 1} = ${h} blocks`)
              .join(', ')}; ${bands.basement} blocks deep total)`
          : `${bands.basement} blocks deep`;
      const area = basementAreaOf(d, s);
      const footprintClause =
        area && (area.w > sz.w || area.d > sz.d)
          ? ` Its footprint is ${area.w}×${area.d} (W×D) — LARGER than the house above; ` +
            `excavate it beyond the house walls and keep the house centered over it.`
          : '';
      heightLine +=
        `- Basement: ${levelClause}, below the ground floor, linked to it by a ladder/stair.${footprintClause}\n`;
    }
    if (bands.attic) {
      heightLine +=
        `- Attic: the TOPMOST level — ${bands.attic} blocks covering the whole attic + roof zone ` +
        `above the top floor (nothing sits above it).\n`;
    }
  }
  return (
    `\n\n[Build details — guidance the user picked, NOT a fixed mold. Design and build this structure YOURSELF, from scratch, with your own ops. Do NOT use a \`template\` op or any stamped preset shell.]\n` +
    `- Build a ${label}${decoClause}, ${sizeClause}.\n` +
    (traits ? `- Desired characteristics: ${traits}.\n` : '') +
    heightLine +
    slotLines +
    buildRoomPlan(d, catalog) +
    `- Make it distinctive: design the footprint, massing, roofline and openings to fit the user's description above — every build should read as its own structure, never a generic stamped shell.`
  );
}

/** A display-ready card summary of the picked details, shown in the chat in place of the
 *  raw brief text. Uses human labels so the card renders with no catalog lookup.
 *  @param d - The current Details state.
 *  @param catalog - The module catalog (for id → label lookups), or null.
 *  @returns A {@link BuildBrief} card, or undefined when no structure was picked. */
export function buildSummary(d: BuildDetails, catalog: GenerationCatalog | null): BuildBrief | undefined {
  if (!d.structureType) return undefined;
  const s = catalog?.structure.find((m) => m.id === d.structureType);
  const lbl = (cat: keyof GenerationCatalog, id: string) =>
    catalog?.[cat].find((m) => m.id === id)?.label ?? id;
  const sz = buildBoxSize(d, s); // the card shows the compiled box (what actually gets built)
  const n = floorCount(s, resolveDetailParams(d, s));
  // The structure family label (House / Tower …), so the card disambiguates same-named
  // types across groups — the catalog's group labels are already localized at the IPC edge.
  const group = s?.group ? catalog?.groups?.find((g) => g.id === s.group)?.label : undefined;
  const heights = d.floorHeights;
  const floors = Array.from({ length: n }, (_, i) => ({
    name: `Floor ${i + 1}`,
    height: heights?.[i],
    rooms: roomsOnFloor(d, i).map((id) => lbl('room', id)),
  }));
  // One label per picked slot (decoration/roof/basement/attic/surroundings) — generic over
  // MODULE_SLOTS so a new category's chip appears on the card automatically. The basement
  // chip also notes its level count when dug more than one deep.
  const slotLabels: Partial<Record<ModuleSlotKey, string>> = {};
  for (const slot of MODULE_SLOTS) if (d[slot.key]) slotLabels[slot.key] = lbl(slot.key, d[slot.key]);
  const levels = basementHeightsOf(d).length;
  if (slotLabels.basement && levels > 1) slotLabels.basement += ` · ${levels} levels`;
  return {
    structure: s?.label ?? d.structureType,
    group,
    ...slotLabels,
    size: [sz.w, sz.h, sz.d],
    floors: floors.length ? floors : undefined,
  };
}

/** The structured selection sent alongside the prompt (drives knowledge loading: one
 *  guide per selected module, so an unused roof/basement guide is never sent; plus the
 *  build size, so a shell-seeded structure compiles its starting shell at the right size).
 *  @param d - The current Details state.
 *  @param catalog - The module catalog (to resolve the effective size), or null.
 *  @returns A {@link BuildSelection} with only the fields the user actually picked. */
export function buildSelection(d: BuildDetails, catalog: GenerationCatalog | null): BuildSelection {
  const s = d.structureType ? catalog?.structure.find((m) => m.id === d.structureType) : undefined;
  // The room ids that drive knowledge-guide loading: the user's picks (all floors), else the
  // AUTO-assigned program (so an unspecified build still loads the relevant room guides —
  // matching what buildRoomPlan folds into the prompt).
  const userRooms = [...new Set(d.rooms.flat().filter(Boolean))];
  const rooms = userRooms.length
    ? userRooms
    : [...new Set(effectiveRoomRows(d, s, catalog, floorCount(s, resolveDetailParams(d, s))).rows.flat().filter(Boolean))];
  // The selection's size is the COMPILED box (shell + surroundings margins) — it's what
  // a shell-seeded archetype compiles its starting shell at.
  const sz = d.structureType ? buildBoxSize(d, s) : undefined;
  // One id per picked slot, generic over MODULE_SLOTS (only the set ones ride along, so an
  // unused module's guide is never loaded).
  const slots: Partial<Record<ModuleSlotKey, string>> = {};
  for (const slot of MODULE_SLOTS) if (d[slot.key]) slots[slot.key] = d[slot.key];
  // Basement sizing rides along only when a basement module is actually picked. Heights
  // are the per-level depths; the footprint is sent only when the user set it explicitly
  // (else compose.ts defaults the vault to the house footprint).
  const hasBasement = !!d.basement && d.basement !== 'none';
  const basementHeights = hasBasement ? basementHeightsOf(d) : [];
  // The house SHELL (un-grown W/D) — sent only when an explicit basement footprint could
  // grow the box past the house+yard, so compose can re-centre the house. effectiveSize is
  // the shell before the surroundings/basement expansion buildBoxSize applies.
  const shell = d.structureType ? effectiveSize(d, s) : undefined;
  return {
    structureType: d.structureType || undefined,
    ...slots,
    rooms: rooms.length ? rooms : undefined,
    size: sz ? [sz.w, sz.h, sz.d] : undefined,
    floorHeights: d.structureType && d.floorHeights?.length ? [...d.floorHeights] : undefined,
    // The yard scale rides along only when a surroundings ring is actually picked.
    surroundSizing:
      d.surroundings && d.surroundings !== 'none' && d.surroundSizing ? { ...d.surroundSizing } : undefined,
    basementLevels: hasBasement ? basementHeights.length : undefined,
    basementHeights: hasBasement ? [...basementHeights] : undefined,
    basementArea: hasBasement && d.basementArea ? { ...d.basementArea } : undefined,
    shellSize: hasBasement && d.basementArea && shell ? { w: shell.w, d: shell.d } : undefined,
  };
}

/** Whether the user has picked anything in Details (drives the toggle's "•" marker).
 *  @param d - The current Details state.
 *  @returns `true` when any structure/decoration/roof/basement/room is set. */
export function hasDetails(d: BuildDetails): boolean {
  return (
    d.structureType !== '' ||
    MODULE_SLOTS.some((slot) => d[slot.key] !== '') ||
    d.rooms.some((r) => r.some(Boolean))
  );
}
