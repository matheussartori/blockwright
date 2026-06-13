// Surroundings registry (category "surroundings"). Each yard/landscaping typology is
// one module file carrying its own `build()` geometry — the SINGLE source of that ring's
// shape, run via `composeModule` when a structure type DELEGATES its grounds (the modern
// villa does: it insets its massing by the shared scaled margins and hands the full
// box over). A selected surroundings module also rides into generation as plain-language
// guidance + its own knowledge guide (loaded ONLY when selected), and is listed in the
// gallery. Each links to the structures it fits via `appliesTo` (a yard is composed
// around a specific massing, so the list is explicit — start with `['modern']`).
import { type SurroundSizing, expandSizeForSurroundings, surroundMarginsForOuter } from '@/shared/domain/surroundings';
import type { ModuleSummary } from '../modules';
import type { ParamValues } from '../params';
import { createRegistry } from '../registry';
import { box, type Box } from '../structure-types/types';
import { garden } from './garden';
import { graveyard } from './graveyard';
import { modern } from './modern';
import type { SurroundingsModule } from './types';

export type { SurroundingsModule } from './types';

export const registry = createRegistry<SurroundingsModule>([modern, garden, graveyard]);

/** Look up a surroundings module by id (undefined if unknown). */
export function getSurroundings(id: string): SurroundingsModule | undefined {
  return registry.get(id);
}

/** Every surroundings module, as a module summary (for the composer picker + gallery). */
export function listSurroundings(): ModuleSummary[] {
  return registry.list();
}

/** Every surroundings module (for the knowledge loader). */
export function surroundingsModules(): SurroundingsModule[] {
  return registry.all();
}

/** The HOUSE footprint inside a build box that reserves a surroundings ring: the box
 *  inset by the module's shared margins — derived from the OUTER box, scaled to the
 *  house (the ring is horizontal only — the full height is kept). Identity for
 *  'none'/unknown ids. The structure type lays its massing in this inner box; the
 *  module re-derives the same bounds from the same function, so the two always agree
 *  on where the house ends and the yard begins.
 *  @param b - The full (already expanded) build box.
 *  @param id - The selected surroundings-module id ('none'/'' = no ring).
 *  @param sizing - The user's per-axis yard scale (the same one the box was expanded with),
 *    or undefined for the auto ring. Recovered margins honour it, so the inset matches.
 *  @returns The inner house {@link Box} (== `b` when no ring applies). */
export function insetHouseBox(b: Box, id: string | undefined, sizing?: SurroundSizing): Box {
  const m = surroundMarginsForOuter(id, b.W, b.D, sizing);
  if (!m) return b;
  return box([b.x0 + m.side, b.y0, b.z0 + m.front], [b.x1 - m.side, b.y1, b.z1 - m.back]);
}

/** Centre a `w × d` footprint within a build box, keeping its full Y range — the X/Z
 *  region the HOUSE (or basement) occupies when the compiled box grew wider than it (a
 *  basement enlarged past the house). Clamped so it never exceeds the outer box; identity
 *  when `w`/`d` already match (the common case, so existing builds are untouched).
 *  @param b - The full (already expanded) build box.
 *  @param w - The footprint width to centre (clamped to `b.W`).
 *  @param d - The footprint depth to centre (clamped to `b.D`).
 *  @returns The centred {@link Box} (== `b` when `w`/`d` fill it). */
export function centerBoxXZ(b: Box, w: number, d: number): Box {
  const cw = Math.min(Math.max(1, Math.trunc(w)), b.W);
  const cd = Math.min(Math.max(1, Math.trunc(d)), b.D);
  const offX = Math.floor((b.W - cw) / 2);
  const offZ = Math.floor((b.D - cd) / 2);
  return box([b.x0 + offX, b.y0, b.z0 + offZ], [b.x0 + offX + cw - 1, b.y1, b.z0 + offZ + cd - 1]);
}

/** The BASEMENT footprint box: a `w × d` area centred on the HOUSE (not the envelope), so
 *  the house always sits OVER the vault even when an asymmetric surroundings ring offsets the
 *  house from the envelope centre (else the descent ladder's house corner falls outside the
 *  vault and floats — the "ladder under the yard / removed as non-functional" defect). Clamped
 *  to the envelope, then nudged to fully COVER the house box (possible whenever `w ≥ house.W`).
 *  @param b - The full build box (envelope).
 *  @param houseB - The house box the basement must sit under.
 *  @param w - The basement footprint width.
 *  @param d - The basement footprint depth.
 *  @returns The basement {@link Box} (X/Z; full Y), containing `houseB` when `w/d ≥ its W/D`. */
export function basementBox(b: Box, houseB: Box, w: number, d: number): Box {
  const span = (size: number, c0: number, c1: number, lo: number, hi: number): [number, number] => {
    const s = Math.min(Math.max(1, Math.trunc(size)), hi - lo + 1);
    const centre = (c0 + c1) / 2;
    let a = Math.round(centre - s / 2);
    a = Math.max(lo, Math.min(hi - s + 1, a)); // clamp into the envelope
    if (a > c0) a = c0;                          // cover the house's near edge…
    if (a + s - 1 < c1) a = c1 - s + 1;          // …and its far edge
    a = Math.max(lo, Math.min(hi - s + 1, a));   // re-clamp (a no-op unless the box is too small)
    return [a, a + s - 1];
  };
  const [x0, x1] = span(w, houseB.x0, houseB.x1, b.x0, b.x1);
  const [z0, z1] = span(d, houseB.z0, houseB.z1, b.z0, b.z1);
  return box([x0, b.y0, z0], [x1, b.y1, z1]);
}

/** The HOUSE-PLUS-YARD box centred within a (possibly basement-widened) envelope: the
 *  house shell `[w, d]` grown by the surroundings ring, then centred in `b`. The structure
 *  type receives THIS box and insets the yard itself, so its massing stays the user's W/D
 *  even when the basement footprint forced the compiled box wider. Identity (== `b`) when
 *  no shell size is supplied (the legacy `template` path) or the grown shell already fills `b`.
 *  @param b - The full (already expanded) build box (envelope).
 *  @param shell - The house shell `[w, d]` before any growth, or undefined.
 *  @param surroundings - The surroundings-module id (drives the ring growth), or undefined.
 *  @param sizing - The user's per-axis yard scale, or undefined for the auto ring.
 *  @returns The centred house+yard {@link Box}. */
export function houseEnvelopeBox(
  b: Box,
  shell: { w: number; d: number } | undefined,
  surroundings: string | undefined,
  sizing?: SurroundSizing,
): Box {
  if (!shell) return b;
  const grown = expandSizeForSurroundings(shell.w, shell.d, surroundings, sizing);
  return centerBoxXZ(b, grown.w, grown.d);
}

/** The selected surroundings-ring id when it genuinely fits (the inset still leaves a
 *  livable house footprint), else null. Shared by every host type's `build()` and
 *  `floors()` so the massing and the storey math always agree on which box the HOUSE
 *  occupies — the standard first line of a yard-aware structure type.
 *  @param outer - The full (already expanded) build box.
 *  @param params - The type's resolved params (reads the `surroundings` value).
 *  @param sizing - The user's per-axis yard scale (or undefined for the auto ring).
 *  @returns The ring's module id, or null for none / a too-tight inset. */
export function yardFor(outer: Box, params: ParamValues, sizing?: SurroundSizing): string | null {
  const id = typeof params.surroundings === 'string' ? params.surroundings : 'none';
  if (id === 'none') return null;
  const inner = insetHouseBox(outer, id, sizing);
  return inner.W >= 7 && inner.D >= 7 ? id : null;
}
