// The canonical STOREY LADDER — the one place a storeyed build's vertical split is
// computed. Shared by BOTH processes (pure, no Node/electron) so the renderer's size
// math (`generation/brief.ts`) and the main-side structure types (`structure/domain/
// structure-types/*`) can never drift: the total height the composer promises is
// exactly what the shell consumes.
//
// Heights are SLAB-TO-SLAB (deck-to-deck) storey heights in cells — the same scale as
// the legacy per-type `storeyH` (a height of 5 = 4 clear interior cells + the slab).
// `planStoreys` honours the user's explicit per-floor heights when given (clamped to
// fit the box, preserving their RATIO), else falls back to the legacy uniform split —
// so every structure type that consumes the ladder gets the per-floor rule for free.

/** Hard structural floor for a slab-to-slab storey (2 clear interior cells + the slab).
 *  Only the shrink-to-fit paths may go this low — a box that physically can't give every
 *  storey {@link MIN_FLOOR_H} compromises down to this instead of overflowing. */
export const MIN_STOREY_H = 3;
/** THE RULE: every floor is at least 5 blocks slab-to-slab (4 clear cells + the slab).
 *  Every input path — the composer's per-floor fields, sanitized authoring heights, the
 *  uniform auto split — enforces it; only {@link MIN_STOREY_H} sits below as the
 *  impossible-box safety valve. */
export const MIN_FLOOR_H = 5;
/** Largest slab-to-slab storey height the composer accepts. */
export const MAX_STOREY_H = 32;
/** The neutral storey height used when nothing better is known. */
export const DEFAULT_STOREY_H = 5;
/** Height of the below-grade basement level a storeyed box reserves (see {@link heightOverhead}). */
export const BASEMENT_OVERHEAD = 5;
/** The neutral height of one below-grade basement LEVEL when the user hasn't sized it
 *  (the default per-level depth of the multi-level basement). */
export const DEFAULT_BASEMENT_H = BASEMENT_OVERHEAD;
/** The deepest a basement may be dug — the composer caps the level count here so the box
 *  height stays sane and generation stays reliable. */
export const MAX_BASEMENT_LEVELS = 4;
/** In-roof attic headroom a storeyed box reserves (see {@link heightOverhead}). */
export const ATTIC_OVERHEAD = 2;

/** Inputs for {@link planStoreys}. */
export interface StoreySpec {
  /** The ground slab Y — storey 0's floor plane. */
  baseY: number;
  /** Top of the zone the storeys may ideally fill (the box top minus the caller's
   *  roof reserve) — drives the UNIFORM split's storey height. */
  idealTop: number;
  /** Hard cap for the wall top (the highest Y the top storey's ceiling may reach) —
   *  explicit heights are proportionally shrunk to fit under it. */
  maxWallTop: number;
  /** The storey count (≥ 1). */
  floors: number;
  /** The user's explicit slab-to-slab heights, bottom-up. Shorter arrays repeat their
   *  last entry; longer ones are truncated. Null/undefined → the uniform split. */
  floorHeights?: readonly number[] | null;
}

/** The resolved vertical split of a storeyed build. */
export interface StoreyLadder {
  /** Slab-to-slab height per storey, bottom-up (length = `floors`). */
  heights: number[];
  /** The floor-slab Y of each storey, bottom-up (`slabYs[0] === baseY`). */
  slabYs: number[];
  /** The ceiling plane over the top storey: `baseY + sum(heights)`. Callers apply
   *  their own final box clamp (each type keeps its legacy guard). */
  wallTop: number;
}

/** Coerce a loose `floorHeights` value (e.g. a raw `template` op param) into a usable
 *  array: every entry a finite number, truncated and clamped to
 *  [{@link MIN_FLOOR_H}, {@link MAX_STOREY_H}] (the every-floor-≥5 rule); anything else
 *  → undefined.
 *  @param v - The unknown raw value.
 *  @returns The sanitized heights (1–8 entries), or undefined when not usable. */
export function sanitizeFloorHeights(v: unknown): number[] | undefined {
  if (!Array.isArray(v) || v.length === 0 || v.length > 8) return undefined;
  if (!v.every((h) => typeof h === 'number' && Number.isFinite(h))) return undefined;
  return v.map((h) => Math.max(MIN_FLOOR_H, Math.min(MAX_STOREY_H, Math.trunc(h))));
}

/** Coerce a loose `basementHeights` value (a raw `template` op param, bottom-up per-level
 *  depths) into a usable array: every entry a finite number, capped at
 *  {@link MAX_BASEMENT_LEVELS} levels and clamped to [{@link MIN_FLOOR_H},
 *  {@link MAX_STOREY_H}]; anything else → undefined (the caller falls back to a single
 *  {@link DEFAULT_BASEMENT_H} level).
 *  @param v - The unknown raw value.
 *  @returns The sanitized per-level heights (1–{@link MAX_BASEMENT_LEVELS}), or undefined. */
export function sanitizeBasementHeights(v: unknown): number[] | undefined {
  if (!Array.isArray(v) || v.length === 0) return undefined;
  if (!v.every((h) => typeof h === 'number' && Number.isFinite(h))) return undefined;
  return v
    .slice(0, MAX_BASEMENT_LEVELS)
    .map((h) => Math.max(MIN_FLOOR_H, Math.min(MAX_STOREY_H, Math.trunc(h))));
}

