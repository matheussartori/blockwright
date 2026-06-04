// The DecorationTheme contract. A theme is the "look": it maps semantic roles to
// concrete blocks (sparsely — unmapped roles fall through to the type's kit / base
// defaults), sets a decay level, and weathers blocks for decay patches. Themes are
// curated, so their block ids are trusted (not re-validated against the content
// pack — only per-op overrides are).
import type { AuthoringOp } from '../../authoring/types';
import type { Role } from '../roles';
import type { BuildArgs } from '../structure-types/types';

export interface DecorationTheme {
  id: string;
  label: string;
  /** Role→block overrides for this look. Sparse: a role the theme omits falls back
   *  to the structure type's `defaults`, then to BASE_BLOCKS. */
  blocks: Partial<Record<Role, string>>;
  /** Default decay/ruin level (0..1) when the op doesn't pass `decay` explicitly. */
  decay?: number;
  /** Map a block id to its weathered variant (moss, cracks…) for decay patches.
   *  Identity if omitted. */
  weather?(blockId: string): string;
  /** Furniture/decoration ops for a built shell. EXTENSION POINT for "decoration
   *  types" — not yet invoked by the compiler (interiors still come from the AI +
   *  authoring passes); defined so themes can grow into it without a contract change. */
  furnish?(args: BuildArgs): AuthoringOp[];
  /** Optional system-prompt fragment (wired into the generator prompt later). */
  prompt?: string;
}
