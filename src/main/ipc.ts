// Registers the main-process handlers for the IPC contract in shared/ipc.ts.
import { dialog, ipcMain } from 'electron';
import fs from 'node:fs';
import { IPC_CHANNELS } from '@/shared/ipc';
import { loadStructure } from './structure/load-structure';
import { getActiveWorkspace, resolveTextureFile } from './structure/content-pack';
import { addRecent, clearRecents, getRecents, removeRecent } from './recents';
import { applyWorkspace, promptOpenWorkspace } from './workspace';
import { openFileDialog } from './window';
import { buildAppMenu, refreshMenu } from './app-menu';

export function registerIpc(): void {
  ipcMain.handle(IPC_CHANNELS.openDialog, async () => openFileDialog());

  ipcMain.handle(IPC_CHANNELS.loadStructure, async (_e, filePath: string) => {
    return loadStructure(filePath);
  });

  ipcMain.handle(IPC_CHANNELS.hasTexture, async (_e, key: string) => {
    const resolved = resolveTextureFile(key);
    return !!resolved && fs.existsSync(resolved.file);
  });

  ipcMain.handle(IPC_CHANNELS.pathExists, async (_e, filePath: string) => {
    return fs.existsSync(filePath);
  });

  // Recents mutations rebuild the native menu and broadcast the new list so the
  // welcome view stays in sync regardless of where the change originated.
  ipcMain.handle(IPC_CHANNELS.recentsList, async () => getRecents());
  ipcMain.handle(IPC_CHANNELS.recentsAdd, async (_e, filePath: string) => {
    const list = addRecent(filePath);
    refreshMenu();
    return list;
  });
  ipcMain.handle(IPC_CHANNELS.recentsRemove, async (_e, filePath: string) => {
    const list = removeRecent(filePath);
    refreshMenu();
    return list;
  });
  ipcMain.handle(IPC_CHANNELS.recentsClear, async () => {
    const list = clearRecents();
    refreshMenu();
    return list;
  });

  ipcMain.handle(IPC_CHANNELS.workspaceOpen, async () => {
    const { workspace, error } = await promptOpenWorkspace();
    if (error) dialog.showErrorBox('Open mod workspace', error);
    buildAppMenu(); // reflect the active workspace in the File menu
    return workspace;
  });
  ipcMain.handle(IPC_CHANNELS.workspaceClose, async () => {
    applyWorkspace(null);
    buildAppMenu();
    return null;
  });
  ipcMain.handle(IPC_CHANNELS.workspaceGet, async () => getActiveWorkspace());
}
