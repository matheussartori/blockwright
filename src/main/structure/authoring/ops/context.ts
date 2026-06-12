import type { Intern } from '../palette';
import type { Vec3 } from '../geometry';
import type { AuthoringBlock, AuthoringPaletteEntry } from '../types';

/** The mutable state threaded through op expansion: the keyed cell map being
 *  built, the (growable) palette, the intern accessor, and the structure size for
 *  bounds clamping. */
export interface OpCtx {
  cells: Map<string, AuthoringBlock>;
  palette: AuthoringPaletteEntry[];
  intern: Intern;
  size: Vec3;
  /** Collector for expansion warnings (e.g. a template that had to SKIP its selected
   *  basement because the box is too short) — surfaced in the compile report so the
   *  model/user learns why a pick didn't materialise instead of it vanishing silently. */
  warnings?: string[];
}
