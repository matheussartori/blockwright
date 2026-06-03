import { contextBridge, ipcRenderer, webUtils } from 'electron';
import { IPC_CHANNELS, IPC_EVENTS } from '@/shared/ipc';
import type {
  ApiKeyInfo,
  AssembleOptions,
  BlockwrightApi,
  GenerateImage,
  GenerateProgress,
  GenerateResult,
  RenderRequest,
  RenderResult,
  JigsawCandidate,
  JigsawPlan,
  StructureData,
  Workspace,
  WindowId,
  WindowsReport,
} from '@/shared/types';

const api: BlockwrightApi = {
  platform: process.platform,
  captureAssemble: () => ipcRenderer.invoke(IPC_CHANNELS.captureConfig),
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
  aiAvailable: (): Promise<boolean> => ipcRenderer.invoke(IPC_CHANNELS.aiAvailable),
  aiKeyInfo: (): Promise<ApiKeyInfo> => ipcRenderer.invoke(IPC_CHANNELS.aiKeyInfo),
  aiSetKey: (key: string): Promise<ApiKeyInfo> => ipcRenderer.invoke(IPC_CHANNELS.aiSetKey, key),
  aiClearKey: (): Promise<ApiKeyInfo> => ipcRenderer.invoke(IPC_CHANNELS.aiClearKey),
  aiGenerate: (sessionId: string, prompt: string, images?: GenerateImage[], basePath?: string): Promise<GenerateResult> =>
    ipcRenderer.invoke(IPC_CHANNELS.aiGenerate, sessionId, prompt, images, basePath),
  aiCancel: (sessionId: string): Promise<void> =>
    ipcRenderer.invoke(IPC_CHANNELS.aiCancel, sessionId),
  aiResetSession: (sessionId: string): Promise<void> =>
    ipcRenderer.invoke(IPC_CHANNELS.aiResetSession, sessionId),
  onAiProgress: (cb: (progress: GenerateProgress) => void) => {
    ipcRenderer.on(IPC_EVENTS.aiProgress, (_e, p: GenerateProgress) => cb(p));
  },
  onAiRenderRequest: (cb: (req: RenderRequest) => void) => {
    ipcRenderer.on(IPC_EVENTS.aiRenderRequest, (_e, req: RenderRequest) => cb(req));
  },
  sendRenderResult: (result: RenderResult) => {
    ipcRenderer.invoke(IPC_CHANNELS.aiRenderResult, result);
  },
  setFileOpen: (open: boolean) => {
    ipcRenderer.invoke(IPC_CHANNELS.setFileOpen, open);
  },
  reportWindows: (state: WindowsReport) => {
    ipcRenderer.invoke(IPC_CHANNELS.windowsReport, state);
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
  onToggleWindow: (cb: (id: WindowId) => void) => {
    ipcRenderer.on(IPC_EVENTS.windowToggle, (_e, id: WindowId) => cb(id));
  },
  onResetWindows: (cb: () => void) => {
    ipcRenderer.on(IPC_EVENTS.windowsReset, () => cb());
  },
  onNewStructure: (cb: () => void) => {
    ipcRenderer.on(IPC_EVENTS.newStructure, () => cb());
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
