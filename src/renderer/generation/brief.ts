// Pure helpers behind the Generate composer's "Details" section: they turn the
// user's module picks (BuildDetails) into the three things generation needs — the
// plain-language `[Build details]` brief appended to the model prompt, the structured
// `BuildSelection` that drives knowledge-guide loading, and the display-ready
// `BuildBrief` card shown in the chat. Extracted from NewStructurePanel so they're
// unit-testable in isolation and the component stays a thin view. No React, no IO.
import type { BuildBrief, BuildSelection, GenerationCatalog, GenerationModule } from '@/shared/types';
import { presetForScale, scaleForArea } from '@/shared/domain/furnishing';
import { MODULE_SLOTS, type ModuleSlotKey } from '@/shared/domain/module-slots';
import {
  DEFAULT_STOREY_H,
  MAX_STOREY_H,
  MIN_STOREY_H,
  heightOverhead,
} from '@/shared/domain/storeys';
import { expandSizeForSurroundings } from '@/shared/domain/surroundings';

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
  rooms: [],
};

// Storey-height bounds + the neutral default come from the shared storey ladder
// (`shared/domain/storeys.ts`) — the SAME constants the structure types build with —
// re-exported so the composer controls keep importing them from here.
export { DEFAULT_STOREY_H, MAX_STOREY_H, MIN_STOREY_H };

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

/** The total build height implied by explicit per-floor storey heights: their sum plus the
 *  roof/basement/attic overhead. The inverse of "split a total H across N equal storeys".
 *  @param floorHeights - The interior storey heights, bottom-up.
 *  @param params - The resolved params (basement/attic drive the overhead).
 *  @param w - Build width (roof reserve scales with the footprint).
 *  @param d - Build depth.
 *  @returns The total box height. */
export function totalHeightFromFloors(
  floorHeights: number[],
  params: Record<string, string | number>,
  w: number,
  d: number,
): number {
  const sum = floorHeights.reduce((a, b) => a + b, 0);
  return sum + overhead(params, w, d);
}

/** Seed the per-floor height editor: a uniform storey height for every above-ground floor,
 *  back-derived from the currently-effective total so switching into per-floor mode keeps
 *  the same overall height. Clamped to [{@link MIN_STOREY_H}, {@link MAX_STOREY_H}].
 *  @param d - The current Details state.
 *  @param struct - The chosen structure module.
 *  @returns One height per floor (all equal), length = the resolved floor count (≥ 1). */
export function defaultFloorHeights(d: BuildDetails, struct: GenerationModule | undefined): number[] {
  const params = paramsWithSlots(d, struct);
  const n = Math.max(1, floorCount(struct, params));
  const base = d.size ?? derivedSize(struct, params);
  const storeys = base.h - overhead(params, base.w, base.d);
  const each = Math.round(storeys / n) || DEFAULT_STOREY_H;
  const clamped = Math.max(MIN_STOREY_H, Math.min(MAX_STOREY_H, each));
  return Array.from({ length: n }, () => clamped);
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
    return { w: base.w, d: base.d, h: totalHeightFromFloors(d.floorHeights, params, base.w, base.d) };
  }
  return base;
}

/** The compiled BUILD BOX for the picked details: the {@link effectiveSize} building
 *  SHELL expanded by the selected surroundings ring's margins (identity when none is
 *  picked). The composer's size fields keep SHELL semantics — the user's W×D is the
 *  house — so the expansion happens only where the box is consumed: the structured
 *  selection (the shell seed compiles at this size) and the brief/card.
 *  @param d - The current Details state.
 *  @param struct - The chosen structure module.
 *  @returns The compiled box `{ w, d, h }` (≥ the shell on every axis). */
export function buildBoxSize(
  d: BuildDetails,
  struct: GenerationModule | undefined,
): { w: number; d: number; h: number } {
  const sz = effectiveSize(d, struct);
  const grown = expandSizeForSurroundings(sz.w, sz.d, d.surroundings);
  return { w: grown.w, d: grown.d, h: sz.h };
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

/** The per-floor interior program, in plain language for the model: one line per floor
 *  that has rooms assigned (bottom-up), naming each room AND — the SPACE × DECORATION
 *  organism — its computed space tier and the matching furnishing PRESET (a decoration-
 *  agnostic base layout the chosen decoration re-skins). This is what stops a big floor
 *  coming out empty: the area is computed from the build size, a tier is picked, and the
 *  preset's furniture zones are spelled out so the model furnishes to the room, not below
 *  it. '' if the structure isn't storeyed or no rooms were picked.
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
  const lines: string[] = [];
  for (let i = 0; i < n; i++) {
    const ids = roomsOnFloor(d, i);
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
  return (
    `- Room plan — furnish each floor to its SPACE (see each room's module guide). ` +
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
  const floors = Array.from({ length: n }, (_, i) => ({
    name: `Floor ${i + 1}`,
    rooms: roomsOnFloor(d, i).map((id) => lbl('room', id)),
  }));
  // One label per picked slot (decoration/roof/basement/attic/surroundings) — generic over
  // MODULE_SLOTS so a new category's chip appears on the card automatically.
  const slotLabels: Partial<Record<ModuleSlotKey, string>> = {};
  for (const slot of MODULE_SLOTS) if (d[slot.key]) slotLabels[slot.key] = lbl(slot.key, d[slot.key]);
  return {
    structure: s?.label ?? d.structureType,
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
  const rooms = [...new Set(d.rooms.flat().filter(Boolean))];
  const s = d.structureType ? catalog?.structure.find((m) => m.id === d.structureType) : undefined;
  // The selection's size is the COMPILED box (shell + surroundings margins) — it's what
  // a shell-seeded archetype compiles its starting shell at.
  const sz = d.structureType ? buildBoxSize(d, s) : undefined;
  // One id per picked slot, generic over MODULE_SLOTS (only the set ones ride along, so an
  // unused module's guide is never loaded).
  const slots: Partial<Record<ModuleSlotKey, string>> = {};
  for (const slot of MODULE_SLOTS) if (d[slot.key]) slots[slot.key] = d[slot.key];
  return {
    structureType: d.structureType || undefined,
    ...slots,
    rooms: rooms.length ? rooms : undefined,
    size: sz ? [sz.w, sz.h, sz.d] : undefined,
    floorHeights: d.structureType && d.floorHeights?.length ? [...d.floorHeights] : undefined,
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
