// The NBT DataVersion registry. Every structure Blockwright writes (`.nbt`/`.schem`/
// `.litematic`) stamps a DataVersion; which one depends on what the file TARGETS —
// an export into a mod workspace should stamp the mod's Minecraft version, not a
// hardcoded constant. `dataVersionFor` resolves a version string to the best-known
// DataVersion (exact match, else the NEAREST OLDER release — never a newer one, so a
// stamp can't claim data the target game doesn't understand; Minecraft upgrades older
// data on load via DataFixerUpper, but refuses newer).
import { nearestVersionValue } from '@/shared/mc-version';

/** Known release → DataVersion pairs (classic 1.x line + the year-numbered drops). */
export const DATA_VERSIONS: Record<string, number> = {
  '1.18.2': 2975,
  '1.19.4': 3337,
  '1.20.1': 3465,
  '1.20.4': 3700,
  '1.21': 3953,
  '1.21.1': 3955,
  '1.21.3': 4082,
  '1.21.4': 4189,
  '1.21.5': 4325,
  '1.21.6': 4435,
  '1.21.7': 4438,
  '1.21.8': 4440,
  '26.2': 4903,
};

/** The fallback DataVersion (1.21.1) when no target version is known. The AI
 *  generation path stays pinned here deliberately — its knowledge base targets
 *  1.21.1 block ids, and any newer game upgrades the data on load. */
export const DEFAULT_DATA_VERSION = DATA_VERSIONS['1.21.1'];

/**
 * Resolve the DataVersion to stamp for a target Minecraft version.
 *
 * @param version A version string ("1.21.4", "26.2"), or null when unknown.
 * @returns The exact known DataVersion, else the nearest OLDER release's (a
 *   conservative stamp the target game can still upgrade), else
 *   `DEFAULT_DATA_VERSION` when the version is unparseable or predates the table.
 */
export function dataVersionFor(version: string | null | undefined): number {
  return nearestVersionValue(DATA_VERSIONS, version) ?? DEFAULT_DATA_VERSION;
}
