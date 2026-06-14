import { contextBridge, ipcRenderer, webUtils } from 'electron';
import { IPC_CHANNELS, IPC_EVENTS } from '@/shared/ipc';
import type { AiConfig, AiProviderId, GenerationSettings } from '@/shared/ai';
import type { LanguageInfo, LanguagePref } from '@/shared/i18n';
import type {
  AssembleOptions,
  BlockDictionary,
  BlockNote,
  BlockwrightApi,
  BuildSelection,
  ModBlockScope,
  ChatRecord,
  ExportResult,
  FloorDef,
  GenerateImage,
  GenerateProgress,
  GenerateResult,
  ModuleCategory,
  RenderRequest,
  RenderResult,
  JigsawCandidate,
  JigsawPlan,
  LogEntry,
  StructureData,
  VersionInfo,
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
  listCatalog: () => ipcRenderer.invoke(IPC_CHANNELS.catalogList),
  previewBlock: (id: string) => ipcRenderer.invoke(IPC_CHANNELS.previewBlock, id),
  getDictionary: (): Promise<BlockDictionary | null> => ipcRenderer.invoke(IPC_CHANNELS.dictionaryGet),
  setBlockNote: (note: BlockNote): Promise<BlockDictionary | null> =>
    ipcRenderer.invoke(IPC_CHANNELS.dictionarySetNote, note),
  setDictionaryScope: (scope: ModBlockScope): Promise<BlockDictionary | null> =>
    ipcRenderer.invoke(IPC_CHANNELS.dictionarySetScope, scope),
  generationCatalog: () => ipcRenderer.invoke(IPC_CHANNELS.generationCatalog),
  previewModule: (category: ModuleCategory, id: string): Promise<StructureData> =>
    ipcRenderer.invoke(IPC_CHANNELS.previewModule, category, id),
  setThemeSource: (pref: 'system' | 'light' | 'dark') => ipcRenderer.invoke(IPC_CHANNELS.themeSet, pref),
  getLanguage: (): Promise<LanguageInfo> => ipcRenderer.invoke(IPC_CHANNELS.languageGet),
  setLanguage: (pref: LanguagePref): Promise<LanguageInfo> =>
    ipcRenderer.invoke(IPC_CHANNELS.languageSet, pref),
  onLanguageChanged: (cb: (info: LanguageInfo) => void) => {
    ipcRenderer.on(IPC_EVENTS.languageChanged, (_e, info: LanguageInfo) => cb(info));
  },
  openWorkspace: (): Promise<Workspace | null> => ipcRenderer.invoke(IPC_CHANNELS.workspaceOpen),
  closeWorkspace: (): Promise<null> => ipcRenderer.invoke(IPC_CHANNELS.workspaceClose),
  getWorkspace: (): Promise<Workspace | null> => ipcRenderer.invoke(IPC_CHANNELS.workspaceGet),
  getContentVersion: (): Promise<string | null> => ipcRenderer.invoke(IPC_CHANNELS.contentVersion),
  getAppVersion: (): Promise<string> => ipcRenderer.invoke(IPC_CHANNELS.appVersion),
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
  aiGetConfig: (): Promise<AiConfig> => ipcRenderer.invoke(IPC_CHANNELS.aiGetConfig),
  aiSetActiveProvider: (id: AiProviderId): Promise<AiConfig> =>
    ipcRenderer.invoke(IPC_CHANNELS.aiSetActiveProvider, id),
  aiSetModel: (id: AiProviderId, model: string): Promise<AiConfig> =>
    ipcRenderer.invoke(IPC_CHANNELS.aiSetModel, id, model),
  aiSetCredential: (id: AiProviderId, secret: string): Promise<AiConfig> =>
    ipcRenderer.invoke(IPC_CHANNELS.aiSetCredential, id, secret),
  aiClearCredential: (id: AiProviderId): Promise<AiConfig> =>
    ipcRenderer.invoke(IPC_CHANNELS.aiClearCredential, id),
  aiSetGeneration: (patch: Partial<GenerationSettings>): Promise<AiConfig> =>
    ipcRenderer.invoke(IPC_CHANNELS.aiSetGeneration, patch),
  aiGenerate: (
    sessionId: string,
    prompt: string,
    images?: GenerateImage[],
    selection?: BuildSelection,
    basePath?: string,
    floors?: FloorDef[],
  ): Promise<GenerateResult> =>
    ipcRenderer.invoke(IPC_CHANNELS.aiGenerate, sessionId, prompt, images, selection, basePath, floors),
  aiCancel: (sessionId: string): Promise<void> =>
    ipcRenderer.invoke(IPC_CHANNELS.aiCancel, sessionId),
  aiResetSession: (sessionId: string): Promise<void> =>
    ipcRenderer.invoke(IPC_CHANNELS.aiResetSession, sessionId),
  aiPrimeSession: (sessionId: string, sdkSessionId: string | null, version: number): Promise<void> =>
    ipcRenderer.invoke(IPC_CHANNELS.aiPrimeSession, sessionId, sdkSessionId, version),
  aiListVersions: (sessionId: string): Promise<VersionInfo[]> =>
    ipcRenderer.invoke(IPC_CHANNELS.aiListVersions, sessionId),
  aiGetOutputDir: (): Promise<string> => ipcRenderer.invoke(IPC_CHANNELS.aiGetOutputDir),
  aiChooseOutputDir: (): Promise<string | null> => ipcRenderer.invoke(IPC_CHANNELS.aiChooseOutputDir),
  revealPath: (target: string): Promise<void> => ipcRenderer.invoke(IPC_CHANNELS.revealPath, target),
  chatHistoryGet: (key: string): Promise<ChatRecord | null> =>
    ipcRenderer.invoke(IPC_CHANNELS.chatHistoryGet, key),
  chatHistorySave: (key: string, record: ChatRecord): Promise<void> =>
    ipcRenderer.invoke(IPC_CHANNELS.chatHistorySave, key, record),
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
  exportStructure: (srcPath: string, suggestedName: string): Promise<ExportResult> =>
    ipcRenderer.invoke(IPC_CHANNELS.exportFile, srcPath, suggestedName),
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
  onOpenSettings: (cb: (section?: string) => void) => {
    ipcRenderer.on(IPC_EVENTS.openSettings, (_e, section?: string) => cb(section));
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
  onExportFile: (cb: () => void) => {
    ipcRenderer.on(IPC_EVENTS.exportFile, () => cb());
  },
  getLogBacklog: () => ipcRenderer.invoke(IPC_CHANNELS.logBacklog),
  onLogEntry: (cb: (entry: LogEntry) => void) => {
    ipcRenderer.on(IPC_EVENTS.logEntry, (_e, entry: LogEntry) => cb(entry));
  },
  onOpenCatalog: (cb: () => void) => {
    ipcRenderer.on(IPC_EVENTS.openCatalog, () => cb());
  },
  onOpenModules: (cb: () => void) => {
    ipcRenderer.on(IPC_EVENTS.openModules, () => cb());
  },
  onOpenGuide: (cb: () => void) => {
    ipcRenderer.on(IPC_EVENTS.openGuide, () => cb());
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
