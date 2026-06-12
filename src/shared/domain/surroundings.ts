// The SURROUNDINGS ring's footprint math, shared by BOTH processes (pure, no Node/
// electron) so the renderer's size math and the main-side compose layer can never
// drift: the user's W×D in the composer is the BUILDING SHELL, and a picked
// surroundings module grows the compiled box around it by margins that SCALE with the
// house — a cottage gets a snug yard, a mansion gets grounds — the front getting the
// most (the pool + entry approach live there), the sides and back enough for hedges
// and planting. One table, keyed by surroundings-module id, consumed by
// `effectiveSize`'s expansion (renderer) and the structure type's house-box inset
// (main), so the yard the composer promises is exactly the ring the shell lays.

/** The cells a surroundings ring adds around the building shell, per side. `front`
 *  is the entry face (the house's -z face, where the door + pool terrace go). */
export interface SurroundMargins {
  front: number;
  back: number;
  side: number;
}

/** How a ring's margins scale with the building shell: `base` at/below the reference
 *  footprint, growing toward `max` as the house grows (see {@link surroundMargins}). */
export interface SurroundScale {
  base: SurroundMargins;
  max: SurroundMargins;
}

/** Shell extent (cells, per axis) at/below which a margin stays at its base. */
const GROW_REF = 14;
/** Shell cells beyond {@link GROW_REF} that buy one extra margin cell. */
const GROW_PER = 4;

/** Ring scaling per surroundings-module id. Adding a surroundings module with its
 *  own footprint = one entry here (the geometry file derives the same margins from
 *  the compiled box via {@link surroundMarginsForOuter}). */
export const SURROUND_SCALE: Record<string, SurroundScale> = {
  modern: {
    base: { front: 8, back: 4, side: 4 },
    max: { front: 13, back: 8, side: 8 },
  },
  // The cottage homestead yard is deliberately ROOMY — the front holds the showcase
  // (fountain/well + parterre beside the entry walk), the back holds the crop plots.
  garden: {
    base: { front: 9, back: 7, side: 7 },
    max: { front: 14, back: 11, side: 11 },
  },
};

/** One margin scaled to a shell extent: the base, +1 cell per {@link GROW_PER} shell
 *  cells beyond {@link GROW_REF}, capped at the module's max. */
const grown = (base: number, cap: number, extent: number): number =>
  Math.min(cap, base + Math.max(0, Math.floor((extent - GROW_REF) / GROW_PER)));

/** The ring margins for a picked surroundings module around a given BUILDING SHELL,
 *  or null for none/'none'/unknown. The side margins scale with the shell's width,
 *  front/back with its depth — the bigger the house, the bigger the yard.
 *  @param id - The surroundings-module id ('' / 'none' / undefined = no ring).
 *  @param shellW - The building shell's width (x cells).
 *  @param shellD - The building shell's depth (z cells).
 *  @returns The ring's {@link SurroundMargins}, or null when no ring applies. */
export function surroundMargins(
  id: string | undefined | null,
  shellW: number,
  shellD: number,
): SurroundMargins | null {
  if (!id || id === 'none') return null;
  const s = SURROUND_SCALE[id];
  if (!s) return null;
  return {
    side: grown(s.base.side, s.max.side, shellW),
    front: grown(s.base.front, s.max.front, shellD),
    back: grown(s.base.back, s.max.back, shellD),
  };
}

/** Expand a building-shell footprint by the selected surroundings ring (identity when
 *  none is picked). Height never changes — the ring is ground-level landscaping.
 *  @param w - Shell width (x).
 *  @param d - Shell depth (z).
 *  @param id - The surroundings-module id, or undefined/'none'.
 *  @returns The compiled build box's footprint `{ w, d }`. */
export function expandSizeForSurroundings(w: number, d: number, id?: string | null): { w: number; d: number } {
  const m = surroundMargins(id, w, d);
  if (!m) return { w, d };
  return { w: w + m.side * 2, d: d + m.front + m.back };
}

/** Recover the shell extent inside an outer extent: margins are monotone in the shell,
 *  so `shell + reserve(shell)` is injective and a box produced by
 *  {@link expandSizeForSurroundings} has exactly one preimage — found by scanning the
 *  (small) candidate range. A box that didn't come from the expansion (an arbitrary
 *  preview size) resolves to the closest candidate, preferring the larger shell. */
function shellWithin(outer: number, minReserve: number, maxReserve: number, reserve: (shell: number) => number): number {
  let best = Math.max(1, outer - maxReserve);
  let bestErr = Infinity;
  for (let cand = best; cand <= Math.max(1, outer - minReserve); cand++) {
    const err = Math.abs(cand + reserve(cand) - outer);
    if (err <= bestErr) {
      best = cand;
      bestErr = err;
    }
  }
  return best;
}

/** The ring margins as derived from the COMPILED (already expanded) box — the exact
 *  inverse of {@link expandSizeForSurroundings}: the shell footprint is recovered from
 *  the outer extents, then the margins are the ones that shell earns. The main-side
 *  house inset AND the module geometry both call this with the same box, so the two
 *  always agree on where the house ends and the yard begins.
 *  @param id - The surroundings-module id ('' / 'none' / undefined = no ring).
 *  @param outerW - The compiled box's width (x cells).
 *  @param outerD - The compiled box's depth (z cells).
 *  @returns The ring's {@link SurroundMargins}, or null when no ring applies. */
export function surroundMarginsForOuter(
  id: string | undefined | null,
  outerW: number,
  outerD: number,
): SurroundMargins | null {
  if (!id || id === 'none') return null;
  const s = SURROUND_SCALE[id];
  if (!s) return null;
  const w = shellWithin(outerW, s.base.side * 2, s.max.side * 2, (shell) =>
    grown(s.base.side, s.max.side, shell) * 2);
  const d = shellWithin(outerD, s.base.front + s.base.back, s.max.front + s.max.back, (shell) =>
    grown(s.base.front, s.max.front, shell) + grown(s.base.back, s.max.back, shell));
  return surroundMargins(id, w, d);
}
