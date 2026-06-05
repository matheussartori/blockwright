// Public API of the composable generation domain: modules grouped by category
// (structure × decoration, crossed by `composeStructure` — what the authoring
// `template` op expands — plus roof/basement modules that are selectable guidance but
// not yet geometry-wired), the catalog the UI lists, and the selection→knowledge-guide
// mapping the system prompt uses.
import type { AuthoringStructure } from '../authoring/types';
import { DEFAULT_DECORATION, decorationModules, getDecoration, listDecorations } from './decorations';
import { basementModules, getBasement, listBasements } from './basements';
import { getRoof, listRoofs, roofModules } from './roofs';
import type { ModuleCategory, ModuleMeta, ModuleSummary } from './modules';
import {
  getStructureType,
  listStructureTypes,
  structureModules,
} from './structure-types';

export {
  composeStructure,
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
  type StructureType,
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
}

/** List every module summary, grouped by category. */
export function listModuleCatalog(): ModuleCatalog {
  return {
    structure: listStructureTypes(),
    decoration: listDecorations(),
    basement: listBasements(),
    roof: listRoofs(),
  };
}

/** Every module across categories (for selection→guide mapping + lookups). */
function allModules(): ModuleMeta[] {
  return [...structureModules(), ...decorationModules(), ...roofModules(), ...basementModules()];
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
}

/** The module guides to include for an explicit selection (paths relative to the
 *  knowledge dir, e.g. `nbt/modules/structure/tower.md`). One guide per selected
 *  module — a roof/basement guide is loaded only when that type is chosen. */
export function selectedGuides(sel: ModuleSelection): string[] {
  const lookups = [
    sel.structureType ? getStructureType(sel.structureType) : undefined,
    sel.decoration ? getDecoration(sel.decoration) : undefined,
    sel.roof ? getRoof(sel.roof) : undefined,
    sel.basement ? getBasement(sel.basement) : undefined,
  ];
  return lookups.flatMap((m) => (m?.knowledge ? [m.knowledge] : []));
}

/** The module guides a free-text prompt pulls in via keyword (the fallback when no
 *  explicit selection names them — e.g. typing "a tall tower"). */
export function promptGuides(prompt: string): string[] {
  return allModules()
    .filter((m) => m.knowledge && m.keywords?.test(prompt))
    .map((m) => m.knowledge!);
}

/** Build the representative authoring structure for a module's gallery preview, or
 *  null if the module has no preview (e.g. the metadata-only roof/basement modules,
 *  whose geometry isn't wired yet). A structure preview renders that structure under the
 *  default decoration; a decoration preview renders it on the host structure. Pure — the
 *  caller compiles. */
export function buildModulePreview(category: ModuleCategory, id: string): AuthoringStructure | null {
  let meta: ModuleMeta | undefined;
  let name: string;
  let params: Record<string, unknown>;
  if (category === 'structure') {
    meta = getStructureType(id);
    name = id;
    params = { decoration: DEFAULT_DECORATION };
  } else if (category === 'decoration') {
    meta = getDecoration(id);
    name = PREVIEW_HOST_STRUCTURE;
    params = { decoration: id };
  } else {
    return null; // roof/basement are metadata-only — no preview geometry yet
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
