// The emit→render→review revision budget. A run is capped so the self-correction
// loop can't spin forever; the cap scales with build volume (bigger builds need
// more passes) but is always at least enough to walk the full design-pass sequence
// plus headroom for the audit gate to iterate (fix → re-audit).
import { PHASES } from './phases';

/** Extra rounds beyond the design passes for the audit gate to fix → re-audit. */
const AUDIT_HEADROOM = 2;

/** The minimum rounds any run gets: one per design pass + audit headroom. */
export const MIN_ROUNDS = PHASES.length + AUDIT_HEADROOM;

/** Revision cap from a build's bounding-box volume (sx·sy·sz). Larger builds get
 *  more emit→review passes since one round can't fix both massing and interiors. */
export function roundsForVolume(volume: number): number {
  if (volume > 20000) return 7;
  if (volume > 6000) return 6;
  if (volume > 1500) return 5;
  return 4;
}

/** The round cap for a build: the env override when set, else the volume-based cap —
 *  always floored to {@link MIN_ROUNDS} so the cap can't truncate the design-pass
 *  sequence or starve the audit loop. `volume` is unknown (0) before the first emit. */
export function maxRoundsFor(volume: number, envOverride: number | null): number {
  if (envOverride != null) return Math.max(envOverride, MIN_ROUNDS);
  return Math.max(roundsForVolume(volume), MIN_ROUNDS);
}
