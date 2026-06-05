// The Basement contract (category "basement"). A basement module builds a sunken
// undercroft — its massing expressed in roles, like a structure type — that will
// later attach beneath a host structure. The contract mirrors StructureType's build
// shape so basements reuse the same role palette + params machinery; `category` is
// always `'basement'`.
//
// NOTE: basements are SCAFFOLDED but not yet wired into `composeStructure` — the
// registry seeds a module (see basement.ts) for the future "modular basement" work.
import type { AuthoringOp } from '../../authoring/types';
import type { ModuleMeta } from '../modules';
import type { ParamSpec } from '../params';
import type { Role } from '../roles';
import type { BuildArgs } from '../structure-types/types';

export interface BasementModule extends ModuleMeta {
  category: 'basement';
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
