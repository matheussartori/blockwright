// The Exterior contract (category "exterior"). An exterior module is the house's
// EXTERIOR FINISHING STYLE — not the surroundings, but the outside cladding, trim,
// roof colour, window treatment, AND the signature exterior VOLUMES a style adds (a
// gothic spire, a sakura covered balcony, a farmhouse cross-gable). It pairs with the
// PITCHED house types (classic/cabin/l-shaped), never the modern villa (which gets its
// own exterior styles later). `category` is always `'exterior'`.
//
// An exterior has two layers, like a roof module:
//  1. A `skin` — a role→block OVERLAY merged OVER the decoration, so the style's
//     materials (a dark slate roof, pink cherry cladding, blackened stone) read no
//     matter which decoration the user also picked. This re-skins the host TYPE's
//     massing too (the roof op, the walls), since it's resolved into the same palette.
//  2. Optional `build()` geometry — additive exterior volumes layered over the host's
//     full envelope box AFTER the structure type's massing (later ops overwrite). It
//     runs on any host; host-specific extras ride in `integrations[host]`.
//
// Unlike a roof/basement, an exterior is NOT delegated by a structure type — the
// compose layer applies the SELECTED exterior to the type's build (skin + appended
// geometry) when a `template` op (or the gallery preview) names one via `exterior:<id>`.
// On a free-form AI build the exterior rides in as guidance + its own knowledge guide.
import type { AuthoringOp } from '../../authoring/types';
import type { ModuleMeta } from '../modules';
import type { ParamSpec } from '../params';
import type { Role } from '../roles';
import type { BuildArgs } from '../structure-types/types';

export interface ExteriorModule extends ModuleMeta {
  category: 'exterior';
  /** The structure-type ids this exterior style pairs with — REQUIRED (narrows
   *  ModuleMeta's optional `appliesTo`). The pitched houses only — `['classic', 'cabin',
   *  'l-shaped']` — NOT modern (the flat-roofed villa gets its own styles later). */
  appliesTo: string[];
  /** Role→block re-skin OVERLAY, resolved ABOVE the decoration (override > skin >
   *  decoration > type defaults > BASE). This is how a style forces its own cladding /
   *  roof colour / window block regardless of the decoration the user also picked. */
  skin?: Partial<Record<Role, string>>;
  /** Shape/behaviour params (which signature volume to add, etc.). Optional. */
  params?: ParamSpec;
  /** Block kit per role, a fallback consulted under the decoration like a type's kit.
   *  Most exteriors carry their materials in `skin` instead. Optional. */
  defaults?: Partial<Record<Role, string>>;
  /** GENERIC additive exterior geometry over the host's full envelope box — run AFTER
   *  the structure type's massing (so later ops overwrite). Works on any host; keep it
   *  WITHIN the box and guard small footprints. Optional (a skin-only style omits it). */
  build?(args: BuildArgs): AuthoringOp[];
  /** HOST-SPECIFIC extra geometry, keyed by structure-type id. Keys should be a subset
   *  of `appliesTo`. Optional. */
  integrations?: Partial<Record<string, (args: BuildArgs) => AuthoringOp[]>>;
}
