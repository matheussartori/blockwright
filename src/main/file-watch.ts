// Watch mode — the worldgen dev-loop's hot reload. Two watchers, both best-effort
// (a watch failure never breaks the app, it just means no live reload):
//  • the OPEN FILE: an external edit (Axiom export, VS Code, a datapack build script)
//    pushes `file-changed`, and the renderer reloads the viewer in place.
//  • the active workspace's STRUCTURE FOLDER: files appearing/disappearing push
//    `workspace-structures-changed`, so the Project panel's list stays live.
// Events are debounced — editors typically fire several fs events per save, and a
// half-written file mustn't trigger a decode.
import fs from 'node:fs';
import path from 'node:path';
import { structureFolder } from '@/shared/domain/worldgen';
import type { Workspace } from '@/shared/types';
import { IPC_EVENTS } from '@/shared/ipc';
import { getMainWindow } from './window';

const DEBOUNCE_MS = 300;

let fileWatcher: fs.FSWatcher | null = null;
let watchedFile: string | null = null;
let fileTimer: NodeJS.Timeout | null = null;

let dirWatcher: fs.FSWatcher | null = null;
let watchedDir: string | null = null;
let dirTimer: NodeJS.Timeout | null = null;

/** Watch (or stop watching, with null) the renderer's active structure file. */
export function watchOpenFile(filePath: string | null): void {
  if (watchedFile === filePath) return;
  fileWatcher?.close();
  fileWatcher = null;
  watchedFile = filePath;
  if (!filePath || !fs.existsSync(filePath)) return;
  try {
    fileWatcher = fs.watch(filePath, () => {
      if (fileTimer) clearTimeout(fileTimer);
      fileTimer = setTimeout(() => {
        // A save-by-rename can briefly remove the file; only report it once it's back.
        if (watchedFile === filePath && fs.existsSync(filePath)) {
          getMainWindow()?.webContents.send(IPC_EVENTS.fileChanged, filePath);
        }
      }, DEBOUNCE_MS);
    });
  } catch {
    // best-effort — some filesystems/paths can't be watched
  }
}

/** Watch the active workspace's structure folder (null workspace = stop). */
export function watchWorkspaceStructures(ws: Workspace | null): void {
  const dir = ws ? path.join(ws.root, 'data', ws.namespace, structureFolder(ws.minecraftVersion)) : null;
  if (watchedDir === dir) return;
  dirWatcher?.close();
  dirWatcher = null;
  watchedDir = dir;
  if (!dir || !fs.existsSync(dir)) return;
  try {
    dirWatcher = fs.watch(dir, { recursive: true }, () => {
      if (dirTimer) clearTimeout(dirTimer);
      dirTimer = setTimeout(() => {
        if (watchedDir === dir) getMainWindow()?.webContents.send(IPC_EVENTS.workspaceStructuresChanged);
      }, DEBOUNCE_MS);
    });
  } catch {
    // best-effort
  }
}
