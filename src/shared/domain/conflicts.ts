// Pure domain predicate shared by BOTH processes. A module can declare
// `incompatibleWith` — the ids of modules it cannot combine with (e.g. an attic
// declares `['flat']` because a flat roof leaves no roof void to occupy). The link is
// symmetric in MEANING, so resolution checks BOTH directions: two modules conflict when
// EITHER lists the other. Only one side strictly needs the declaration, but both may
// carry it for clarity. The renderer uses this to dim/disable the conflicting pick in the
// gallery + Details; keeping ONE implementation here (no Node/electron) means the two
// sides can never silently disagree about what "clashes".

/** A minimal module shape for conflict resolution: an id and its optional
 *  `incompatibleWith` list. Both `ModuleSummary` (main) and `GenerationModule`
 *  (renderer) satisfy it. */
export interface ConflictLike {
  id: string;
  incompatibleWith?: string[];
}

/**
 * Do two modules conflict (cannot be selected together)?
 *
 * @param a - One module (id + optional `incompatibleWith`).
 * @param b - The other module.
 * @returns `true` when either module lists the other's id in `incompatibleWith`.
 *   A module never conflicts with itself.
 */
export function modulesConflict(a: ConflictLike, b: ConflictLike): boolean {
  if (a.id === b.id) return false;
  return !!a.incompatibleWith?.includes(b.id) || !!b.incompatibleWith?.includes(a.id);
}
