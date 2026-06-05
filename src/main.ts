// Main-process entry point: wires app lifecycle to the window, IPC, and the
// custom texture protocol. Implementation details live in ./main/* modules.
// Load .env (ANTHROPIC_API_KEY for AI structure generation) before anything reads it.
import 'dotenv/config';
import { app, BrowserWindow, nativeImage } from 'electron';
import fs from 'node:fs';
import path from 'node:path';
import started from 'electron-squirrel-startup';
import { installMainLogger } from '@/main/logger';
import { registerTextureScheme, registerTextureProtocol } from '@/main/texture-protocol';
import { registerIpc } from '@/main/ipc';
import { createWindow, openFile } from '@/main/window';
import { buildAppMenu } from '@/main/app-menu';
import { applyWorkspace, detectWorkspace } from '@/main/workspace';

// Mirror the main-process console into the in-app Console dock from the very
// first line (covers startup, before the window exists — buffered for the backlog).
installMainLogger();

// Handle creating/removing shortcuts on Windows when installing/uninstalling.
if (started) {
  app.quit();
}

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
  }
  createWindow();
  buildAppMenu();
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
