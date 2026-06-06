// Public API of the composable generation domain: modules grouped by category
// (structure × decoration, crossed by `composeStructure` — what the authoring
// `template` op expands — plus roof/basement modules whose own geometry runs via
// `composeModule`/`composeModulePreview`), the catalog the UI lists, and the
// selection→knowledge-guide mapping the system prompt uses.
import type { AuthoringOp, AuthoringPaletteEntry, AuthoringStructure } from '../authoring/types';
import { composeModulePreview } from './compose';
import { DEFAULT_DECORATION, decorationModules, getDecoration, listDecorations } from './decorations';
import { basementModules, getBasement, listBasements } from './basements';
import { getRoof, listRoofs, roofModules } from './roofs';
import { getRoom, listRooms, roomModules } from './rooms';
import type { ModuleCategory, ModuleMeta, ModuleSummary } from './modules';
import {
  getStructureType,
  listStructureTypes,
  structureModules,
} from './structure-types';

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
  structureFinalizers,
  type StructureType,
  type FinalizePass,
} from './structure-types';
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
export { listRooms, getRoom, type RoomModule } from './rooms';
export { ROLES, isRole, type Role } from './roles';
export { paramFields } from './params';
export type { ModuleCategory, ModuleMeta, ModuleSummary, ModuleParam, PreviewSpec } from './modules';

/** The structure type a decoration preview is rendered on. */
const PREVIEW_HOST_STRUCTURE = 'house';

/** The renderer-facing catalog: every module summary, grouped by category. Drives
 *  the composer's Structure/Decoration selects and the module gallery. */
export interface ModuleCatalog {
  structure: ModuleSummary[];
  decoration: ModuleSummary[];
  basement: ModuleSummary[];
  roof: ModuleSummary[];
  room: ModuleSummary[];
}

/** List every module summary, grouped by category. */
export function listModuleCatalog(): ModuleCatalog {
  return {
    structure: listStructureTypes(),
    decoration: listDecorations(),
    basement: listBasements(),
    roof: listRoofs(),
    room: listRooms(),
  };
}

/** Every module across categories (for selection→guide mapping + lookups). */
function allModules(): ModuleMeta[] {
  return [
    ...structureModules(),
    ...decorationModules(),
    ...roofModules(),
    ...basementModules(),
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
  /** Interior room module ids assigned across the floors (deduped). Each loads its own
   *  guide; the per-floor layout is conveyed to the model as prompt text, not here. */
  rooms?: string[];
}

/** Does a module apply to a given host structure? True when it has no `appliesTo`
 *  (applies to every structure) or its `appliesTo` includes `host`. A module with an
 *  `appliesTo` but no host to match against does not apply. */
export function moduleAppliesTo(appliesTo: string[] | undefined, host: string | undefined): boolean {
  if (!appliesTo || appliesTo.length === 0) return true;
  return host !== undefined && appliesTo.includes(host);
}

/** The module guides to include for an explicit selection (paths relative to the
 *  knowledge dir, e.g. `nbt/modules/structure/tower.md`). One guide per selected
 *  module — a roof/basement guide loads only when that type is chosen AND it applies to
 *  the chosen structure (so a house-only roof guide is never sent for another type). */
export function selectedGuides(sel: ModuleSelection): string[] {
  const out: string[] = [];
  const add = (m?: ModuleMeta) => {
    if (m?.knowledge) out.push(m.knowledge);
  };
  add(sel.structureType ? getStructureType(sel.structureType) : undefined);
  add(sel.decoration ? getDecoration(sel.decoration) : undefined);
  const roof = sel.roof ? getRoof(sel.roof) : undefined;
  if (moduleAppliesTo(roof?.appliesTo, sel.structureType)) add(roof);
  const basement = sel.basement ? getBasement(sel.basement) : undefined;
  if (moduleAppliesTo(basement?.appliesTo, sel.structureType)) add(basement);
  // One guide per selected room (deduped already), gated by appliesTo so a room that
  // doesn't fit the chosen structure doesn't drag its guide in.
  for (const id of sel.rooms ?? []) {
    const room = getRoom(id);
    if (moduleAppliesTo(room?.appliesTo, sel.structureType)) add(room);
  }
  return out;
}

/** The module guides a free-text prompt pulls in via keyword (the fallback when no
 *  explicit selection names them — e.g. typing "a tall tower"). */
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
