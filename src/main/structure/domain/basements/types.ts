// The Basement contract (category "basement"). A basement module builds a sunken
// undercroft — its massing expressed in roles, like a structure type. It extends the
// shared `GeometryModule` build shape (params/defaults/build/integrations) and only
// narrows `category` + `appliesTo`; `category` is always `'basement'`.
//
// A basement module is the SINGLE source of below-grade geometry: run via `composeModule`
// for the gallery preview AND when a structure type delegates its below-grade level (the
// house delegates to `cellar`). See CLAUDE.md "Composable generation domain".
import type { GeometryModule } from '../geometry-module';

export interface BasementModule extends GeometryModule {
  category: 'basement';
  /** The structure-type ids this basement pairs with — REQUIRED (narrows ModuleMeta's
   *  optional `appliesTo`): a basement must explicitly say which structures it fits, never
   *  silently apply to all. A growing list — e.g. a future `tower` can have a `crypt` by
   *  adding `'tower'` here (`['house', 'tower']`). */
  appliesTo: string[];
}
