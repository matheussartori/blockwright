// Owns the application window: creation, first-paint, the initial file to open
// (via open-file/BW_OPEN), and the dev-only headless screenshot (BW_CAPTURE).
import { app, BrowserWindow, clipboard, dialog, type OpenDialogOptions, type SaveDialogOptions } from 'electron';
import path from 'node:path';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import type { ExportResult, UpdateInfo } from '@/shared/types';
import type { LanguageInfo } from '@/shared/i18n';
import { IPC_EVENTS } from '@/shared/ipc';
import { DEFAULT_WORLDGEN } from '@/shared/domain/worldgen';
import { outConnectorName, splitPlan } from '@/shared/domain/split';
import { sanitizeResourceName } from '@/shared/domain/worldgen';
import { mt } from './language';
import { getRecents } from './recents';
import { getRecentWorkspaces } from './recent-workspaces';
import { getActiveWorkspace } from './structure/assets/content-pack';
import { convertStructure, readRaw } from './structure/io/convert';
import { splitToJigsaw } from './structure/io/split-structure';
import { DEFAULT_DATA_VERSION } from './structure/mc-data-version';

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
 *  copy; anything else converts via `convertStructure`.
 *
 *  A `.nbt` export bigger than `nbtLimit` can't load as one Structure Block file, so instead
 *  of a single file it's cut into a JIGSAW assembly written to a sibling `<name>_jigsaw/`
 *  folder (a drop-in `data/<ns>/...` tree) — `.schem`/`.litematic` are unaffected (their
 *  mods load arbitrary sizes). A native dialog then explains it needs a datapack to spawn. */
