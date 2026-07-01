// LOD policy: how detailed a chunk is meshed as a function of its distance (in chunks) from the
// camera. Bands with hysteresis so a chunk hovering on a boundary doesn't thrash between levels
// every frame. M3 uses near for everything in range; M4 fills in the mid (heightmap surface) and
// far (region tile) meshers in the worker and widens the bands.
import type { LodLevel } from './worker-protocol';

export interface LodBands {
  /** ≤ near → full block geometry. */
  near: number;
  /** ≤ mid → surface mesh; beyond → far region tile. */
  mid: number;
  /** Chunks past this are not loaded at all. */
  max: number;
}

/** A comfortable default for a normal machine — widened via the render-distance control. `near` is
 *  full block geometry (caves + terrain from any angle), so keep it generous. */
export const DEFAULT_BANDS: LodBands = { near: 8, mid: 14, max: 20 };

const HYSTERESIS = 1; // chunks: how far past a boundary before downgrading

/** Pick the LOD for a chunk `dist` chunks away, biased to KEEP `current` until clearly past the
 *  band edge (avoids per-frame flip-flop at boundaries). Returns null when out of range. */
export function lodForDistance(dist: number, bands: LodBands, current?: LodLevel): LodLevel | null {
  if (dist > bands.max + (current ? HYSTERESIS : 0)) return null;
  const nearEdge = bands.near + (current === 'near' ? HYSTERESIS : 0);
  const midEdge = bands.mid + (current === 'mid' || current === 'near' ? HYSTERESIS : 0);
  if (dist <= nearEdge) return 'near';
  if (dist <= midEdge) return 'mid';
  return 'far';
}
