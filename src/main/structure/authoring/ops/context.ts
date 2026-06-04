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
}
