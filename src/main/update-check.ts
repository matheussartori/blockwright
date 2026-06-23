// Lightweight "is there a newer release?" check against the GitHub Releases API.
// This is the COMPLEMENT to the Squirrel auto-updater (updater.ts): Squirrel can
// only self-install on Windows (and on a SIGNED + notarized macOS build). On an
// unsigned macOS build and on Linux there's no working auto-installer, so the
// best we can do is detect a newer release and TELL the user, linking them to the
// download page. This module does exactly that — it never installs anything.
import { app, dialog } from 'electron';
import { mt } from './language';
import { getMainWindow, notifyUpdateAvailable } from './window';
import { isNewer, parseVersion } from './update-version';
import type { UpdateInfo } from '@/shared/types';

const REPO = 'matheussartori/blockwright';
const RELEASES_PAGE = `https://github.com/${REPO}/releases/latest`;
const LATEST_RELEASE_URL = `https://api.github.com/repos/${REPO}/releases/latest`;

/** The most recent newer-release detected, cached so the renderer can PULL it on
 *  mount. The push (notifyUpdateAvailable) can race the renderer's subscription —
 *  the launch check may resolve before the renderer's listener is registered — so
 *  the renderer also asks for this on startup (IPC_CHANNELS.updatePending). */
let lastKnownUpdate: UpdateInfo | null = null;

/** The last detected newer release, or null (consumed by the renderer on mount). */
export function getPendingUpdate(): UpdateInfo | null {
  return lastKnownUpdate;
}

interface GithubRelease {
  tag_name?: string;
  name?: string;
  html_url?: string;
  body?: string;
  draft?: boolean;
  prerelease?: boolean;
}

/** Dev escape hatch (BW_FORCE_UPDATE_CHECK). When the env var looks like a version
 *  (e.g. "9.9.9"), synthesize a "newer release" so the banner/dialog can be tested
 *  without an actual GitHub release — there's no real one newer than the running
 *  build. A truthy-but-non-version value (e.g. "1") just enables the real network
 *  check in dev (handled in updater.ts), so this returns null. */
function forcedUpdate(): UpdateInfo | null {
  const raw = process.env.BW_FORCE_UPDATE_CHECK;
  if (!raw || !/^v?\d+(\.\d+)*$/i.test(raw.trim())) return null;
  const version = parseVersion(raw).join('.');
  if (!isNewer(version, app.getVersion())) return null;
  return { version, url: RELEASES_PAGE, notes: 'Forced test update (BW_FORCE_UPDATE_CHECK).' };
}

/** PURE detection: fetch the latest published (non-draft, non-prerelease) release
 *  and return it as an UpdateInfo IF it's newer than the running app — else null.
 *  No side effects (caching/banner live in `detect`); throws on a network/API
 *  error so callers decide how to surface it. */
async function fetchUpdateInfo(): Promise<UpdateInfo | null> {
  const forced = forcedUpdate();
  if (forced) return forced;
  const res = await fetch(LATEST_RELEASE_URL, {
    headers: {
      Accept: 'application/vnd.github+json',
      'User-Agent': `Blockwright/${app.getVersion()}`,
    },
  });
  if (!res.ok) throw new Error(`GitHub API ${res.status}`);
  const release = (await res.json()) as GithubRelease;
  if (release.draft || release.prerelease) return null;
  const tag = release.tag_name ?? release.name;
  if (!tag || !isNewer(tag, app.getVersion())) return null;
  return {
    version: parseVersion(tag).join('.'),
    url: release.html_url ?? RELEASES_PAGE,
    notes: release.body?.trim() || undefined,
  };
}

/** The one detection path every caller shares: detect, then (on a hit) cache the
 *  result for the renderer's mount-pull and push the banner. Returns the
 *  UpdateInfo or null; rethrows the detection error. */
async function detect(): Promise<UpdateInfo | null> {
  const info = await fetchUpdateInfo();
  if (info) {
    lastKnownUpdate = info;
    notifyUpdateAvailable(info);
  }
  return info;
}

/** Background check (app launch + interval): detect + banner, silent otherwise.
 *  Swallows all errors — a missed check is never fatal. */
export async function checkForUpdatesInBackground(): Promise<void> {
  try {
    await detect();
  } catch (err) {
    console.warn('[update-check] background check failed:', err);
  }
}

/** Quiet check for the in-app About panel: detect NOW and return the UpdateInfo or
 *  null so the panel can render the status INLINE (no native dialog). Rejects on a
 *  network/API error so the renderer can show its own inline failure state. */
export async function checkForUpdatesQuiet(): Promise<UpdateInfo | null> {
  return detect();
}

/** Manual check (Help ▸ Check for Updates…): same detection, but ALSO surfaces a
 *  native dialog for the "up to date" + error outcomes so the menu click always
 *  gives feedback. Returns the UpdateInfo or null. */
export async function checkForUpdatesManually(): Promise<UpdateInfo | null> {
  try {
    const info = await detect();
    if (!info) showUpToDateDialog();
    return info;
  } catch (err) {
    showCheckErrorDialog(err);
    return null;
  }
}

function showUpToDateDialog(): void {
  const win = getMainWindow();
  const opts = {
    type: 'info' as const,
    title: mt('update.title'),
    message: mt('update.upToDate'),
    detail: mt('update.upToDateDetail', { version: app.getVersion() }),
    buttons: [mt('common.close')],
  };
  void (win ? dialog.showMessageBox(win, opts) : dialog.showMessageBox(opts));
}

function showCheckErrorDialog(err: unknown): void {
  const detail = err instanceof Error ? err.message : String(err);
  dialog.showErrorBox(mt('update.title'), `${mt('update.checkFailed')}\n\n${detail}`);
}
