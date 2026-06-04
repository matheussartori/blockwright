// The StructureType contract + the shared helpers its builders use. A type owns
// only the MASSING (shell, openings, structural detail), expressed in terms of
// semantic roles; the theme supplies the concrete blocks. A type also ships a
// `defaults` kit (sensible block per role) so it looks right even under a sparse
// theme, and a `params` spec declaring its shape/behaviour knobs.
import type { AuthoringOp } from '../../authoring/types';
import type { ParamSpec, ParamValues } from '../params';
import type { Role } from '../roles';

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
 *  in terms of roles; `compose` has already resolved the theme, params, and seed. */
export interface BuildArgs {
  box: Box;
  params: ParamValues;
  palette: RolePalette;
  /** Stable per-build seed (explicit `seed` param, else derived from the box). */
  seed: number;
}

/** A buildable structure archetype (house, basement, …). Behaviour-only: it never
 *  names concrete blocks, so any type composes with any theme. */
export interface StructureType {
  id: string;
  label: string;
  /** Shape/behaviour params (floors, decay, …). Block choices come from the theme. */
  params: ParamSpec;
  /** This type's default block per role — its material "kit", overridable by the
   *  theme and by per-op role params. */
  defaults: Partial<Record<Role, string>>;
  /** Emit the massing as volumetric ops in terms of roles. */
  build(args: BuildArgs): AuthoringOp[];
  /** Optional system-prompt fragment (wired into the generator prompt later). */
  prompt?: string;
}
