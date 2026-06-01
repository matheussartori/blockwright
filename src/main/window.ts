// Owns the application window: creation, first-paint, the initial file to open
// (via open-file/BW_OPEN), and the dev-only headless screenshot (BW_CAPTURE).
import { app, BrowserWindow, dialog, type OpenDialogOptions } from 'electron';
import path from 'node:path';
import fs from 'node:fs';
import { IPC_EVENTS } from '@/shared/ipc';
import { getRecents } from './recents';
import { getActiveWorkspace } from './structure/content-pack';

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
    title: 'Open NBT structure',
    properties: ['openFile'],
    filters: [{ name: 'NBT structure', extensions: ['nbt'] }],
  };
  const result = mainWindow
    ? await dialog.showOpenDialog(mainWindow, options)
    : await dialog.showOpenDialog(options);
  return result.canceled ? null : result.filePaths[0];
}

/** Show the native directory picker for choosing a mod workspace. */
export async function openDirectoryDialog(): Promise<string | null> {
  const options: OpenDialogOptions = {
    title: 'Open mod workspace',
    properties: ['openDirectory'],
  };
  const result = mainWindow
    ? await dialog.showOpenDialog(mainWindow, options)
    : await dialog.showOpenDialog(options);
  return result.canceled ? null : result.filePaths[0];
}

/** Push the current recents list to the renderer (keeps the welcome view in sync). */
export function notifyRecents(): void {
  mainWindow?.webContents.send(IPC_EVENTS.recentsChanged, getRecents());
}

/** Push the active workspace to the renderer (drives the workspace badge). */
export function notifyWorkspace(): void {
  mainWindow?.webContents.send(IPC_EVENTS.workspaceChanged, getActiveWorkspace());
}

export function createWindow(): BrowserWindow {
  mainWindow = new BrowserWindow({
    width: 1180,
    height: 820,
    minWidth: 720,
    minHeight: 520,
    show: false,
    backgroundColor: process.platform === 'darwin' ? '#00000000' : '#1c1c1e',
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
    trafficLightPosition: { x: 16, y: 18 },
    vibrancy: process.platform === 'darwin' ? 'under-window' : undefined,
    visualEffectState: 'active',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
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
    setTimeout(async () => {
      const img = await mainWindow!.webContents.capturePage();
      fs.writeFileSync(process.env.BW_CAPTURE!, img.toPNG());
      app.quit();
    }, 2500);
  }
}
