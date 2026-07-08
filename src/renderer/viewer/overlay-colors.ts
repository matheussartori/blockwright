// Colours for the viewer's editor/inspector overlays. ACCENT mirrors the CSS `--accent`
// token (index.css) — a WebGL material can't read a CSS var, so a theme/accent change is a
// deliberate edit here. FOCUS is the inspector's amber focus-flash.
//
// The bindings are `let` + a scheme switcher: Settings ▸ Viewer's overlay color scheme
// swaps the whole set for a colorblind-safe palette (Okabe–Ito). ES module bindings are
// LIVE, so overlays built after the switch pick the new hues up; marks already on screen
// keep theirs until they next rebuild (a tab switch / re-set).
import type { OverlayScheme } from '../state/settings';

export let ACCENT = 0x3b6fe5;
export let FOCUS = 0xffd54a;
/** Void markers (the editor's "show voids"), matching Minecraft's "show invisible blocks":
 *  `minecraft:air` (clears the cell on paste) = BLUE; "void" — `minecraft:structure_void` or an
 *  omitted cell, both of which preserve terrain = RED. */
export let AIR_MARK = 0x6f7ce0;
export let VOID_MARK = 0xff5a5a;
/** Structure-diff overlay: added cells GREEN, removed RED, changed (block/state) YELLOW —
 *  the universal diff read. These mirror the CSS `--ok`/`--danger`/`--warn` tokens
 *  (index.css), which the DiffPanel/Doctor UI use for the same meanings. */
export let DIFF_ADD = 0x3fbf86;
export let DIFF_REMOVE = 0xe5604d;
export let DIFF_CHANGE = 0xe3a93f;

/** The two palettes. `colorblind` is drawn from Okabe–Ito: red/green pairs become
 *  blue/vermillion, the void/air pair becomes reddish-purple/sky-blue. */
const SCHEMES: Record<OverlayScheme, { accent: number; focus: number; air: number; void_: number; add: number; remove: number; change: number }> = {
  default: { accent: 0x3b6fe5, focus: 0xffd54a, air: 0x6f7ce0, void_: 0xff5a5a, add: 0x3fbf86, remove: 0xe5604d, change: 0xe3a93f },
  colorblind: { accent: 0x3b6fe5, focus: 0xe69f00, air: 0x56b4e9, void_: 0xcc79a7, add: 0x0072b2, remove: 0xd55e00, change: 0xf0e442 },
};

/** Swap the overlay palette (Settings ▸ Viewer ▸ Overlay colors). */
export function setOverlayScheme(scheme: OverlayScheme): void {
  const s = SCHEMES[scheme] ?? SCHEMES.default;
  ACCENT = s.accent;
  FOCUS = s.focus;
  AIR_MARK = s.air;
  VOID_MARK = s.void_;
  DIFF_ADD = s.add;
  DIFF_REMOVE = s.remove;
  DIFF_CHANGE = s.change;
}
