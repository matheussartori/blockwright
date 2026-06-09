// Public API of the composable generation domain: modules grouped by category
// (structure × decoration, crossed by `composeStructure` — what the authoring
// `template` op expands — plus roof/basement modules whose own geometry runs via
// `composeModule`/`composeModulePreview`), the catalog the UI lists, and the
// selection→knowledge-guide mapping the system prompt uses.
import type { AuthoringOp, AuthoringPaletteEntry, AuthoringStructure } from '../authoring/types';
import type { FloorDef } from '@/shared/types';
import { moduleAppliesTo } from '@/shared/domain/applies-to';
import { composeModulePreview } from './compose';
import { resolveParams } from './params';
import { box } from './structure-types/types';
import { DEFAULT_DECORATION, decorationModules, getDecoration, listDecorations } from './decorations';
import { basementModules, getBasement, listBasements } from './basements';
import { getRoof, listRoofs, roofModules } from './roofs';
import { atticModules, getAttic, listAttics } from './attics';
import { getRoom, listRooms, roomModules } from './rooms';
import type { ModuleCategory, ModuleMeta, ModuleSummary } from './modules';
import {
  getStructureType,
  listStructureTypes,
  structureGroupOf,
  structureModules,
} from './structure-types';
import { STRUCTURE_GROUPS, type StructureGroup } from './groups';

export {
  composeStructure,
  composeModule,
  composeModulePreview,
  composeBlockNames,
  isKnownStructure,
  knownStructureNames,
  type Intern,
} from './compose';
export {
  getStructureType,
  isStructureType,
  structureTypeIds,
  listStructureTypes,
  structureModules,
  structureGroupOf,
  structureFinalizers,
  type StructureType,
  type FinalizePass,
} from './structure-types';
export { STRUCTURE_GROUPS, getStructureGroup, type StructureGroup } from './groups';
export {
  getDecoration,
  decorationIds,
  listDecorations,
  decorationModules,
  DEFAULT_DECORATION,
  type Decoration,
  type DecorationTheme,
} from './decorations';
export { listBasements, getBasement, type BasementModule } from './basements';
export { listRoofs, getRoof, type RoofModule } from './roofs';
export { listAttics, getAttic, type AtticModule } from './attics';
export { listRooms, getRoom, type RoomModule } from './rooms';
export { ROLES, isRole, type Role } from './roles';
export { paramFields } from './params';
export type { ModuleCategory, ModuleMeta, ModuleSummary, ModuleParam, PreviewSpec } from './modules';

/** The structure type a decoration preview is rendered on. */
const PREVIEW_HOST_STRUCTURE = 'classic';

/** The renderer-facing catalog: every module summary, grouped by category, plus the
 *  structure GROUP definitions. Drives the composer's Structure/Decoration selects and
 *  the module gallery. */
export interface ModuleCatalog {
  structure: ModuleSummary[];
  decoration: ModuleSummary[];
  basement: ModuleSummary[];
  roof: ModuleSummary[];
  attic: ModuleSummary[];
  room: ModuleSummary[];
  /** Structure families (e.g. "House"), for the gallery rail + Details optgroups. */
  groups: StructureGroup[];
}

/** List every module summary, grouped by category (+ the structure groups). */
export function listModuleCatalog(): ModuleCatalog {
  return {
    structure: listStructureTypes(),
    decoration: listDecorations(),
    basement: listBasements(),
    roof: listRoofs(),
    attic: listAttics(),
    room: listRooms(),
    groups: STRUCTURE_GROUPS,
  };
}

/**
 * The AUTHORITATIVE storeys a code-built structure lays for a size + params — so the app
 * uses the exact floor planes the shell was built with instead of GUESSING them from the
 * geometry (the geometric `detectFloors` is the fallback for free-form builds). Threaded
 * into the generated build's metadata sidecar.
 *
 * @param id - The structure-type id (e.g. 'modern').
 * @param size - The build size [X, Y, Z].
 * @param rawParams - The build's loose params (floors, roof, …); defaults applied.
 * @returns The numbered storeys bottom-up (`FloorDef[]`), or `[]` when the type doesn't
 *   declare an authoritative plan (so the caller falls back to detection).
 */
export function structureFloorPlan(
  id: string,
  size: [number, number, number],
  rawParams: Record<string, unknown> = {},
): FloorDef[] {
  const type = getStructureType(id);
  if (!type?.floors) return [];
  const b = box([0, 0, 0], [size[0] - 1, size[1] - 1, size[2] - 1]);
  const params = resolveParams(type.params, rawParams);
  return type.floors(b, params).map((f, i) => ({
    id: `floor-${i + 1}`,
    name: `Floor ${i + 1}`,
    from: f.from,
    to: f.to,
    role: f.role,
  }));
}

/** Every module across categories (for selection→guide mapping + lookups). */
function allModules(): ModuleMeta[] {
  return [
    ...structureModules(),
    ...decorationModules(),
    ...roofModules(),
    ...basementModules(),
    ...atticModules(),
    ...roomModules(),
  ];
}

/** Which modules the user picked in the composer Details: a structure type, a
 *  decoration, and (for the structure) a roof + basement typology. Each maps to its
 *  own knowledge guide, loaded ONLY when selected — so an unused roof/basement guide
 *  never bloats the system prompt. */
