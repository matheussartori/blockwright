// Main-process entry point: wires app lifecycle to the window, IPC, and the
// custom texture protocol. Implementation details live in ./main/* modules.
// Load .env (ANTHROPIC_API_KEY for AI structure generation) before anything reads it.
import 'dotenv/config';
import { app, BrowserWindow, nativeImage } from 'electron';
import fs from 'node:fs';
import path from 'node:path';
import started from 'electron-squirrel-startup';
import { installMainLogger } from '@/main/logger';
import { configureGpuFallback } from '@/main/gpu';
import { registerTextureScheme, registerTextureProtocol } from '@/main/texture-protocol';
import { registerIpc } from '@/main/ipc';
import { createWindow, openFile } from '@/main/window';
import { buildAppMenu } from '@/main/app-menu';
import { activateWorkspace, applyWorkspace, detectWorkspace } from '@/main/workspace';
import { getPinnedWorkspace, setPinnedWorkspace } from '@/main/pinned-workspace';
import { initAutoUpdates } from '@/main/updater';

// Mirror the main-process console into the in-app Console dock from the very
// first line (covers startup, before the window exists — buffered for the backlog).
installMainLogger();

// Handle creating/removing shortcuts on Windows when installing/uninstalling.
if (started) {
  app.quit();
}

// Software-GL fallback for GPU-less hosts (VMs / some flatpak setups) — must run before
// the app is ready so the Chromium GL switches take effect. Avoids the all-white window.
configureGpuFallback();

// Privileged scheme must be declared before the app is ready.
registerTextureScheme();

// Open-with on macOS (file association / drag onto dock icon).
app.on('open-file', (event, filePath) => {
  event.preventDefault();
  openFile(filePath);
});

/** The app/dock icon (the standardized logo-dark, `build/icon.png`). The packaged
 *  bundle icon comes from `build/icon.icns` (forge.config); this drives the dev
 *  dock icon. */
function appIconPath(): string | null {
  const candidates = [
    path.join(app.getAppPath(), 'build', 'icon.png'),
    path.join(process.resourcesPath ?? '', 'build', 'icon.png'),
  ];
  return candidates.find((p) => p && fs.existsSync(p)) ?? null;
}

app.on('ready', () => {
  // Set the dock icon (macOS dev) / fallback runtime icon to logo-dark. Packaged
  // builds also get it from build/icon.icns via forge.config.
  const icon = appIconPath();
  if (icon && process.platform === 'darwin') app.dock?.setIcon(nativeImage.createFromPath(icon));
  registerTextureProtocol();
  registerIpc();
  // Dev-only: activate a mod workspace on startup (used for automated checks).
  if (process.env.BW_WORKSPACE) {
    const ws = detectWorkspace(process.env.BW_WORKSPACE);
    if (ws) applyWorkspace(ws);
  } else {
    // A PINNED workspace auto-activates at every launch (until unpinned/closed).
    // A stale pin (the project moved/deleted) is dropped silently.
    const pinned = getPinnedWorkspace();
    if (pinned && !activateWorkspace(pinned)) setPinnedWorkspace(null);
  }
  createWindow();
  buildAppMenu();
  initAutoUpdates();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});
