// The Surroundings contract (category "surroundings"). A surroundings module lands a
// GROUND-LEVEL ring of landscaping OUTSIDE the building shell — pool, entry approach,
// hedges, planting — over the margin the build box reserves around the house footprint
// (see `shared/domain/surroundings.ts`: the user's W×D is the SHELL; the ring grows the
// compiled box beyond it). It extends the shared `GeometryModule` build shape
// (params/defaults/build/integrations) and only narrows `category` + `appliesTo`.
//
// Run by `composeModule` when a structure type DELEGATES its yard (the modern villa
// does): the TYPE owns placement (it insets its massing and hands over the full box),
// the module owns the ring's geometry. Like a basement, a surroundings module keeps its
// OWN material kit over the decoration (a lawn stays a lawn under any look).
import type { GeometryModule } from '../geometry-module';

export interface SurroundingsModule extends GeometryModule {
  category: 'surroundings';
  /** The structure-type ids this ring pairs with — REQUIRED (narrows ModuleMeta's
   *  optional `appliesTo`): a yard is composed around a specific massing (its entry
   *  face, its door), so it must explicitly say which structures it fits. A growing
   *  list — start with `['modern']`, add ids as more types learn to inset for it. */
  appliesTo: string[];
}
