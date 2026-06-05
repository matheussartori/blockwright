// The Decoration contract (category "decoration"). A decoration is the "look": it
// maps semantic roles to concrete blocks (sparsely — unmapped roles fall through to
// the structure type's kit / base defaults), sets a decay level, and weathers blocks
// for decay patches. Decorations are curated, so their block ids are trusted (not
// re-validated against the content pack — only per-op overrides are). It carries the
// shared module metadata; `category` is always `'decoration'`.
import type { AuthoringOp } from '../../authoring/types';
import type { ModuleMeta } from '../modules';
import type { Role } from '../roles';
import type { BuildArgs } from '../structure-types/types';

export interface Decoration extends ModuleMeta {
  category: 'decoration';
  /** Role→block overrides for this look. Sparse: a role the decoration omits falls
   *  back to the structure type's `defaults`, then to BASE_BLOCKS. */
  blocks: Partial<Record<Role, string>>;
  /** Default decay/ruin level (0..1) when the op doesn't pass `decay` explicitly. */
  decay?: number;
  /** Map a block id to its weathered variant (moss, cracks…) for decay patches.
   *  Identity if omitted. */
  weather?(blockId: string): string;
  /** Furniture/decoration ops for a built shell. EXTENSION POINT — not yet invoked
   *  by the compiler (interiors still come from the AI + authoring passes); defined
   *  so decorations can grow into it without a contract change. */
  furnish?(args: BuildArgs): AuthoringOp[];
  /** Optional system-prompt fragment (wired into the generator prompt later). */
  prompt?: string;
}

/** @deprecated Use {@link Decoration}. Kept as an alias during the themes→decorations
 *  rename so older imports keep compiling. */
export type DecorationTheme = Decoration;
