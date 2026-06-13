// Public API of the composable generation domain: modules grouped by category
// (structure × decoration, crossed by `composeStructure` — what the authoring
// `template` op expands — plus roof/basement modules whose own geometry runs via
// `composeModule`/`composeModulePreview`), the catalog the UI lists, and the
// selection→knowledge-guide mapping the system prompt uses.
import type { AuthoringOp, AuthoringPaletteEntry, AuthoringStructure } from '../authoring/types';
import type { BuildSelection, FloorDef, GenerationCatalog } from '@/shared/types';
import { moduleAppliesTo } from '@/shared/domain/applies-to';
import { MODULE_SLOTS } from '@/shared/domain/module-slots';
import { sanitizeFloorHeights } from '@/shared/domain/storeys';
import { sanitizeSurroundSizing } from '@/shared/domain/surroundings';
import { basementHeight, composeModulePreview, selectedBasement } from './compose';
import { getModule } from './categories';
import { resolveParams } from './params';
import { box } from './structure-types/types';
import { DEFAULT_DECORATION, decorationModules, getDecoration, listDecorations } from './decorations';
import { basementModules, listBasements } from './basements';
import { listRoofs, roofModules } from './roofs';
import { atticModules, listAttics } from './attics';
import { getRoom, listRooms, roomModules } from './rooms';
import { getSurroundings, listSurroundings, surroundingsModules } from './surroundings';
import type { ModuleCategory, ModuleMeta } from './modules';
import {
  getStructureType,
  listStructureTypes,
  structureGroupOf,
  structureModules,
} from './structure-types';
import { STRUCTURE_GROUPS } from './groups';

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
export { listSurroundings, getSurroundings, insetHouseBox, type SurroundingsModule } from './surroundings';
export { ROLES, isRole, type Role } from './roles';
export { paramFields } from './params';
export type { ModuleCategory, ModuleMeta, ModuleSummary, ModuleParam, PreviewSpec } from './modules';

/** The structure type a decoration preview is rendered on. */
const PREVIEW_HOST_STRUCTURE = 'classic';

/** The renderer-facing catalog: every module summary grouped by category, plus the
 *  structure GROUP definitions. The wire shape (one array per category) is owned by
 *  `GenerationCatalog` in `@/shared/types`, since it crosses the IPC boundary — adding a
 *  category means adding its field there and a `listX()` line below, nowhere else. */
export type ModuleCatalog = GenerationCatalog;

/** List every module summary, grouped by category (+ the structure groups). */
export function listModuleCatalog(): ModuleCatalog {
  return {
    structure: listStructureTypes(),
    decoration: listDecorations(),
    basement: listBasements(),
    roof: listRoofs(),
    attic: listAttics(),
    room: listRooms(),
    surroundings: listSurroundings(),
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
 * @param rawParams - The build's loose params (floors, roof, a `floorHeights` array, …);
 *   defaults applied.
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
  const y1 = size[1] - 1;
  const b = box([0, 0, 0], [size[0] - 1, y1, size[2] - 1]);
  const params = resolveParams(type.params, rawParams);
  const floorHeights = sanitizeFloorHeights(rawParams.floorHeights);
  const surroundSizing = sanitizeSurroundSizing(rawParams.surroundSizing);

  // A type WITHOUT its own `basement` param (gothic/modern/farmhouse/sakura) gets its
  // basement composed CENTRALLY: `composeStructure` reserves the bottom `basementHeight`
  // of the box and raises the massing onto `groundY`. The floor plan must mirror that —
  // prepend the basement level and compute the STOREYS from `groundY`, not the box bottom
  // — else the plan reports the wrong planes (everything read as one "roof" band, the
  // missing-floor-1/2 defect). A type that owns its `basement` param (classic) already
  // folds the basement into its own `floors()`.
  let floorBox = b;
  const lead: FloorDef[] = [];
  if (!('basement' in type.params) && selectedBasement(rawParams)) {
    const bH = basementHeight(b.H);
    if (b.H - bH >= 6) {
      const groundY = b.y0 + bH;
      floorBox = box([b.x0, groundY, b.z0], [b.x1, b.y1, b.z1]);
      lead.push({ id: 'floor-1', name: 'Floor 1', from: b.y0, to: groundY - 1, role: 'basement' });
    }
  }

  const storeys = type.floors(floorBox, params, floorHeights, surroundSizing);
  const defs: FloorDef[] = [...lead];
  for (const f of storeys) defs.push({ id: '', name: '', from: f.from, to: f.to, role: f.role });

  // Append the ROOF band (everything above the top storey's ceiling up to the box top), so
  // the plan shows the roof as its OWN level reaching just the roof — not lumped with the
  // storeys below it. Skipped when the storeys already fill the box.
  const topTo = defs.length ? defs[defs.length - 1].to : -1;
  if (topTo >= 0 && topTo + 1 <= y1) {
    defs.push({ id: '', name: '', from: topTo + 1, to: y1, role: 'roof' });
  }

  // Number them in order (Basement / Floor 1 / Floor 2 / Roof reads off the role + index).
  return defs.map((f, i) => ({ ...f, id: `floor-${i + 1}`, name: `Floor ${i + 1}` }));
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
    ...surroundingsModules(),
  ];
}

