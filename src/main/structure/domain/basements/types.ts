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
  /** Shape/behaviour params (decay, shape, …). Block choices come from the decoration. */
  params: ParamSpec;
  /** This module's default block per role — its material "kit". */
  defaults: Partial<Record<Role, string>>;
  /** Emit the massing as volumetric ops in terms of roles. */
  build(args: BuildArgs): AuthoringOp[];
}
