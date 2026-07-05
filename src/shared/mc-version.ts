// Minecraft version handling shared by both processes. The *detection* (reading
// a mod's project files) lives in main; here we only parse/normalize a version
// string, order versions, and decide whether a jigsaw format is one we support.
//
// Two version schemes coexist now: the classic `1.x(.y)` line (ended at 1.21.11,
// Dec 2025) and the year-numbered releases Mojang moved to in 2026 (`26.1`,
// `26.2`, …, at ~3-4 "game drops"/year). A year-numbered version is always newer
// than any `1.x` — `mcVersionRank` encodes that ordering for every consumer
// (structure folder, size limit, DataVersion resolution).
//
// Jigsaw support is gated deliberately: the jigsaw block-entity + template-pool
// format used here was validated against 1.21.1. The orientation property and
// the `selection_priority`/`placement_priority` tags (added in 1.20.3) are
// stable across the whole 1.21.x line AND the year-numbered releases, so we
// accept those families and treat anything else as "not yet supported" rather
// than risk rendering it wrong.

/** Classic-scheme minors whose jigsaw format we render (year-numbered releases
 *  are accepted wholesale — see `isJigsawSupported`). Pure prefix match on
 *  "major.minor" keeps it trivial to widen once another line is validated. */
export const SUPPORTED_JIGSAW_MINORS = ['1.21'] as const;

/** Versions offered in the manual picker when detection fails (newest first). */
export const SELECTABLE_VERSIONS = [
  '26.2',
  '26.1',
  '1.21.11',
  '1.21.4',
  '1.21.1',
  '1.21',
  '1.20.4',
  '1.19.4',
] as const;

/** Extract a normalized Minecraft version from arbitrary text (gradle properties,
 *  a Fabric/Forge dependency range, etc.): the classic `1.21.1` style or the
 *  year-numbered `26.2` style (majors 26+). Returns null if none. */
export function parseMcVersion(text: string | null | undefined): string | null {
  if (!text) return null;
  const match = text.match(/\b(?:2[6-9]|[3-9]\d|1)\.\d{1,2}(?:\.\d{1,2})?\b/);
  return match ? match[0] : null;
}

/** The "major.minor" of a version ("1.21.1" → "1.21", "26.2" → "26.2"), or null
 *  if unparseable. */
export function minorOf(version: string | null | undefined): string | null {
  const parsed = parseMcVersion(version);
  if (!parsed) return null;
  const [major, minor] = parsed.split('.');
  return `${major}.${minor}`;
}

/** A monotonically-ordered rank for a version, or null if unparseable. The year
 *  majors (26+) naturally outrank every `1.x`, so plain arithmetic covers both
 *  schemes: rank("1.21.11") < rank("26.1") < rank("26.2"). */
export function mcVersionRank(version: string | null | undefined): number | null {
  const parsed = parseMcVersion(version);
  if (!parsed) return null;
  const [major = 0, minor = 0, patch = 0] = parsed.split('.').map(Number);
  return major * 100_000 + minor * 1_000 + patch;
}

/** Whether `version` is at least `floor` (both parsed leniently). An unparseable
 *  `version` returns `fallback` (callers usually assume modern). */
export function mcVersionAtLeast(
  version: string | null | undefined,
  floor: string,
  fallback = true,
): boolean {
  const rank = mcVersionRank(version);
  const floorRank = mcVersionRank(floor);
  if (rank === null || floorRank === null) return fallback;
  return rank >= floorRank;
}

/**
 * Look `version` up in a version-keyed table, falling back to the NEAREST OLDER
 * release's value — the shared resolution rule for anything stamped into files
 * (DataVersion, data-pack format): an older stamp is always safe (the game
 * upgrades old data on load) while a newer one is refused.
 *
 * @param table Known release → value pairs (keys parsed with {@link mcVersionRank}).
 * @param version The target version string, or null when unknown.
 * @returns The exact or nearest-older value, or null when `version` is
 *   unparseable or predates every table entry (the caller picks its default).
 */
export function nearestVersionValue<T>(table: Record<string, T>, version: string | null | undefined): T | null {
  const rank = mcVersionRank(version);
  if (rank === null) return null;
  let best: { rank: number; value: T } | null = null;
  for (const [ver, value] of Object.entries(table)) {
    const r = mcVersionRank(ver);
    if (r === null || r > rank) continue;
    if (!best || r > best.rank) best = { rank: r, value };
  }
  return best ? best.value : null;
}

/** Whether jigsaw assembly is supported for a given (possibly null) version:
 *  the validated 1.21 line, or any year-numbered release (26.1+ keeps the same
 *  jigsaw block-entity/template-pool format). */
export function isJigsawSupported(version: string | null | undefined): boolean {
  const minor = minorOf(version);
  if (minor === null) return false;
  if ((SUPPORTED_JIGSAW_MINORS as readonly string[]).includes(minor)) return true;
  return Number(minor.split('.')[0]) >= 26;
}
