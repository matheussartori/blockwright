// The Basement contract (category "basement"). A basement module builds a sunken
// undercroft — its massing expressed in roles, like a structure type. The contract
// mirrors StructureType's build shape so basements reuse the same role palette + params
// machinery; `category` is always `'basement'`.
//
// A basement module is the SINGLE source of below-grade geometry: run via `composeModule`
// for the gallery preview AND when a structure type delegates its below-grade level (the
// house delegates to `cellar`). See CLAUDE.md "Composable generation domain".
import type { AuthoringOp } from '../../authoring/types';
import type { ModuleMeta } from '../modules';
import type { ParamSpec } from '../params';
import type { Role } from '../roles';
import type { BuildArgs } from '../structure-types/types';

export interface BasementModule extends ModuleMeta {
  category: 'basement';
  /** The structure-type ids this basement pairs with — REQUIRED (narrows ModuleMeta's
   *  optional `appliesTo`): a basement must explicitly say which structures it fits, never
   *  silently apply to all. A growing list — e.g. a future `tower` can have a `crypt` by
   *  adding `'tower'` here (`['house', 'tower']`). */
  appliesTo: string[];
  /** Shape/behaviour params (decay, shape, …). Block choices come from the decoration.
   *  Optional: a metadata-only basement (guidance + knowledge guide, no geometry) omits it. */
  params?: ParamSpec;
  /** This module's default block per role — its material "kit". Optional for a
   *  metadata-only basement. */
  defaults?: Partial<Record<Role, string>>;
  /** GENERIC massing as volumetric ops in terms of roles — runs on ANY host. Optional
   *  until the basement gains code geometry (a metadata-only basement omits it and rides
   *  in as guidance). */
  build?(args: BuildArgs): AuthoringOp[];
  /** HOST-SPECIFIC extra geometry, keyed by structure-type id (e.g. `house`): extra ops
   *  layered on top of `build()` only when the basement sits under that structure.
   *  `args.host` is the same id. Keys should be a subset of `appliesTo`. Optional. */
  integrations?: Partial<Record<string, (args: BuildArgs) => AuthoringOp[]>>;
}
