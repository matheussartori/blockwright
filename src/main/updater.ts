// Update strategy, two complementary layers:
//
// 1. AUTO-INSTALL via update.electronjs.org (update-electron-app) — Electron's
//    free, server-less service that serves the latest published GitHub Release.
//    Squirrel polls it and applies the update IN PLACE. This only works where
//    Squirrel can self-install: Windows, and a SIGNED + notarized macOS build.
//    It no-ops in dev, on Linux (distro package manager), and on an unsigned mac.
//
// 2. NOTIFY via the GitHub Releases API (update-check.ts) — for the platforms
//    layer 1 can't auto-install (unsigned macOS + Linux), we at least DETECT a
//    newer release and show the user an in-app banner linking to the download.
//
// Both run on app launch; layer 2 also re-checks on an interval.
import { app } from 'electron';
import { checkForUpdatesInBackground } from './update-check';
import { getMainWindow } from './window';

const CHECK_INTERVAL_MS = 6 * 60 * 60 * 1000; // 6 hours

/** Run the launch check only once the renderer has loaded, so the
 *  `update-available` push isn't fired before the renderer subscribes (the forced
 *  dev path resolves synchronously and would otherwise race the renderer). */
function runAfterRendererReady(fn: () => void): void {
  const win = getMainWindow();
  if (!win) {
    setTimeout(fn, 3000); // no window yet (shouldn't happen post-createWindow) — fall back
    return;
  }
  if (!win.webContents.isLoading()) fn();
  else win.webContents.once('did-finish-load', fn);
}

export function initAutoUpdates(): void {
  // Dev escape hatch: BW_FORCE_UPDATE_CHECK runs the notify-only check at launch
  // even unpackaged (and on any platform), so the banner/dialog can be tested
  // without a packaged build. Set it to a version like "9.9.9" to also FORCE a
  // synthetic "newer release" (see update-check.ts forcedUpdate).
  const forced = !!process.env.BW_FORCE_UPDATE_CHECK;
  if (!app.isPackaged && !forced) return; // dev: nothing to update

  // Layer 1 — Squirrel auto-install. Skip Linux (no Squirrel updater there).
  if (app.isPackaged && process.platform !== 'linux') {
    void (async () => {
      try {
        const { updateElectronApp } = await import('update-electron-app');
        updateElectronApp({
          repo: 'matheussartori/blockwright',
          updateInterval: '6 hours',
        });
      } catch (err) {
        console.warn('[updater] auto-update unavailable:', err);
      }
    })();
  }

  // Layer 2 — notify-only GitHub Release check, on the platforms layer 1 can't
  // auto-install for. Windows is left to Squirrel (it self-installs silently, so
  // a banner would just be noise). Runs once at launch, then on an interval.
  // `forced` overrides the platform gate so the check runs anywhere in dev.
  if (forced || (app.isPackaged && process.platform !== 'win32')) {
    runAfterRendererReady(() => void checkForUpdatesInBackground());
    if (app.isPackaged) setInterval(() => void checkForUpdatesInBackground(), CHECK_INTERVAL_MS);
  }
}