export async function exportStructure(srcPath: string, suggestedName: string, nbtLimit: number): Promise<ExportResult> {
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
  const destPath = result.filePath;
  try {
    if (destPath.toLowerCase().endsWith('.nbt') && nbtLimit > 0) {
      const raw = await readRaw(srcPath);
      const split = splitPlan(raw.size, nbtLimit);
      if (split.oversized) {
        const stem = sanitizeResourceName(path.basename(destPath).replace(/\.nbt$/i, ''));
        const folder = path.join(path.dirname(destPath), `${stem}_jigsaw`);
        const { files } = splitToJigsaw(raw, split, {
          namespace: stem,
          base: stem,
          version: null,
          worldgen: { ...DEFAULT_WORLDGEN, generate: true },
          dataVersion: DEFAULT_DATA_VERSION,
        });
        for (const f of files) {
          const abs = path.join(folder, f.rel);
          await fsp.mkdir(path.dirname(abs), { recursive: true });
          if ('buffer' in f) await fsp.writeFile(abs, f.buffer);
          else await fsp.writeFile(abs, JSON.stringify(f.json, null, 2) + '\n');
        }
        await showSplitNotice(folder, split.pieceCount);
        return { ok: true, path: folder, splitPieces: split.pieceCount };
      }
    }
    await convertStructure(srcPath, destPath);
    return { ok: true, path: destPath };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

/** Tell the user a loose `.nbt` export was split into a jigsaw assembly — it needs a datapack's
 *  worldgen wiring to spawn (Export to World drops it straight into a save; Export to Mod
 *  Workspace wires it into a mod). */
async function showSplitNotice(folder: string, pieces: number): Promise<void> {
  const opts = {
    type: 'info' as const,
    title: mt('dialog.splitTitle'),
    message: mt('dialog.splitMessage', { count: pieces }),
    detail: mt('dialog.splitDetail', { folder }),
    buttons: [mt('dialog.splitOk')],
  };
  if (mainWindow) await dialog.showMessageBox(mainWindow, opts);
  else await dialog.showMessageBox(opts);
}

/** Export the current build straight into a Minecraft WORLD: the user picks their save folder
 *  and Blockwright installs a ready-to-run datapack at `<save>/datapacks/<name>/` — the pieces +
 *  worldgen JSON in the right place — so they only have to /reload and run one command. An
 *  oversized build becomes a jigsaw assembly; a normal one is a single placeable structure. */
export async function exportToWorld(srcPath: string, suggestedName: string, nbtLimit: number): Promise<ExportResult> {
  if (!fs.existsSync(srcPath)) return { ok: false, error: 'The structure file no longer exists on disk.' };
  const pickOpts: OpenDialogOptions = { title: mt('dialog.worldPickTitle'), properties: ['openDirectory'] };
  const picked = mainWindow ? await dialog.showOpenDialog(mainWindow, pickOpts) : await dialog.showOpenDialog(pickOpts);
  if (picked.canceled || !picked.filePaths[0]) return { ok: false, canceled: true };
  const saveRoot = picked.filePaths[0];
  if (!fs.existsSync(path.join(saveRoot, 'level.dat'))) {
    const warn = { type: 'warning' as const, title: mt('dialog.worldPickTitle'), message: mt('dialog.worldNotDatapack'), buttons: [mt('dialog.splitOk')] };
    if (mainWindow) await dialog.showMessageBox(mainWindow, warn);
    else await dialog.showMessageBox(warn);
    return { ok: false, error: mt('dialog.worldNotDatapack') };
  }

  const stem = sanitizeResourceName(path.basename(suggestedName).replace(/\.nbt$/i, ''));
  const packDir = path.join(saveRoot, 'datapacks', stem);
  try {
    const raw = await readRaw(srcPath);
    const split = splitPlan(raw.size, nbtLimit);
    await fsp.mkdir(packDir, { recursive: true });
    await fsp.writeFile(path.join(packDir, 'pack.mcmeta'), JSON.stringify(datapackMeta(), null, 2) + '\n');

    let command: string;
    let pieces = 0;
    if (split.oversized) {
      const { files } = splitToJigsaw(raw, split, {
        namespace: stem,
        base: stem,
        version: null,
        worldgen: { ...DEFAULT_WORLDGEN, generate: true },
        dataVersion: DEFAULT_DATA_VERSION,
      });
      for (const f of files) {
        const abs = path.join(packDir, f.rel);
        await fsp.mkdir(path.dirname(abs), { recursive: true });
        if ('buffer' in f) await fsp.writeFile(abs, f.buffer);
        else await fsp.writeFile(abs, JSON.stringify(f.json, null, 2) + '\n');
      }
      pieces = split.pieceCount;
      // `/place jigsaw`'s target must be the NAME of a jigsaw on the start (root) piece — it
      // anchors the placement there (worldgen needs no such match). The root always owns at
      // least one outbound connector, so use it.
      const rootEdge = split.edges.find((e) => e.parent === split.root);
      const target = rootEdge ? outConnectorName(rootEdge.edgeId) : 'minecraft:empty';
      command = `/place jigsaw ${stem}:${stem}/start ${target} 20 ~ ~ ~`;
    } else {
      const dest = path.join(packDir, 'data', stem, 'structure', `${stem}.nbt`);
      await fsp.mkdir(path.dirname(dest), { recursive: true });
      await convertStructure(srcPath, dest);
      command = `/place template ${stem}:${stem} ~ ~ ~`;
    }
    await showWorldExportNotice(packDir, command, pieces);
    return { ok: true, path: packDir, splitPieces: pieces || undefined };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

/** A lenient datapack `pack.mcmeta`: a 1.21 `pack_format` plus a wide `supported_formats` range
 *  so the pack loads regardless of the world's exact version (it's a throwaway test pack). */
function datapackMeta(): unknown {
  return { pack: { pack_format: 48, supported_formats: { min_inclusive: 4, max_inclusive: 99 }, description: 'Blockwright export' } };
}

/** Confirm the world install and TEACH the exact command to place it (with one-click copy). */
async function showWorldExportNotice(folder: string, command: string, pieces: number): Promise<void> {
  const opts = {
    type: 'info' as const,
    title: mt('dialog.worldTitle'),
    message: pieces > 0 ? mt('dialog.worldMessageSplit', { count: pieces }) : mt('dialog.worldMessageSingle'),
    detail: mt('dialog.worldDetail', { folder, command }),
    buttons: [mt('dialog.splitCopy'), mt('dialog.splitOk')],
    defaultId: 1,
    cancelId: 1,
  };
  const { response } = mainWindow ? await dialog.showMessageBox(mainWindow, opts) : await dialog.showMessageBox(opts);
  if (response === 0) clipboard.writeText(command);
}

/** Ask the renderer to export the current build (it picks the source + name). */
export function notifyExportFile(): void {
  mainWindow?.webContents.send(IPC_EVENTS.exportFile);
}

/** Ask the renderer to export the current build into a Minecraft world save. */
export function notifyExportToWorld(): void {
  mainWindow?.webContents.send(IPC_EVENTS.exportToWorld);
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
