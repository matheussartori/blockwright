// The StructureType contract + the shared helpers its builders use. A type owns
// only the MASSING (shell, openings, structural detail), expressed in terms of
// semantic roles; the theme supplies the concrete blocks. A type also ships a
// `defaults` kit (sensible block per role) so it looks right even under a sparse
// theme, and a `params` spec declaring its shape/behaviour knobs.
import type { AuthoringOp } from '../../authoring/types';
import type { FloorRole } from '@/shared/types';
import type { ModuleMeta } from '../modules';
import type { ParamSpec, ParamValues } from '../params';
import type { Role } from '../roles';

/** One walkable storey a structure type lays for a box+params: an inclusive y range
 *  (floor slab → just below the next) with its grade role. Returned bottom-up. */
export interface FloorPlanEntry {
  from: number;
  to: number;
  role: FloorRole;
}

/** A normalized, inclusive build box (corners sorted) plus its span per axis. */
export interface Box {
  x0: number; y0: number; z0: number;
  x1: number; y1: number; z1: number;
  /** width (x), height (y), depth (z). */
  W: number; H: number; D: number;
}

/** Normalize two opposite corners into a sorted Box with spans. */
export function box(from: [number, number, number], to: [number, number, number]): Box {
  const x0 = Math.min(from[0], to[0]), x1 = Math.max(from[0], to[0]);
  const y0 = Math.min(from[1], to[1]), y1 = Math.max(from[1], to[1]);
  const z0 = Math.min(from[2], to[2]), z1 = Math.max(from[2], to[2]);
  return { x0, y0, z0, x1, y1, z1, W: x1 - x0 + 1, H: y1 - y0 + 1, D: z1 - z0 + 1 };
}

/** Strip a `namespace:` prefix to the bare block id. */
export const bareId = (name: string): string =>
  name.includes(':') ? name.slice(name.indexOf(':') + 1) : name;

/** Vertical-axis blockstate for log-like blocks placed as upright posts (else none). */
export function logProps(name: string): Record<string, string> | undefined {
  return /(_log|_wood|_stem|_hyphae)$/.test(bareId(name)) ? { axis: 'y' } : undefined;
}

/** A role→palette-index resolver bound to the active theme + per-op overrides. It
 *  interns blocks lazily (so a build only adds palette entries it uses), exactly
 *  like the old per-template `intern` helper but keyed by semantic role. */
export interface RolePalette {
  /** Intern (get-or-create) the block for `role`, with optional blockstate props. */
  get(role: Role, props?: Record<string, string>): number;
  /** Intern the theme's weathered variant of `role`'s block (for decay patches). */
  weather(role: Role, props?: Record<string, string>): number;
  /** Intern air. */
  air(): number;
  /** The concrete block id `role` currently resolves to (e.g. to test `_stairs`). */
  idOf(role: Role): string;
}

/** Everything a structure type's builder needs. The builder returns volumetric ops
 *  in terms of roles; `compose` has already resolved the theme, params, and seed.
 *  Roof/basement modules reuse this same arg shape. */
export interface BuildArgs {
  box: Box;
  params: ParamValues;
  palette: RolePalette;
  /** Stable per-build seed (explicit `seed` param, else derived from the box). */
  seed: number;
  /** The host structure-type id this module is being applied to (e.g. `'classic'`),
   *  when applicable. Lets a roof/basement module run GENERIC geometry for any host
   *  in `build()`, plus host-specific extras keyed by this id in `integrations`.
   *  Undefined for a structure type building itself, or a context-free preview. */
  host?: string;
  /**
   * Delegate a region's geometry to a roof/basement MODULE — so a structure type
   * OWNS placement (where the roof/basement box is) while the module OWNS the geometry
   * (the single source of that typology's shape). The module runs against THIS build's
   * palette + seed with the calling structure as `host`, so its materials match the
   * structure's kit + decoration and its host-specific integration (e.g. gable-end
   * vents) is included. Injected by the compose layer (see `composeStructure`).
   *
   * @param category - 'roof', 'basement' or 'attic' (which module registry to resolve `id`).
   * @param id - The module id (e.g. 'gable', 'cellar', 'bedroom').
   * @param from - One corner of the box the module builds into [x, y, z].
   * @param to - The opposite corner of that box [x, y, z].
   * @param extra - Params layered over the build's params for the module (e.g. a roof's
   *   `ridge`, a basement's `shape`).
   * @returns The module's ops (generic build + host integration), or [] if the module
   *   is unknown / has no geometry.
   */
  composeModule(
    category: 'roof' | 'basement' | 'attic',
    id: string,
    from: [number, number, number],
    to: [number, number, number],
    extra?: Record<string, unknown>,
  ): AuthoringOp[];
}

