// The Roof contract (category "roof"). A roof module caps a host structure's wall
// box with a particular roof typology (gable, hip, mansard, …). The contract mirrors
// the build shape of the other categories; `category` is always `'roof'`.
//
// A roof carries GENERIC geometry in `build()` (works on any host) plus optional
// HOST-SPECIFIC extras in `integrations` (e.g. house-only gable-end vents). It's run by
// `composeModule` (gallery preview today; structure-type delegation later). Structure
// types still emit their own roof for now — see CLAUDE.md "Composable generation domain".
import type { AuthoringOp } from '../../authoring/types';
import type { ModuleMeta } from '../modules';
import type { ParamSpec } from '../params';
import type { Role } from '../roles';
import type { BuildArgs } from '../structure-types/types';

export interface RoofModule extends ModuleMeta {
  category: 'roof';
  /** Shape/behaviour params (pitch, overhang, …). Block choices come from the decoration.
   *  Optional: a metadata-only roof (guidance + knowledge guide, no geometry yet) omits it. */
  params?: ParamSpec;
  /** Block kit per role (e.g. `roof` → a `*_stairs`), so the roof reads right even under
   *  a sparse decoration. Overridden by the decoration and per-op role params. Optional. */
  defaults?: Partial<Record<Role, string>>;
  /** GENERIC roof geometry over the host's wall box — runs on ANY host. Optional until
   *  the roof gains code geometry (a metadata-only roof omits it and rides in as guidance). */
  build?(args: BuildArgs): AuthoringOp[];
  /** HOST-SPECIFIC extra geometry, keyed by structure-type id (e.g. `house`): extra ops
   *  layered on top of `build()` only when the roof sits on that structure (so a roof can
   *  carry generic shape PLUS details that only make sense on a house). `args.host` is the
   *  same id. Keys should be a subset of `appliesTo`. Optional. */
  integrations?: Partial<Record<string, (args: BuildArgs) => AuthoringOp[]>>;
}
