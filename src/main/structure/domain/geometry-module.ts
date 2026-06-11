// The shape shared by every GEOMETRY-bearing module category (roof / basement / attic):
// a `ModuleMeta` plus the four optional build hooks (`params`/`defaults`/`build`/
// `integrations`). The three category contracts (RoofModule/BasementModule/AtticModule)
// all extend this and only narrow `category` + `appliesTo`, so the common build shape
// lives ONCE here instead of being re-declared identically three times — and the
// category dispatch (`getGeometryModule`) can be typed against it.
import type { AuthoringOp } from '../authoring/types';
import type { ModuleMeta } from './modules';
import type { ParamSpec } from './params';
import type { Role } from './roles';
import type { BuildArgs } from './structure-types/types';

/** A module that can emit geometry through the compose layer (run by `composeModule`).
 *  Every field is optional: a metadata-only module (guidance + a knowledge guide, no code
 *  geometry yet) declares none of them and rides in as plain-language guidance. */
export interface GeometryModule extends ModuleMeta {
  /** Shape/behaviour params (pitch, shape, decay, …). Block choices come from the decoration. */
  params?: ParamSpec;
  /** Default block per role — the module's material "kit", so it reads right even under a
   *  sparse decoration. Overridden by the decoration and per-op role params. */
  defaults?: Partial<Record<Role, string>>;
  /** GENERIC geometry over the build box — runs on ANY host. */
  build?(args: BuildArgs): AuthoringOp[];
  /** HOST-SPECIFIC extra geometry, keyed by structure-type id: ops layered on top of
   *  `build()` only when the module is applied to that structure (`args.host` matches). */
  integrations?: Partial<Record<string, (args: BuildArgs) => AuthoringOp[]>>;
}
