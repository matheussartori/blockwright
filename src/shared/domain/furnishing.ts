// The interior-furnishing model shared by BOTH processes (no Node/electron): the
// SPACE × DECORATION organism behind room furnishing. A room comes out empty when a
// big floor gets the same sparse furniture a small one needs — so furnishing is tiered
// by the available floor SPACE. Each room declares a small library of FURNISHING
// PRESETS, one per scale tier (snug / standard / grand). A preset is a decoration-
// AGNOSTIC base: it names furniture in semantic terms (a hearth, a seating cluster,
// shelving), and the house's decoration master (cozy, haunted, …) re-skins those into
// concrete blocks and mood. So one preset reads warm under "cozy" and grim under
// "haunted" without N×M data.
//
// The renderer (the composer brief + the module gallery) and main (the domain rooms +
// the knowledge loader) both import this, so the scale thresholds and the preset shape
// can never drift between the two sides.

/** How much floor a room has, as a coarse tier. Drives furnishing density: a `snug`
 *  room gets a discreet layout (never suffocated), a `grand` hall a rich one (never
 *  left echoing-empty like the big bedroom that prompted this). */
export type RoomScale = 'snug' | 'standard' | 'grand';

/** A space tier: the floor-area band it covers + the density guidance the model gets. */
export interface ScaleTier {
  scale: RoomScale;
  /** Human label for the gallery + the brief ("Snug" / "Standard" / "Grand"). */
  label: string;
  /** Minimum interior floor area (in cells) for this tier — the lower bound of its
   *  band; the next tier's `minArea` is its upper bound. Tiers are listed ascending. */
  minArea: number;
  /** One-line density steer woven into the room-plan brief for a room of this tier. */
  density: string;
}

/** The space tiers, ascending by `minArea`. The bands are tuned to a typical storey:
 *  ~5×5 interior reads `snug`, ~6×6–8×8 `standard`, anything ≥ ~8×8 `grand` (the image
 *  that prompted this was a ~13×11 hall — firmly grand, yet furnished like a snug room). */
export const SCALE_TIERS: ScaleTier[] = [
  {
    scale: 'snug',
    label: 'Snug',
    minArea: 0,
    density:
      'a small room — keep it discreet: one focal piece plus one or two accents, ' +
      'leave clear walking space, never crowd it.',
  },
  {
    scale: 'standard',
    label: 'Standard',
    minArea: 30,
    density:
      'a comfortable room — a focal point plus a couple of furniture groups and some ' +
      'wall dressing, still leaving an open path through.',
  },
  {
    scale: 'grand',
    label: 'Grand',
    minArea: 64,
    density:
      'a large room — fill it generously: divide it into zones, repeat furniture across ' +
      'the floor (more than one seating/work cluster), anchor the centre and dress every ' +
      'wall, add pillars/rugs/dividers so no big empty stretch remains.',
  },
];

/** The tier that covers a given interior floor area (cells), defaulting to `snug` for
 *  anything below the first band.
 *  @param area - The room's interior floor area in cells (≈ width × depth of its share
 *    of the storey, minus walls).
 *  @returns The matching {@link ScaleTier}. */
export function scaleForArea(area: number): ScaleTier {
  let tier = SCALE_TIERS[0];
  for (const t of SCALE_TIERS) if (area >= t.minArea) tier = t;
  return tier;
}

/** Look up a tier by its scale id (falls back to the first tier). */
export function scaleTier(scale: RoomScale): ScaleTier {
  return SCALE_TIERS.find((t) => t.scale === scale) ?? SCALE_TIERS[0];
}

/** A furnishing preset: a base interior layout for a room, sized to one space tier.
 *  Decoration-agnostic — the `furnishings` name furniture semantically and the chosen
 *  decoration re-skins them. Carried on each room module and surfaced to the composer
 *  brief (which picks the preset matching the room's computed scale) and the gallery
 *  (which lists them, expandable, per room). */
export interface FurnishingPreset {
  /** Stable id, unique within the room (e.g. `bedroom-grand`). */
  id: string;
  /** Human label for the gallery ("Master suite", "Reading nook"). */
  label: string;
  /** The space tier this preset is built for. */
  scale: RoomScale;
  /** One-line summary of the layout for the gallery + the brief. */
  summary: string;
  /** The base furniture zones, each a short plain-language phrase the model realises
   *  with ordinary ops. Decoration re-skins the materials; this is the layout. */
  furnishings: string[];
}

/** Pick a room's preset for a target scale: the exact tier if present, else the next
 *  smaller one defined, else the first. So a room that only defines `snug`+`grand`
 *  still resolves a `standard` request to its `snug` preset rather than nothing.
 *  @param presets - The room's preset library (may be empty).
 *  @param scale - The desired space tier.
 *  @returns The best-matching preset, or undefined when the library is empty. */
export function presetForScale(
  presets: FurnishingPreset[] | undefined,
  scale: RoomScale,
): FurnishingPreset | undefined {
  if (!presets || presets.length === 0) return undefined;
  const order: RoomScale[] = ['grand', 'standard', 'snug'];
  const want = order.indexOf(scale);
  // Prefer the exact scale, else the closest at-or-below it, else the smallest.
  const exact = presets.find((p) => p.scale === scale);
  if (exact) return exact;
  for (let i = want + 1; i < order.length; i++) {
    const hit = presets.find((p) => p.scale === order[i]);
    if (hit) return hit;
  }
  return presets[0];
}
