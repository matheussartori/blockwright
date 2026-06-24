// Owns the application window: creation, first-paint, the initial file to open
// (via open-file/BW_OPEN), and the dev-only headless screenshot (BW_CAPTURE).
import { app, BrowserWindow, dialog, type OpenDialogOptions, type SaveDialogOptions } from 'electron';
import path from 'node:path';
import fs from 'node:fs';
import type { ExportResult, UpdateInfo } from '@/shared/types';
import type { LanguageInfo } from '@/shared/i18n';
import { IPC_EVENTS } from '@/shared/ipc';
import { mt } from './language';
import { getRecents } from './recents';
import { getRecentWorkspaces } from './recent-workspaces';
import { getActiveWorkspace } from './structure/assets/content-pack';
import { convertStructure } from './structure/io/convert';

let mainWindow: BrowserWindow | null = null;
let pendingOpenPath: string | null = null;

export function getMainWindow(): BrowserWindow | null {
  return mainWindow;
}

/** Open a file now if the window is ready, otherwise queue it until first paint. */
export function openFile(filePath: string): void {
  if (mainWindow) {
    mainWindow.webContents.send(IPC_EVENTS.openPath, filePath);
  } else {
    pendingOpenPath = filePath;
  }
}

/** Show the native open dialog (shared by the IPC handler and the File menu). */
export async function openFileDialog(): Promise<string | null> {
  const options: OpenDialogOptions = {
    title: mt('dialog.openTitle'),
    properties: ['openFile'],
    filters: [
      { name: mt('dialog.structureFilter'), extensions: ['nbt', 'schem', 'litematic'] },
      { name: mt('dialog.nbtFilter'), extensions: ['nbt'] },
      { name: mt('dialog.schemFilter'), extensions: ['schem'] },
      { name: mt('dialog.litematicFilter'), extensions: ['litematic'] },
    ],
  };
  const result = mainWindow
    ? await dialog.showOpenDialog(mainWindow, options)
    : await dialog.showOpenDialog(options);
  return result.canceled ? null : result.filePaths[0];
}

/** Show the native directory picker for choosing a mod workspace. */
export async function openDirectoryDialog(): Promise<string | null> {
  const options: OpenDialogOptions = {
    title: mt('dialog.openWorkspaceTitle'),
    properties: ['openDirectory'],
  };
  const result = mainWindow
    ? await dialog.showOpenDialog(mainWindow, options)
    : await dialog.showOpenDialog(options);
  return result.canceled ? null : result.filePaths[0];
}

/** Export the current build (`srcPath`, a real `.nbt`/`.schem` on disk) to a user-chosen
 *  location + FORMAT via the native Save dialog. The chosen extension drives the encoding:
 *  `.nbt` (vanilla structure) or `.schem` (WorldEdit/Sponge). `.nbt`→`.nbt` is a lossless
 *  copy; anything else converts via `convertStructure`. */
