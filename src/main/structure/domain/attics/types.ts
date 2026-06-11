// The Attic contract (category "attic"). An attic module floors the void UNDER a pitched
// roof into a usable loft — a rough storage loft or a finished bedroom. It extends the
// shared `GeometryModule` build shape and narrows `category` + `appliesTo` + adds the
// required `incompatibleWith`; `category` is always `'attic'`.
//
// An attic lives in the roof void, so it only pairs with PITCHED-roof structures and is
// INCOMPATIBLE with the `flat` roof (declared via `incompatibleWith`). It carries GENERIC
// geometry in `build()` (the attic floor + light over the host's roof-void box, run on any
// host) plus optional host-specific extras. Run by `composeModule` — when a structure type
// DELEGATES its attic to the module (the classic house does).
import type { GeometryModule } from '../geometry-module';

export interface AtticModule extends GeometryModule {
  category: 'attic';
  /** The structure-type ids this attic pairs with — REQUIRED (narrows ModuleMeta's optional
   *  `appliesTo`). Pitched-roof houses only; start with `['classic']`, add ids to reuse it. */
  appliesTo: string[];
  /** Module ids this attic cannot combine with — every attic conflicts with the `flat`
   *  roof (no roof void). Narrowed to required so an attic must always declare it. */
  incompatibleWith: string[];
}
