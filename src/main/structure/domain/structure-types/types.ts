// The StructureType contract + the shared helpers its builders use. A type owns
// only the MASSING (shell, openings, structural detail), expressed in terms of
// semantic roles; the theme supplies the concrete blocks. A type also ships a
// `defaults` kit (sensible block per role) so it looks right even under a sparse
// theme, and a `params` spec declaring its shape/behaviour knobs.
import type { AuthoringOp } from '../../authoring/types';
import type { FloorRole } from '@/shared/types';
import type { SurroundSizing } from '@/shared/domain/surroundings';
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
  /** The user's explicit slab-to-slab storey heights, bottom-up (ABOVE-GROUND floors
   *  only — a basement level is handled by whoever digs it). Sanitized by the compose
   *  layer from the op's raw `floorHeights` param. A storeyed type feeds these to the
   *  shared ladder (`planStoreys`) instead of its uniform split, so the user's
   *  per-floor heights hold in EVERY house type. Undefined → the uniform split. */
  floorHeights?: number[];
  /** The user's per-axis surroundings ring scale (the composer's yard-size control), or
   *  undefined for the auto-derived ring. A yard-aware type threads it into `yardFor`/
   *  `insetHouseBox` so the house/yard split honours the user's chosen yard size, and into
   *  its `composeModule('surroundings', …)` delegation so the ring fills the same margins. */
  surroundSizing?: SurroundSizing;
  /** The host structure-type id this module is being applied to (e.g. `'classic'`),
   *  when applicable. Lets a roof/basement module run GENERIC geometry for any host
   *  in `build()`, plus host-specific extras keyed by this id in `integrations`.
   *  Undefined for a structure type building itself, or a context-free preview. */
  host?: string;
  /**
   * Delegate a region's geometry to a roof/basement/surroundings MODULE — so a structure
   * type OWNS placement (where the roof/basement/yard box is) while the module OWNS the
   * geometry (the single source of that typology's shape). The module runs against THIS
   * build's palette + seed with the calling structure as `host`, so its materials match
   * the structure's kit + decoration and its host-specific integration (e.g. gable-end
   * vents) is included. Injected by the compose layer (see `composeStructure`).
   *
   * @param category - 'roof', 'basement', 'attic' or 'surroundings' (which module
   *   registry to resolve `id`).
   * @param id - The module id (e.g. 'gable', 'cellar', 'bedroom').
   * @param from - One corner of the box the module builds into [x, y, z].
   * @param to - The opposite corner of that box [x, y, z].
   * @param extra - Params layered over the build's params for the module (e.g. a roof's
   *   `ridge`, a basement's `shape`).
   * @returns The module's ops (generic build + host integration), or [] if the module
   *   is unknown / has no geometry.
   */
  composeModule(
    category: 'roof' | 'basement' | 'attic' | 'surroundings',
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
 *   - `'chimney'` — single complete chimney enforcement (house-style homes only).
 *  (Vertical circulation needs no finalizer: `rebuildStairwells` is always-on and
 *  self-gating.) */
export type FinalizePass = 'chimney';

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
   *  math with `build()` — including the user's explicit per-floor heights, when given.
   *  Omit → the app falls back to `detectFloors`. */
  floors?(box: Box, params: ParamValues, floorHeights?: number[], surroundSizing?: SurroundSizing): FloorPlanEntry[];
  /** The ground-floor INTERIOR footprint (the walkable rect, inside the wall ring) for a
   *  box+params. The central basement path lands its DESCENT LADDER against this rect's back
   *  wall, so the climb always surfaces in the type's USABLE area. A type whose ground wall
   *  sits on the box edge (a 1-thick wall) needs nothing here; one whose shaft is INSET from
   *  the box — the haunted tower's battered, flared plinth — MUST report the inner rect, or
   *  the descent ladder lands inside the thick wall (the "escada dentro da parede" defect).
   *  Omit → box inset by 1 (the 1-thick-wall default). */
  interiorRect?(box: Box, params: ParamValues, floorHeights?: number[], surroundSizing?: SurroundSizing): { x0: number; z0: number; x1: number; z1: number };
  /** Code post-processing passes this type opts into (run at compile when this type is
   *  the selected structure). Omit → none. This is the modular "which fix applies to
   *  which structure" declaration — e.g. house = `['chimney']`. */
  finalize?: FinalizePass[];
  /** Max interior rooms a single floor of this type accepts in the build planner. Omit →
   *  the generic default. A roomier archetype (a manor) raises it; a tight one lowers it. */
  maxRoomsPerFloor?: number;
  /** The decoration id that IS this type's identity look (the modern villa's white-and-
   *  glass, the sakura's pink cherry) — auto-picked in the composer Details when this
   *  structure is chosen (the user can still change it). DECLARED HERE, on the module,
   *  so the renderer never hardcodes a type→decoration map. Omit → no pairing (classic
   *  stays free on the default decoration). */
  pairedDecoration?: string;
  /** Marks an inherently articulated archetype (wings/towers/multi-volume massing) so
   *  build-complexity gates (e.g. the complex-structures knowledge guide) include it
   *  without naming type ids in general code. Omit → judged by selection/prompt alone. */
  complex?: boolean;
  /** When true, a FRESH AI build of this type is SEEDED with this type's code-built shell
   *  (compiled via `build()` at the requested size + decoration) instead of being left
   *  fully free-form — the model keeps the exterior massing and only furnishes/details it.
   *  The model can't reliably invent a silhouette from prose (the modern villa: flat
   *  roofs, stacked volumes, glass, pool), so EVERY house type opts in — the classic
   *  included, whose variety comes from its own seeded shell (windows/corners/roof/
   *  chimney vary per seed), not from free-form. Free-form remains the path when no
   *  structure is selected at all (omit → no shell seed).
   *
   *  Every seeded shell is also LOCKED: a compile pass (`preserveShell`) restores any
   *  shell cell the model deleted (turned to air), so the AI can't gut the exterior. The
   *  model may still redecorate (solid→solid), glaze walls and furnish the interior; it
   *  just can't leave a hole where the shell put structure. (There used to be a separate
   *  opt-in `lockShell` flag with gothic the only locked type — the unlocked-seed
   *  experiment failed: the model emits furniture-only deltas, "keeping" the seeded
   *  exterior by not re-emitting it, and the whole shell vanishes.) */
  seedShell?: boolean;
  /** Optional system-prompt fragment (wired into the generator prompt later). */
  prompt?: string;
}
