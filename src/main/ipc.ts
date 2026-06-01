// Registers the main-process handlers for the IPC contract in shared/ipc.ts.
import { dialog, ipcMain } from 'electron';
import fs from 'node:fs';
import type { AssembleOptions, Workspace } from '@/shared/types';
import { IPC_CHANNELS } from '@/shared/ipc';
import { loadStructure } from './structure/load-structure';
import { contentPackVersion, getActiveWorkspace, resolveTextureFile } from './structure/content-pack';
import { assembleJigsaw, jigsawCandidates } from './structure/jigsaw-assembler';
import { structureIdFromPath } from './structure/template-pool';
import { addRecent, clearRecents, getRecents, removeRecent } from './recents';
import { clearRecentWorkspaces, getRecentWorkspaces } from './recent-workspaces';
import {
  activateWorkspace,
  applyWorkspace,
  detectWorkspaceForFile,
  listWorkspaceStructures,
  promptOpenWorkspace,
  setWorkspaceVersion,
} from './workspace';
import { notifyRecentWorkspaces, openFileDialog } from './window';
import { buildAppMenu, refreshMenu, setFileOpen } from './app-menu';

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
  ipcMain.handle(IPC_CHANNELS.contentVersion, async () => contentPackVersion());
  ipcMain.handle(IPC_CHANNELS.workspaceStructures, async () =>
    listWorkspaceStructures(getActiveWorkspace()),
  );
  ipcMain.handle(IPC_CHANNELS.workspaceActivate, async (_e, ws: Workspace) => {
    const active = activateWorkspace(ws);
    buildAppMenu();
    return active;
  });
  ipcMain.handle(IPC_CHANNELS.workspaceDetectFile, async (_e, filePath: string) =>
    detectWorkspaceForFile(filePath),
  );
  ipcMain.handle(IPC_CHANNELS.recentWorkspacesList, async () => getRecentWorkspaces());
  ipcMain.handle(IPC_CHANNELS.recentWorkspacesClear, async () => {
    const list = clearRecentWorkspaces();
    notifyRecentWorkspaces();
    buildAppMenu();
    return list;
  });
  ipcMain.handle(IPC_CHANNELS.workspaceSetVersion, async (_e, version: string) => {
    const ws = setWorkspaceVersion(version);
    buildAppMenu();
    return ws;
  });

  ipcMain.handle(IPC_CHANNELS.jigsawAssemble, async (_e, filePath: string, options: AssembleOptions) =>
    assembleJigsaw(filePath, structureIdFromPath(filePath), options),
  );
  ipcMain.handle(IPC_CHANNELS.jigsawCandidates, async (_e, filePath: string, index: number) =>
    jigsawCandidates(filePath, index),
  );

  ipcMain.handle(IPC_CHANNELS.setFileOpen, async (_e, open: boolean) => setFileOpen(open));
}
