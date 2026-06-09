// Pure helpers behind the Generate composer's "Details" section: they turn the
// user's module picks (BuildDetails) into the three things generation needs — the
// plain-language `[Build details]` brief appended to the model prompt, the structured
// `BuildSelection` that drives knowledge-guide loading, and the display-ready
// `BuildBrief` card shown in the chat. Extracted from NewStructurePanel so they're
// unit-testable in isolation and the component stays a thin view. No React, no IO.
import type { BuildBrief, BuildSelection, GenerationCatalog, GenerationModule } from '@/shared/types';
import { presetForScale, scaleForArea } from '@/shared/domain/furnishing';
import { MODULE_SLOTS, type ModuleSlotKey } from '@/shared/domain/module-slots';

/** Max interior rooms a single floor can be assigned in the composer. */
export const ROOMS_PER_FLOOR = 2;

/** The build modules the user picked for a fresh build: a structure type, one id per
 *  single-select module SLOT (decoration/roof/basement/attic/exterior — the per-slot
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
   *  (so picking floors/basement/attic auto-sizes the box); set when the user edits. */
  size: { w: number; d: number; h: number } | null;
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
  rooms: [],
};

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
  const basement = params.basement && params.basement !== 'none' ? 1 : 0;
  const attic = params.attic && params.attic !== 'none' ? 1 : 0;
  const levels = floors + basement;
  const h = levels * 5 + Math.floor(Math.min(w, d) / 2) + 1 + (attic ? 2 : 0);
  return { w, d, h };
}

/** The effective size: the user's override, else the derived default. The selected
 *  basement module (now its own select, not a house param) is folded back in so a
 *  basement still auto-grows the box.
 *  @param d - The current Details state (an explicit `size` wins).
 *  @param struct - The chosen structure module (drives the derived fallback).
 *  @returns The build box `{ w, d, h }` to use. */
export function effectiveSize(
  d: BuildDetails,
  struct: GenerationModule | undefined,
): { w: number; d: number; h: number } {
  const params = { ...resolveDetailParams(d, struct), basement: d.basement || 'none', attic: d.attic || 'none' };
  return d.size ?? derivedSize(struct, params);
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
  const label = s?.label ?? d.structureType;
  const decoClause = deco ? ` with the "${deco.label}" decoration (its materials and mood)` : '';
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
  return (
    `\n\n[Build details — guidance the user picked, NOT a fixed mold. Design and build this structure YOURSELF, from scratch, with your own ops. Do NOT use a \`template\` op or any stamped preset shell.]\n` +
    `- Build a ${label}${decoClause}, roughly ${sz.w}×${sz.h}×${sz.d} (W×H×D).\n` +
    (traits ? `- Desired characteristics: ${traits}.\n` : '') +
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
  const sz = effectiveSize(d, s);
  const n = floorCount(s, resolveDetailParams(d, s));
  const floors = Array.from({ length: n }, (_, i) => ({
    name: `Floor ${i + 1}`,
    rooms: roomsOnFloor(d, i).map((id) => lbl('room', id)),
  }));
  // One label per picked slot (decoration/roof/basement/attic/exterior) — generic over
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
  const sz = d.structureType ? effectiveSize(d, s) : undefined;
  // One id per picked slot, generic over MODULE_SLOTS (only the set ones ride along, so an
  // unused module's guide is never loaded).
  const slots: Partial<Record<ModuleSlotKey, string>> = {};
  for (const slot of MODULE_SLOTS) if (d[slot.key]) slots[slot.key] = d[slot.key];
  return {
    structureType: d.structureType || undefined,
    ...slots,
    rooms: rooms.length ? rooms : undefined,
    size: sz ? [sz.w, sz.h, sz.d] : undefined,
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
