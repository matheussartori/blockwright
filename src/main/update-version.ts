// Pure semver-ish version comparison for the update check, kept free of any
// electron import so it's unit-testable in a plain node env (update-check.ts,
// which talks to electron's app/dialog, re-uses these).

/** Strip a leading `v`/`V` and any prerelease/build suffix, returning the numeric
 *  `[major, minor, patch]`. Non-numeric segments become 0. */
export function parseVersion(raw: string): [number, number, number] {
  const cleaned = raw.trim().replace(/^v/i, '');
  const core = cleaned.split(/[-+]/, 1)[0]; // drop prerelease/build metadata
  const parts = core.split('.').map((n) => Number.parseInt(n, 10));
  return [parts[0] || 0, parts[1] || 0, parts[2] || 0];
}

/** True when `latest` is a strictly newer version than `current`
 *  (major.minor.patch; prerelease/build metadata ignored). */
export function isNewer(latest: string, current: string): boolean {
  const a = parseVersion(latest);
  const b = parseVersion(current);
  for (let i = 0; i < 3; i++) {
    if (a[i] > b[i]) return true;
    if (a[i] < b[i]) return false;
  }
  return false;
}
