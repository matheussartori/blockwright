// Registers the main-process handlers for the IPC contract in shared/ipc.ts.
import { ipcMain } from 'electron';
import fs from 'node:fs';
import { IPC_CHANNELS } from '@/shared/ipc';
import { loadStructure } from './structure/load-structure';
import { textureFile } from './structure/content-pack';
import { addRecent, clearRecents, getRecents, removeRecent } from './recents';
import { openFileDialog } from './window';
import { refreshMenu } from './app-menu';

export function registerIpc(): void {
  ipcMain.handle(IPC_CHANNELS.openDialog, async () => openFileDialog());

  ipcMain.handle(IPC_CHANNELS.loadStructure, async (_e, filePath: string) => {
    return loadStructure(filePath);
  });

  ipcMain.handle(IPC_CHANNELS.hasTexture, async (_e, key: string) => {
    return fs.existsSync(textureFile(key));
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
}
