// Minecraft version handling shared by both processes. The *detection* (reading
// a mod's project files) lives in main; here we only parse/normalize a version
// string and decide whether its jigsaw format is one we support.
//
// Jigsaw support is gated deliberately: the jigsaw block-entity + template-pool
// format used here was validated against 1.21.1. The orientation property and
// the `selection_priority`/`placement_priority` tags (added in 1.20.3) are
// stable across the whole 1.21.x line, so we accept that family and treat
// anything else as "not yet supported" rather than risk rendering it wrong.

/** Minecraft versions whose jigsaw format we render. Pure prefix match on
 *  "major.minor" keeps it trivial to widen once another line is validated. */
export const SUPPORTED_JIGSAW_MINORS = ['1.21'] as const;

/** Versions offered in the manual picker when detection fails (newest first). */
export const SELECTABLE_VERSIONS = [
  '1.21.4',
  '1.21.3',
  '1.21.1',
  '1.21',
  '1.20.4',
  '1.19.4',
] as const;

/** Extract a normalized "1.21.1"-style version from arbitrary text (gradle
 *  properties, a Fabric/Forge dependency range, etc.). Returns null if none. */
export function parseMcVersion(text: string | null | undefined): string | null {
  if (!text) return null;
  const match = text.match(/\b1\.\d{1,2}(?:\.\d{1,2})?\b/);
  return match ? match[0] : null;
}

/** The "major.minor" of a version ("1.21.1" → "1.21"), or null if unparseable. */
export function minorOf(version: string | null | undefined): string | null {
  const parsed = parseMcVersion(version);
  if (!parsed) return null;
  const [major, minor] = parsed.split('.');
  return `${major}.${minor}`;
}

/** Whether jigsaw assembly is supported for a given (possibly null) version. */
export function isJigsawSupported(version: string | null | undefined): boolean {
  const minor = minorOf(version);
  return minor !== null && (SUPPORTED_JIGSAW_MINORS as readonly string[]).includes(minor);
}
