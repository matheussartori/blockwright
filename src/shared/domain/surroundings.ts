// The SURROUNDINGS ring's footprint math, shared by BOTH processes (pure, no Node/
// electron) so the renderer's size math and the main-side compose layer can never
// drift: the user's W×D in the composer is the BUILDING SHELL, and a picked
// surroundings module grows the compiled box around it by these margins — the front
// gets the most (the pool + entry approach live there), the sides and back enough
// for hedges and planting. One table, keyed by surroundings-module id, consumed by
// `effectiveSize`'s expansion (renderer) and the structure type's house-box inset
// (main), so the yard the composer promises is exactly the ring the shell lays.

/** The cells a surroundings ring adds around the building shell, per side. `front`
 *  is the entry face (the house's -z face, where the door + pool terrace go). */
export interface SurroundMargins {
  front: number;
  back: number;
  side: number;
}

/** Ring margins per surroundings-module id. Adding a surroundings module with its
 *  own footprint = one entry here (the geometry file imports the same constants). */
export const SURROUND_MARGINS: Record<string, SurroundMargins> = {
  modern: { front: 8, back: 4, side: 4 },
  // The cottage homestead yard is deliberately ROOMY — the front holds the showcase
  // (fountain/well + parterre beside the entry walk), the back holds the crop plots.
  garden: { front: 9, back: 7, side: 7 },
};

/** The margins for a picked surroundings module, or null for none/'none'/unknown.
 *  @param id - The surroundings-module id ('' / 'none' / undefined = no ring).
 *  @returns The ring's {@link SurroundMargins}, or null when no ring applies. */
export function surroundMargins(id: string | undefined | null): SurroundMargins | null {
  if (!id || id === 'none') return null;
  return SURROUND_MARGINS[id] ?? null;
}

/** Expand a building-shell footprint by the selected surroundings ring (identity when
 *  none is picked). Height never changes — the ring is ground-level landscaping.
 *  @param w - Shell width (x).
 *  @param d - Shell depth (z).
 *  @param id - The surroundings-module id, or undefined/'none'.
 *  @returns The compiled build box's footprint `{ w, d }`. */
export function expandSizeForSurroundings(w: number, d: number, id?: string | null): { w: number; d: number } {
  const m = surroundMargins(id);
  if (!m) return { w, d };
  return { w: w + m.side * 2, d: d + m.front + m.back };
}
