// Main-process entry point: wires app lifecycle to the window, IPC, and the
// custom texture protocol. Implementation details live in ./main/* modules.
// Load .env (ANTHROPIC_API_KEY for AI structure generation) before anything reads it.
import 'dotenv/config';
import { app, BrowserWindow } from 'electron';
import started from 'electron-squirrel-startup';
import { registerTextureScheme, registerTextureProtocol } from '@/main/texture-protocol';
import { registerIpc } from '@/main/ipc';
import { createWindow, openFile } from '@/main/window';
import { buildAppMenu } from '@/main/app-menu';
import { applyWorkspace, detectWorkspace } from '@/main/workspace';

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

app.on('ready', () => {
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