export interface ModuleSelection {
  structureType?: string;
  decoration?: string;
  roof?: string;
  basement?: string;
  /** The in-roof attic module id (storage/bedroom), if picked. Loads its own guide; only
   *  applies to pitched-roof houses (and clashes with the flat roof). */
  attic?: string;
  /** Interior room module ids assigned across the floors (deduped). Each loads its own
   *  guide; the per-floor layout is conveyed to the model as prompt text, not here. */
  rooms?: string[];
}

// `moduleAppliesTo` is the shared pure predicate (src/shared/domain/applies-to.ts) so
// the renderer's Details filtering and this guide gating stay in lock-step. Re-exported
// for existing importers of the domain barrel.
export { moduleAppliesTo };

/** The module guides to include for an explicit selection (paths relative to the
 *  knowledge dir, e.g. `nbt/modules/structure/house.md`). One guide per selected
 *  module — a roof/basement guide loads only when that type is chosen AND it applies to
 *  the chosen structure (so a house-only roof guide is never sent for another type). */
export function selectedGuides(sel: ModuleSelection): string[] {
  const out: string[] = [];
  const add = (m?: ModuleMeta) => {
    if (m?.knowledge) out.push(m.knowledge);
  };
  const hostGroup = structureGroupOf(sel.structureType);
  add(sel.structureType ? getStructureType(sel.structureType) : undefined);
  add(sel.decoration ? getDecoration(sel.decoration) : undefined);
  const roof = sel.roof ? getRoof(sel.roof) : undefined;
  if (moduleAppliesTo(roof?.appliesTo, sel.structureType, hostGroup)) add(roof);
  const basement = sel.basement ? getBasement(sel.basement) : undefined;
  if (moduleAppliesTo(basement?.appliesTo, sel.structureType, hostGroup)) add(basement);
  const attic = sel.attic ? getAttic(sel.attic) : undefined;
  if (moduleAppliesTo(attic?.appliesTo, sel.structureType, hostGroup)) add(attic);
  // One guide per selected room (deduped already), gated by appliesTo so a room that
  // doesn't fit the chosen structure doesn't drag its guide in.
  for (const id of sel.rooms ?? []) {
    const room = getRoom(id);
    if (moduleAppliesTo(room?.appliesTo, sel.structureType, hostGroup)) add(room);
  }
  return out;
}

/** The module guides a free-text prompt pulls in via keyword (the fallback when no
 *  explicit selection names them — for any module that declares `keywords`). */
export function promptGuides(prompt: string): string[] {
  return allModules()
    .filter((m) => m.knowledge && m.keywords?.test(prompt))
    .map((m) => m.knowledge!);
}

/** A get-or-create palette intern over a fresh palette array (the domain-side intern
 *  shape: name + props → index). Local to avoid a value import from the authoring layer
 *  (which imports the domain), keeping the module boundary one-directional. */
function localIntern(palette: AuthoringPaletteEntry[]): (name: string, props?: Record<string, string>) => number {
  const seen = new Map<string, number>();
  return (name, props) => {
    const key = `${name}|${props ? Object.keys(props).sort().map((k) => `${k}=${props[k]}`).join(',') : ''}`;
    const hit = seen.get(key);
    if (hit !== undefined) return hit;
    const i = palette.push({ Name: name, Properties: props }) - 1;
    seen.set(key, i);
    return i;
  };
}

/** Build the representative authoring structure for a module's gallery preview, or null
 *  if the module has no preview. A structure preview renders that structure under the
 *  default decoration; a decoration preview renders it on the host structure (both via a
 *  `template` op the compiler expands). A roof/basement preview runs the module's OWN
 *  geometry (`composeModulePreview`) and ships the pre-expanded ops + palette. Pure — the
 *  caller compiles. */
export function buildModulePreview(category: ModuleCategory, id: string): AuthoringStructure | null {
  // Guidance-only / interior categories carry no standalone preview (an attic only reads
  // inside its host roof void, so the gallery shows a placeholder for it like rooms).
  if (category === 'room' || category === 'attic') return null;
  if (category === 'roof' || category === 'basement') {
    const meta = category === 'roof' ? getRoof(id) : getBasement(id);
    if (!meta?.preview) return null;
    const [w, h, d] = meta.preview.size;
    const palette: AuthoringPaletteEntry[] = [];
    const ops: AuthoringOp[] = composeModulePreview(category, id, [0, 0, 0], [w - 1, h - 1, d - 1], localIntern(palette));
    return { DataVersion: 3955, size: [w, h, d], palette, ops };
  }

  let meta: ModuleMeta | undefined;
  let name: string;
  let params: Record<string, unknown>;
  if (category === 'structure') {
    meta = getStructureType(id);
    name = id;
    params = { decoration: DEFAULT_DECORATION };
  } else {
    meta = getDecoration(id);
    name = PREVIEW_HOST_STRUCTURE;
    params = { decoration: id };
  }
  if (!meta?.preview) return null;
  const [w, h, d] = meta.preview.size;
  return {
    DataVersion: 3955,
    size: [w, h, d],
    palette: [{ Name: 'minecraft:air' }],
    ops: [
      {
        op: 'template',
        name,
        from: [0, 0, 0],
        to: [w - 1, h - 1, d - 1],
        params: { ...params, ...meta.preview.params },
      },
    ],
  };
}