/** Total below-grade depth (cells) of a basement from its per-level heights. */
export function basementDepth(heights: readonly number[]): number {
  return heights.reduce((a, b) => a + b, 0);
}

/** Whether a basement needs its OWN ceiling layer (1 extra Y) below the ground plane: it
 *  does when its footprint extends BEYOND the house (under the surroundings/terrain), so the
 *  vault ceiling is a distinct deck the user can re-block without destroying the yard ground
 *  fused on top of it (the "mexer no teto do subsolo destrói o quintal" defect). Identity (0)
 *  when the basement fits within the house footprint (the ceiling is just the house floor).
 *  @param basementArea - The explicit basement footprint, or null/undefined to match the house.
 *  @param houseW - The house footprint width.
 *  @param houseD - The house footprint depth.
 *  @returns 1 when an extra ceiling layer is reserved, else 0. */
export function basementCeilingLayer(
  basementArea: { w: number; d: number } | null | undefined,
  houseW: number,
  houseD: number,
): number {
  if (!basementArea) return 0;
  return basementArea.w > houseW || basementArea.d > houseD ? 1 : 0;
}

/** Resize a heights array to `n` storeys: extra storeys repeat the last height,
 *  removed ones drop off the top. */
function fitLength(heights: readonly number[], n: number): number[] {
  if (heights.length >= n) return heights.slice(0, n);
  const fill = heights[heights.length - 1] ?? DEFAULT_STOREY_H;
  return [...heights, ...Array.from({ length: n - heights.length }, () => fill)];
}

/**
 * Compute the storey ladder for a build's vertical zone.
 *
 * With explicit `floorHeights` the ladder is exactly those heights (each raised to the
 * {@link MIN_FLOOR_H} every-floor-≥5 rule), shrunk PROPORTIONALLY (never below
 * {@link MIN_STOREY_H}) when their sum overflows `maxWallTop - baseY` — so a
 * tall-ground-over-low-upper request keeps its ratio in a box that can't fit it
 * outright. Without them it splits uniformly: `max(MIN_FLOOR_H, floor((idealTop -
 * baseY) / floors))`, shrunk one cell at a time (to a floor of {@link MIN_STOREY_H})
 * while the wall top overflows `maxWallTop`.
 *
 * @param spec - See {@link StoreySpec}.
 * @returns The {@link StoreyLadder} (heights, slab Ys, wall top).
 */
export function planStoreys(spec: StoreySpec): StoreyLadder {
  const { baseY, idealTop, maxWallTop, floorHeights } = spec;
  const floors = Math.max(1, Math.trunc(spec.floors));

  let heights: number[];
  if (floorHeights && floorHeights.length) {
    heights = fitLength(floorHeights, floors).map((h) =>
      Math.max(MIN_FLOOR_H, Math.min(MAX_STOREY_H, Math.trunc(h))),
    );
    const avail = maxWallTop - baseY;
    const sum = heights.reduce((a, b) => a + b, 0);
    if (sum > avail && avail >= floors * MIN_STOREY_H) {
      // Shrink to fit, preserving the requested ratio; hand the flooring remainder
      // back bottom-up so no cell of the available zone is wasted.
      const scaled = heights.map((h) => Math.max(MIN_STOREY_H, Math.floor((h * avail) / sum)));
      let left = avail - scaled.reduce((a, b) => a + b, 0);
      for (let i = 0; left > 0; i = (i + 1) % scaled.length) {
        if (scaled[i] < heights[i]) {
          scaled[i]++;
          left--;
        } else if (scaled.every((h, j) => h >= heights[j])) break;
      }
      heights = scaled;
    }
  } else {
    let h = Math.max(MIN_FLOOR_H, Math.floor((idealTop - baseY) / floors));
    while (baseY + floors * h > maxWallTop && h > MIN_STOREY_H) h--;
    heights = Array.from({ length: floors }, () => h);
  }

  const slabYs: number[] = [];
  let y = baseY;
  for (const h of heights) {
    slabYs.push(y);
    y += h;
  }
  return { heights, slabYs, wallTop: y };
}

/** Inputs for {@link heightOverhead}. */
export interface OverheadSpec {
  /** Build footprint width (the pitched-roof reserve scales with it). */
  w: number;
  /** Build footprint depth. */
  d: number;
  /** The roof pick ('flat' needs only a deck + parapet; anything else reserves a
   *  pitch). Omit → assume pitched (the conservative legacy default). */
  roof?: string;
  /** Whether a below-grade basement level is reserved. */
  basement?: boolean;
  /** Whether an in-roof attic adds headroom. */
  attic?: boolean;
}

/** The non-storey height a storeyed box needs on top of its floors: the roof
 *  (a pitch reserve of ~half the smaller footprint span + a ceiling course, or just a
 *  deck + parapet for a FLAT roof), the buried basement level, and the attic headroom.
 *  ROOF-AWARE — the fix for a flat-roofed build paying a phantom 17-block pitch.
 *  @param spec - See {@link OverheadSpec}.
 *  @returns The overhead in cells; `sum(floorHeights) + overhead` = the total box H. */
export function heightOverhead(spec: OverheadSpec): number {
  const basement = spec.basement ? BASEMENT_OVERHEAD : 0;
  const attic = spec.attic ? ATTIC_OVERHEAD : 0;
  const roof = spec.roof === 'flat' ? 2 : Math.floor(Math.min(spec.w, spec.d) / 2) + 1;
  return basement + roof + attic;
}
