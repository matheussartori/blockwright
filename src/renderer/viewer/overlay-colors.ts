// Colours for the viewer's editor/inspector overlays. ACCENT mirrors the CSS `--accent`
// token (index.css) — a WebGL material can't read a CSS var, so a theme/accent change is a
// deliberate two-line edit here. FOCUS is the inspector's amber focus-flash.
export const ACCENT = 0x3b6fe5;
export const FOCUS = 0xffd54a;
/** Void markers (the editor's "show voids"), matching Minecraft's "show invisible blocks":
 *  `minecraft:air` (clears the cell on paste) = BLUE; "void" — `minecraft:structure_void` or an
 *  omitted cell, both of which preserve terrain = RED. */
export const AIR_MARK = 0x6f7ce0;
export const VOID_MARK = 0xff5a5a;
