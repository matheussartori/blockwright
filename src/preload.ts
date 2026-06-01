import { contextBridge, ipcRenderer, webUtils } from 'electron';
import { IPC_CHANNELS, IPC_EVENTS } from '@/shared/ipc';
import type {
  AssembleOptions,
  BlockwrightApi,
  JigsawCandidate,
  JigsawPlan,
  StructureData,
  Workspace,
} from '@/shared/types';

const api: BlockwrightApi = {
  platform: process.platform,
  openDialog: () => ipcRenderer.invoke(IPC_CHANNELS.openDialog),
  loadStructure: (path: string): Promise<StructureData> =>
    ipcRenderer.invoke(IPC_CHANNELS.loadStructure, path),
  // Constant host keeps the namespace in the path, so namespaces with
  // underscores survive URL host parsing (e.g. bw-texture://asset/my_mod/...).
  textureUrl: (key: string) => `bw-texture://asset/${key}.png`,
  hasTexture: (key: string) => ipcRenderer.invoke(IPC_CHANNELS.hasTexture, key),
  pathExists: (path: string) => ipcRenderer.invoke(IPC_CHANNELS.pathExists, path),
  openWorkspace: (): Promise<Workspace | null> => ipcRenderer.invoke(IPC_CHANNELS.workspaceOpen),
  closeWorkspace: (): Promise<null> => ipcRenderer.invoke(IPC_CHANNELS.workspaceClose),
  getWorkspace: (): Promise<Workspace | null> => ipcRenderer.invoke(IPC_CHANNELS.workspaceGet),
  getContentVersion: (): Promise<string | null> => ipcRenderer.invoke(IPC_CHANNELS.contentVersion),
  activateWorkspace: (ws: Workspace): Promise<Workspace | null> =>
    ipcRenderer.invoke(IPC_CHANNELS.workspaceActivate, ws),
  detectFileWorkspace: (path: string): Promise<Workspace | null> =>
    ipcRenderer.invoke(IPC_CHANNELS.workspaceDetectFile, path),
  listRecentWorkspaces: (): Promise<Workspace[]> =>
    ipcRenderer.invoke(IPC_CHANNELS.recentWorkspacesList),
  clearRecentWorkspaces: (): Promise<Workspace[]> =>
    ipcRenderer.invoke(IPC_CHANNELS.recentWorkspacesClear),
  listWorkspaceStructures: (): Promise<string[]> =>
    ipcRenderer.invoke(IPC_CHANNELS.workspaceStructures),
  setWorkspaceVersion: (version: string): Promise<Workspace | null> =>
    ipcRenderer.invoke(IPC_CHANNELS.workspaceSetVersion, version),
  assembleJigsaw: (path: string, options: AssembleOptions): Promise<JigsawPlan> =>
    ipcRenderer.invoke(IPC_CHANNELS.jigsawAssemble, path, options),
  jigsawCandidates: (path: string, connectorIndex: number): Promise<JigsawCandidate[]> =>
    ipcRenderer.invoke(IPC_CHANNELS.jigsawCandidates, path, connectorIndex),
  setFileOpen: (open: boolean) => {
    ipcRenderer.invoke(IPC_CHANNELS.setFileOpen, open);
  },
  listRecents: () => ipcRenderer.invoke(IPC_CHANNELS.recentsList),
  addRecent: (path: string) => ipcRenderer.invoke(IPC_CHANNELS.recentsAdd, path),
  removeRecent: (path: string) => ipcRenderer.invoke(IPC_CHANNELS.recentsRemove, path),
  clearRecents: () => ipcRenderer.invoke(IPC_CHANNELS.recentsClear),
  onOpenPath: (cb: (path: string) => void) => {
    ipcRenderer.on(IPC_EVENTS.openPath, (_e, p: string) => cb(p));
  },
  onRecentsChanged: (cb: (paths: string[]) => void) => {
    ipcRenderer.on(IPC_EVENTS.recentsChanged, (_e, paths: string[]) => cb(paths));
  },
  onWorkspaceChanged: (cb: (workspace: Workspace | null) => void) => {
    ipcRenderer.on(IPC_EVENTS.workspaceChanged, (_e, ws: Workspace | null) => cb(ws));
  },
  onRecentWorkspacesChanged: (cb: (workspaces: Workspace[]) => void) => {
    ipcRenderer.on(IPC_EVENTS.recentWorkspacesChanged, (_e, list: Workspace[]) => cb(list));
  },
  onCloseStructure: (cb: () => void) => {
    ipcRenderer.on(IPC_EVENTS.closeStructure, () => cb());
  },
  onOpenSettings: (cb: () => void) => {
    ipcRenderer.on(IPC_EVENTS.openSettings, () => cb());
  },
  onFileDrop: (cb: (path: string) => void) => {
    window.addEventListener('dragover', (e) => e.preventDefault());
    window.addEventListener('drop', (e) => {
      e.preventDefault();
      const file = e.dataTransfer?.files[0];
      if (file && file.name.endsWith('.nbt')) cb(webUtils.getPathForFile(file));
    });
  },
};

contextBridge.exposeInMainWorld('blockwright', api);
