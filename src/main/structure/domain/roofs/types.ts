// The Roof contract (category "roof"). A roof module caps a host structure's wall
// box with a particular roof typology (gable, hip, mansard, …). The contract mirrors
// the build shape of the other categories; `category` is always `'roof'`.
//
// NOTE: roofs are SCAFFOLDED but not yet wired into `composeStructure` — structure
// types currently emit their own `roof` op. The registry is empty until the first
// roof module lands.
import type { AuthoringOp } from '../../authoring/types';
import type { ModuleMeta } from '../modules';
import type { ParamSpec } from '../params';
import type { BuildArgs } from '../structure-types/types';

export interface RoofModule extends ModuleMeta {
  category: 'roof';
  /** Shape/behaviour params (pitch, overhang, …). Block choices come from the decoration. */
  params: ParamSpec;
  /** Emit the roof as volumetric ops over the host's wall box. */
  build(args: BuildArgs): AuthoringOp[];
}