/** Which modules the user picked in the composer Details, as far as knowledge-guide
 *  loading cares: it's the structured `BuildSelection` minus `size` (which only sizes a
 *  shell seed, not which guides load). Each picked module maps to its own guide, loaded
 *  ONLY when selected — so an unused module guide never bloats the system prompt. Defined
 *  as a projection of the shared selection so the two can never list different fields. */
export type ModuleSelection = Omit<BuildSelection, 'size'>;

// `moduleAppliesTo` is the shared pure predicate (src/shared/domain/applies-to.ts) so
// the renderer's Details filtering and this guide gating stay in lock-step. Re-exported
// for existing importers of the domain barrel.
export { moduleAppliesTo };

/** The module guides to include for an explicit selection (paths relative to the
 *  knowledge dir, e.g. `nbt/modules/structure/house.md`). One guide per selected
 *  module — a slot guide loads only when that module is chosen AND it applies to the
 *  chosen structure (so a house-only roof guide is never sent for another type). Loops
 *  the shared {@link MODULE_SLOTS} so a new category is gated automatically. */
export function selectedGuides(sel: ModuleSelection): string[] {
  const out: string[] = [];
  const hostGroup = structureGroupOf(sel.structureType);
  const add = (m?: ModuleMeta) => {
    if (m?.knowledge) out.push(m.knowledge);
  };
  // Gated by appliesTo so a module that doesn't fit the chosen structure (or a room/roof
  // for another family) never drags its guide in. A universal module (no appliesTo, e.g.
  // a decoration) always passes.
  const gatedAdd = (m?: ModuleMeta) => {
    if (moduleAppliesTo(m?.appliesTo, sel.structureType, hostGroup)) add(m);
  };
  add(sel.structureType ? getStructureType(sel.structureType) : undefined);
  for (const slot of MODULE_SLOTS) {
    const id = sel[slot.key];
    if (id) gatedAdd(getModule(slot.key, id));
  }
  for (const id of sel.rooms ?? []) gatedAdd(getRoom(id));
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
    const meta = getModule(category, id);
    if (!meta?.preview) return null;
    const [w, h, d] = meta.preview.size;
    const palette: AuthoringPaletteEntry[] = [];
    const ops: AuthoringOp[] = composeModulePreview(category, id, [0, 0, 0], [w - 1, h - 1, d - 1], localIntern(palette));
    return { DataVersion: 3955, size: [w, h, d], palette, ops };
  }
  if (category === 'surroundings') {
    // A yard only reads in context: render the module's first applicable host STRUCTURE
    // with the ring selected, via a normal `template` op (the host insets itself and
    // delegates the ring, exactly as a real build would).
    const meta = getSurroundings(id);
    if (!meta?.preview) return null;
    const host = meta.appliesTo.map(getStructureType).find((t) => t !== undefined);
    if (!host) return null;
    const [w, h, d] = meta.preview.size;
    return {
      DataVersion: 3955,
      size: [w, h, d],
      palette: [{ Name: 'minecraft:air' }],
      ops: [
        {
          op: 'template',
          name: host.id,
          from: [0, 0, 0],
          to: [w - 1, h - 1, d - 1],
          params: { decoration: host.pairedDecoration ?? DEFAULT_DECORATION, surroundings: id, ...meta.preview.params },
        },
      ],
    };
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