export async function exportStructure(srcPath: string, suggestedName: string): Promise<ExportResult> {
  if (!fs.existsSync(srcPath)) {
    return { ok: false, error: 'The structure file no longer exists on disk.' };
  }
  const options: SaveDialogOptions = {
    title: mt('dialog.exportTitle'),
    defaultPath: suggestedName,
    filters: [
      { name: mt('dialog.nbtFilter'), extensions: ['nbt'] },
      { name: mt('dialog.schemFilter'), extensions: ['schem'] },
      { name: mt('dialog.litematicFilter'), extensions: ['litematic'] },
    ],
  };
  const result = mainWindow
    ? await dialog.showSaveDialog(mainWindow, options)
    : await dialog.showSaveDialog(options);
  if (result.canceled || !result.filePath) return { ok: false, canceled: true };
  try {
    await convertStructure(srcPath, result.filePath);
    return { ok: true, path: result.filePath };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

/** Ask the renderer to export the current build (it picks the source + name). */
export function notifyExportFile(): void {
  mainWindow?.webContents.send(IPC_EVENTS.exportFile);
}

/** Ask the renderer to open the "Export to mod" dialog for the active document. */
export function notifyExportToWorkspace(): void {
  mainWindow?.webContents.send(IPC_EVENTS.exportToWorkspace);
}

/** Push the current recents list to the renderer (keeps the welcome view in sync). */
export function notifyRecents(): void {
  mainWindow?.webContents.send(IPC_EVENTS.recentsChanged, getRecents());
}

/** Push the active workspace to the renderer (drives the workspace badge). */
export function notifyWorkspace(): void {
  mainWindow?.webContents.send(IPC_EVENTS.workspaceChanged, getActiveWorkspace());
}

/** Push the recent-workspaces list to the renderer (keeps the welcome view in sync). */
export function notifyRecentWorkspaces(): void {
  mainWindow?.webContents.send(IPC_EVENTS.recentWorkspacesChanged, getRecentWorkspaces());
}

/** Ask the renderer to close the current structure (back to the welcome view). */
export function notifyClose(): void {
  mainWindow?.webContents.send(IPC_EVENTS.closeStructure);
}

/** Ask the renderer to open the Settings panel, optionally on a given section
 *  (e.g. 'about' when invoked from the native About menu item). */
export function notifyOpenSettings(section?: string): void {
  mainWindow?.webContents.send(IPC_EVENTS.openSettings, section);
}

/** Ask the renderer to toggle a floating window's visibility (View menu). */
export function notifyWindowToggle(id: string): void {
  mainWindow?.webContents.send(IPC_EVENTS.windowToggle, id);
}

/** Ask the renderer to reset all floating windows to their home positions. */
export function notifyResetWindows(): void {
  mainWindow?.webContents.send(IPC_EVENTS.windowsReset);
}

/** Ask the renderer to open the AI "New Structure" generation panel. */
export function notifyNewStructure(): void {
  mainWindow?.webContents.send(IPC_EVENTS.newStructure);
}

/** Ask the renderer to open the Block Catalog modal (View menu). */
export function notifyOpenCatalog(): void {
  mainWindow?.webContents.send(IPC_EVENTS.openCatalog);
}

/** Ask the renderer to open the Module Gallery modal (View menu). */
export function notifyOpenModules(): void {
  mainWindow?.webContents.send(IPC_EVENTS.openModules);
}

/** Ask the renderer to open the in-app user Guide modal (Help ▸ Guide). */
export function notifyOpenGuide(): void {
  mainWindow?.webContents.send(IPC_EVENTS.openGuide);
}

/** Push the new language to the renderer (it re-renders the UI in that locale). */
export function notifyLanguageChanged(info: LanguageInfo): void {
  mainWindow?.webContents.send(IPC_EVENTS.languageChanged, info);
}

export function notifyUpdateAvailable(info: UpdateInfo): void {
  mainWindow?.webContents.send(IPC_EVENTS.updateAvailable, info);
}

/** Window icon (the standardized logo-dark) for Windows/Linux — macOS uses the
 *  app bundle icon. */
function windowIcon(): string | undefined {
  if (process.platform === 'darwin') return undefined;
  const icon = path.join(app.getAppPath(), 'build', 'icon.png');
  return fs.existsSync(icon) ? icon : undefined;
}

/** Create the single main `BrowserWindow` (hiddenInset titlebar, opaque themed
 *  background, preload bridge), wire its lifecycle, load the renderer, and flush any
 *  pending file the OS asked to open before the window existed. Returns the window. */
export function createWindow(): BrowserWindow {
  mainWindow = new BrowserWindow({
    width: 1180,
    height: 820,
    minWidth: 720,
    minHeight: 520,
    show: false,
    icon: windowIcon(),
    // Opaque themed background (the app uses solid theme surfaces, not vibrancy).
    backgroundColor: '#1a1d23',
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
    trafficLightPosition: { x: 16, y: 12 }, // centred in the 36px top bar
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      // Secure-by-default renderer: isolate the preload's context, no Node in
      // the renderer, and a sandboxed renderer process. These match Electron's
      // current defaults but are set explicitly so a dependency or Electron
      // upgrade can't silently weaken the boundary. (The renderer reaches main
      // only through the contextBridge in preload.ts.)
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  if (MAIN_WINDOW_VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(MAIN_WINDOW_VITE_DEV_SERVER_URL);
  } else {
    mainWindow.loadFile(
      path.join(__dirname, `../renderer/${MAIN_WINDOW_VITE_NAME}/index.html`),
    );
  }

  mainWindow.once('ready-to-show', () => mainWindow?.show());
  mainWindow.webContents.on('did-finish-load', onDidFinishLoad);
  return mainWindow;
}

function onDidFinishLoad() {
  const initial = pendingOpenPath ?? process.env.BW_OPEN ?? null;
  if (initial) {
    mainWindow?.webContents.send(IPC_EVENTS.openPath, initial);
    pendingOpenPath = null;
  }
  // Dev-only: render to a PNG and exit (used for automated visual checks).
  if (process.env.BW_CAPTURE) {
    const out = process.env.BW_CAPTURE;
    setTimeout(() => void captureToFileAndExit(out), Number(process.env.BW_CAPTURE_DELAY) || 2500);
  }
}

/** Dev-only headless screenshot: grab the window to a PNG, then exit. `capturePage()` can
 *  reject transiently at the Chromium Viz/GPU layer ("UnknownVizError") in the moments after
 *  the window appears, so we retry a few times. Either way we ALWAYS `app.quit()` in `finally`
 *  — an unhandled rejection here used to leave the app running, zombying the dev port. */
async function captureToFileAndExit(out: string): Promise<void> {
  try {
    const win = mainWindow;
    if (!win) return;
    let lastErr: unknown;
    for (let attempt = 0; attempt < 5; attempt++) {
      try {
        const img = await win.webContents.capturePage();
        fs.writeFileSync(out, img.toPNG());
        return;
      } catch (err) {
        lastErr = err;
        await new Promise((resolve) => setTimeout(resolve, 400));
      }
    }
    console.error('[BW_CAPTURE] capturePage failed after retries:', lastErr);
  } finally {
    app.quit();
  }
}
