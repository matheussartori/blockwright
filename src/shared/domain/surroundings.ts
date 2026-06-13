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

/** An EXPLICIT per-side cell-margin override for the surroundings ring — the composer's
 *  manual yard-size control. When set it REPLACES the auto-derived margins entirely (the
 *  user sizes the yard by hand): `side` cells on each X side, `front` on the -z entry face,
 *  `back` on the +z. `null`/absent = the auto, footprint-scaled ring. Threaded from the
 *  composer into both processes (the user's W×D is still the building shell). */
export interface SurroundSizing {
  side: number;
  front: number;
  back: number;
}

/** The cell range each yard margin can take in the composer (and main clamps to), plus the
 *  stepper increment — the manual control nudges by whole 2-cell steps. */
export const SURROUND_MARGIN_MIN = 2;
export const SURROUND_MARGIN_MAX = 32;
export const SURROUND_MARGIN_STEP = 2;

const clampMargin = (v: number): number =>
  Math.min(SURROUND_MARGIN_MAX, Math.max(SURROUND_MARGIN_MIN, Math.round(Number.isFinite(v) ? v : SURROUND_MARGIN_MIN)));

/** Normalize a (possibly partial/garbage) override into clamped per-side cell margins. */
export function clampSurroundSizing(s: Partial<SurroundSizing> | null | undefined): SurroundSizing {
  return {
    side: clampMargin(s?.side ?? SURROUND_MARGIN_MIN),
    front: clampMargin(s?.front ?? SURROUND_MARGIN_MIN),
    back: clampMargin(s?.back ?? SURROUND_MARGIN_MIN),
  };
}

/** Read a raw param value (e.g. off a `template` op or a build selection) into a clamped
 *  {@link SurroundSizing} override, or undefined when absent — so the caller keeps the auto
 *  ring semantics ("no override" === the auto, footprint-scaled margins). */
export function sanitizeSurroundSizing(raw: unknown): SurroundSizing | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const r = raw as Record<string, unknown>;
  if (![r.side, r.front, r.back].some((v) => typeof v === 'number')) return undefined;
  return clampSurroundSizing(r as Partial<SurroundSizing>);
}

/** The effective ring margins for a shell: the user's explicit cell override when set,
 *  else the auto, footprint-scaled {@link surroundMargins}. The single resolver both the
 *  renderer (preview/box growth) and main (house inset, module geometry) call.
 *  @param id - The surroundings-module id.
 *  @param shellW - The building shell's width (x cells).
 *  @param shellD - The building shell's depth (z cells).
 *  @param override - The user's explicit per-side cell margins, or undefined for the auto ring.
 *  @returns The effective {@link SurroundMargins}, or null when no ring applies. */
export function resolveSurroundMargins(
  id: string | undefined | null,
  shellW: number,
  shellD: number,
  override?: SurroundSizing | null,
): SurroundMargins | null {
  if (!id || id === 'none' || !SURROUND_SCALE[id]) return null;
  if (override) return clampSurroundSizing(override);
  return surroundMargins(id, shellW, shellD);
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
  // The gothic graveyard grounds are GRAND — by design at least ~4× the garden/modern
  // ring in both x and z (a spacious cemetery the eye reads as an estate), and heavily
  // FRONT-weighted: the long approach holds the gate, the headstone rows, the ruined
  // colonnade and the weeping tree, while the rear keeps a crypt and rubble. Only the
  // gothic manor hosts it (see graveyard.ts `appliesTo`).
  graveyard: {
    base: { front: 40, back: 24, side: 28 },
    max: { front: 52, back: 32, side: 36 },
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
 *  none is picked). Honours the user's explicit margin override when set. Height never
 *  changes — the ring is ground-level landscaping.
 *  @param w - Shell width (x).
 *  @param d - Shell depth (z).
 *  @param id - The surroundings-module id, or undefined/'none'.
 *  @param override - The user's explicit per-side cell margins, or undefined for the auto ring.
 *  @returns The compiled build box's footprint `{ w, d }`. */
export function expandSizeForSurroundings(
  w: number,
  d: number,
  id?: string | null,
  override?: SurroundSizing | null,
): { w: number; d: number } {
  const m = resolveSurroundMargins(id, w, d, override);
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

/** The ring margins as derived from the COMPILED (already expanded) box. With a user
 *  OVERRIDE the margins are exactly that override (the box was grown by it, so the house is
 *  `outer − override`); otherwise it's the exact inverse of the AUTO expansion — the shell
 *  footprint is recovered from the outer extents, then the margins are the ones that shell
 *  earns. The main-side house inset AND the module geometry both call this with the same box
 *  + override, so the two always agree on where the house ends and the yard begins.
 *  @param id - The surroundings-module id ('' / 'none' / undefined = no ring).
 *  @param outerW - The compiled box's width (x cells).
 *  @param outerD - The compiled box's depth (z cells).
 *  @param override - The user's explicit per-side cell margins, or undefined for the auto ring.
 *  @returns The ring's {@link SurroundMargins}, or null when no ring applies. */
export function surroundMarginsForOuter(
  id: string | undefined | null,
  outerW: number,
  outerD: number,
  override?: SurroundSizing | null,
): SurroundMargins | null {
  if (!id || id === 'none') return null;
  const s = SURROUND_SCALE[id];
  if (!s) return null;
  // An explicit override is the margins directly — no inversion needed (the renderer grew
  // the box by exactly these, so subtracting them recovers the building shell).
  if (override) return clampSurroundSizing(override);
  const w = shellWithin(outerW, s.base.side * 2, s.max.side * 2, (shell) =>
    grown(s.base.side, s.max.side, shell) * 2);
  const d = shellWithin(outerD, s.base.front + s.base.back, s.max.front + s.max.back, (shell) =>
    grown(s.base.front, s.max.front, shell) + grown(s.base.back, s.max.back, shell));
  return surroundMargins(id, w, d);
}