/** A code-owned post-processing pass a structure type opts into. The compile pipeline
 *  maps each id to a generic pass in `authoring/passes/` and runs it ONLY when the
 *  build's selected structure type declares it (so the gating is data on the module,
 *  not a hardcoded `if structureType === …` buried in the pass):
 *   - `'stairs'`  — multi-storey circulation cleanup (any storeyed structure).
 *   - `'chimney'` — single complete chimney enforcement (house-style homes only). */
export type FinalizePass = 'stairs' | 'chimney';

/** A buildable structure archetype (house, …). Behaviour-only: it never
 *  names concrete blocks, so any type composes with any decoration. Carries the
 *  shared module metadata (id/label/description/knowledge/preview); `category` is
 *  always `'structure'`. */
export interface StructureType extends ModuleMeta {
  category: 'structure';
  /** The structure GROUP (family) this type belongs to — see `domain/groups.ts`. A
   *  module can target the whole group via `appliesTo`, so every member shares it; the
   *  UI also headers the gallery rail + Details select by group. Every house-family
   *  type declares `'house'`. */
  group: string;
  /** Shape/behaviour params (floors, decay, …). Block choices come from the decoration. */
  params: ParamSpec;
  /** This type's default block per role — its material "kit", overridable by the
   *  theme and by per-op role params. */
  defaults: Partial<Record<Role, string>>;
  /** Emit the massing as volumetric ops in terms of roles. */
  build(args: BuildArgs): AuthoringOp[];
  /** The EXACT walkable storeys this type lays for a box+params, bottom-up — the
   *  AUTHORITATIVE floor planes, so a code-built shell never has to be GUESSED by the
   *  geometric detector (whose stacked-flat-deck heuristic is fallible). Shares the storey
   *  math with `build()`. Omit → the app falls back to `detectFloors`. */
  floors?(box: Box, params: ParamValues): FloorPlanEntry[];
  /** Code post-processing passes this type opts into (run at compile when this type is
   *  the selected structure). Omit → none. This is the modular "which fix applies to
   *  which structure" declaration — e.g. house = `['stairs','chimney']`. */
  finalize?: FinalizePass[];
  /** Max interior rooms a single floor of this type accepts in the build planner. Omit →
   *  the generic default. A roomier archetype (a manor) raises it; a tight one lowers it. */
  maxRoomsPerFloor?: number;
  /** When true, a FRESH AI build of this type is SEEDED with this type's code-built shell
   *  (compiled via `build()` at the requested size + decoration) instead of being left
   *  fully free-form — the model keeps the exterior massing and only furnishes/details it.
   *  Used for archetypes the model can't reliably invent (the modern villa: flat roofs,
   *  stacked volumes, glass, pool). The house stays free-form (omit → no shell seed). */
  seedShell?: boolean;
  /** When true, the code-built shell is LOCKED: a compile pass (`preserveShell`) restores
   *  any shell cell the model deleted (turned to air), so the AI can't gut the exterior
   *  (the "sem chão / sem telhado" defect — a deleted floor slab / stripped roof). The
   *  model may still redecorate (solid→solid), glaze walls and furnish the interior; it
   *  just can't leave a hole where the shell put structure. Implies `seedShell`. Opt-in
   *  per type (gothic), so types that already finish well stay fully free to re-emit. */
  lockShell?: boolean;
  /** Optional system-prompt fragment (wired into the generator prompt later). */
  prompt?: string;
}
