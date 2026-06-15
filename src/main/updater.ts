// Auto-update via update.electronjs.org — Electron's free, server-less update
// service that serves the latest published GitHub Release (no infrastructure to
// run). update-electron-app polls it and applies updates through Squirrel.
//
// Caveats it handles for us: it no-ops in development, and on Linux (which updates
// via the distro package manager, not Squirrel). On macOS, Squirrel.Mac only
// applies updates to a SIGNED + notarized app — until the app is signed this is a
// safe no-op there too (it just won't find an applicable update).
import { app } from 'electron';

export function initAutoUpdates(): void {
  if (!app.isPackaged) return; // dev: nothing to update
  // Linux has no Squirrel updater; skip rather than log a confusing warning.
  if (process.platform === 'linux') return;
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
