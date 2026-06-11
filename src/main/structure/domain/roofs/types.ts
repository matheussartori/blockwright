// The Roof contract (category "roof"). A roof module caps a host structure's wall
// box with a particular roof typology (gable, hip, mansard, …). It extends the shared
// `GeometryModule` build shape (params/defaults/build/integrations) and only narrows
// `category` + `appliesTo`; `category` is always `'roof'`.
//
// A roof carries GENERIC geometry in `build()` (works on any host) plus optional
// HOST-SPECIFIC extras in `integrations` (e.g. house-only gable-end vents). It's run by
// `composeModule` — both for the gallery preview AND when a structure type DELEGATES its
// own roof to the module (the house does; see CLAUDE.md "Composable generation domain").
import type { GeometryModule } from '../geometry-module';

export interface RoofModule extends GeometryModule {
  category: 'roof';
  /** The structure-type ids this roof pairs with — REQUIRED (narrows ModuleMeta's optional
   *  `appliesTo`): a roof must explicitly say which structures it fits, never silently apply
   *  to all. A growing list — start with `['house']`, add e.g. `'tower'` to reuse it there. */
  appliesTo: string[];
}
