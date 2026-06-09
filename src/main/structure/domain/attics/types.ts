// The Attic contract (category "attic"). An attic module floors the void UNDER a pitched
// roof into a usable loft — a rough storage loft or a finished bedroom. It mirrors the
// build shape of the roof/basement contracts; `category` is always `'attic'`.
//
// An attic lives in the roof void, so it only pairs with PITCHED-roof structures and is
// INCOMPATIBLE with the `flat` roof (declared via `incompatibleWith`). It carries GENERIC
// geometry in `build()` (the attic floor + light over the host's roof-void box, run on any
// host) plus optional host-specific extras. Run by `composeModule` — when a structure type
// DELEGATES its attic to the module (the classic house does).
import type { AuthoringOp } from '../../authoring/types';
import type { ModuleMeta } from '../modules';
import type { ParamSpec } from '../params';
import type { Role } from '../roles';
import type { BuildArgs } from '../structure-types/types';

export interface AtticModule extends ModuleMeta {
  category: 'attic';
  /** The structure-type ids this attic pairs with — REQUIRED (narrows ModuleMeta's optional
   *  `appliesTo`). Pitched-roof houses only; start with `['classic']`, add ids to reuse it. */
  appliesTo: string[];
  /** Module ids this attic cannot combine with — every attic conflicts with the `flat`
   *  roof (no roof void). Narrowed to required so an attic must always declare it. */
  incompatibleWith: string[];
  /** Shape/behaviour params (optional — most attics are geometry-light). */
  params?: ParamSpec;
  /** Block kit per role, so the attic reads right even under a sparse decoration. Optional. */
  defaults?: Partial<Record<Role, string>>;
  /** GENERIC attic geometry over the host's roof-void box — the floor + a light. The box's
   *  `y0` is the attic FLOOR plane (the wall top), rising to the ridge. Optional. */
  build?(args: BuildArgs): AuthoringOp[];
  /** HOST-SPECIFIC extra geometry, keyed by structure-type id. Optional. */
  integrations?: Partial<Record<string, (args: BuildArgs) => AuthoringOp[]>>;
}
