// Registers the main-process handlers for the IPC contract in shared/ipc.ts.
import { dialog, ipcMain } from 'electron';
import fs from 'node:fs';
import { IPC_CHANNELS } from '@/shared/ipc';
import { loadStructure } from './structure/load-structure';
import { textureFile } from './structure/content-pack';

export function registerIpc(): void {
  ipcMain.handle(IPC_CHANNELS.openDialog, async () => {
    const result = await dialog.showOpenDialog({
      title: 'Open NBT structure',
      properties: ['openFile'],
      filters: [{ name: 'NBT structure', extensions: ['nbt'] }],
    });
    return result.canceled ? null : result.filePaths[0];
  });

  ipcMain.handle(IPC_CHANNELS.loadStructure, async (_e, filePath: string) => {
    return loadStructure(filePath);
  });

  ipcMain.handle(IPC_CHANNELS.hasTexture, async (_e, key: string) => {
    return fs.existsSync(textureFile(key));
  });
}
