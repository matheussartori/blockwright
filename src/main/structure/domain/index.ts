// Public API of the composable generation domain: modules grouped by category
// (structure × decoration, crossed by `composeStructure` — what the authoring
// `template` op expands — plus the scaffolded basement/roof categories), the catalog
// the UI lists, and the selection→knowledge-guide mapping the system prompt uses.
import type { AuthoringStructure } from '../authoring/types';
import { DEFAULT_DECORATION, decorationModules, getDecoration, listDecorations } from './decorations';
import { listBasements } from './basements';
import { listRoofs } from './roofs';
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
export { listBasements, type BasementModule } from './basements';
export { listRoofs, type RoofModule } from './roofs';
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
  return [...structureModules(), ...decorationModules()];
}

/** Which structure/decoration the user picked in the composer Details. */
export interface ModuleSelection {
  structureType?: string;
  decoration?: string;
}

/** The module guides to include for an explicit selection (paths relative to the
 *  knowledge dir, e.g. `nbt/modules/structure/tower.md`). */
export function selectedGuides(sel: ModuleSelection): string[] {
  const out: string[] = [];
  const s = sel.structureType ? getStructureType(sel.structureType) : undefined;
  if (s?.knowledge) out.push(s.knowledge);
  const d = sel.decoration ? getDecoration(sel.decoration) : undefined;
  if (d?.knowledge) out.push(d.knowledge);
  return out;
}

/** The module guides a free-text prompt pulls in via keyword (the fallback when no
 *  explicit selection names them — e.g. typing "a tall tower"). */
export function promptGuides(prompt: string): string[] {
  return allModules()
    .filter((m) => m.knowledge && m.keywords?.test(prompt))
    .map((m) => m.knowledge!);
}

/** Build the representative authoring structure for a module's gallery preview, or
 *  null if the module has no preview (e.g. the scaffolded basement/roof modules). A
 *  structure preview renders that structure under the default decoration; a
 *  decoration preview renders it on the host structure. Pure — the caller compiles. */
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
    return null; // basement/roof previews not wired yet
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
