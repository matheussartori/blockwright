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
  ChunkRenderPayload,
  DimensionId,
  ModBlockScope,
  ChatRecord,
  ExportMode,
  ExportResult,
  MaterialsExportRequest,
  RegionRef,
  StructureLocation,
  WorldBackupInfo,
  WorldEditApplyResult,
  WorldEditBlock,
  WorldEditOpenResult,
  WorldExtractBox,
  WorldExtractResult,
  WorldMeta,
  WorldRef,
  WorldWaypoint,
  ReassembleResult,
  RenameProjectResult,
  WorkspaceExportRequest,
  WorkspaceExportPlan,
  WorkspaceJigsawPool,
  WorkspaceExportResult,
  WorkspaceDoctorReport,
  DoctorFixResult,
  WorkspaceUpgradeReport,
  ResolveBlockResult,
  SaveVersionRequest,
  SaveVersionResult,
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
  UpdateInfo,
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
  getContentDir: (): Promise<string | null> => ipcRenderer.invoke(IPC_CHANNELS.contentGetDir),
  chooseContentDir: (): Promise<string | null> => ipcRenderer.invoke(IPC_CHANNELS.contentChooseDir),
  getAppVersion: (): Promise<string> => ipcRenderer.invoke(IPC_CHANNELS.appVersion),
  checkForUpdates: (): Promise<UpdateInfo | null> => ipcRenderer.invoke(IPC_CHANNELS.checkUpdate),
  checkForUpdatesQuiet: (): Promise<UpdateInfo | null> => ipcRenderer.invoke(IPC_CHANNELS.checkUpdateQuiet),
  openExternal: (url: string): Promise<void> => ipcRenderer.invoke(IPC_CHANNELS.openExternal, url),
  getPendingUpdate: (): Promise<UpdateInfo | null> => ipcRenderer.invoke(IPC_CHANNELS.updatePending),
  onUpdateAvailable: (cb: (info: UpdateInfo) => void) => {
    ipcRenderer.on(IPC_EVENTS.updateAvailable, (_e, info: UpdateInfo) => cb(info));
  },
  activateWorkspace: (ws: Workspace): Promise<Workspace | null> =>
    ipcRenderer.invoke(IPC_CHANNELS.workspaceActivate, ws),
  detectFileWorkspace: (path: string): Promise<Workspace | null> =>
    ipcRenderer.invoke(IPC_CHANNELS.workspaceDetectFile, path),
  detectWorldWorkspace: (root: string): Promise<Workspace | null> =>
    ipcRenderer.invoke(IPC_CHANNELS.workspaceDetectWorld, root),
  pinWorkspace: (pin: boolean): Promise<string | null> =>
    ipcRenderer.invoke(IPC_CHANNELS.workspacePin, pin),
  getPinnedWorkspace: (): Promise<string | null> =>
    ipcRenderer.invoke(IPC_CHANNELS.workspacePinnedGet),
  listRecentWorkspaces: (): Promise<Workspace[]> =>
    ipcRenderer.invoke(IPC_CHANNELS.recentWorkspacesList),
  clearRecentWorkspaces: (): Promise<Workspace[]> =>
    ipcRenderer.invoke(IPC_CHANNELS.recentWorkspacesClear),
  openWorld: (root?: string): Promise<WorldMeta | null> =>
    ipcRenderer.invoke(IPC_CHANNELS.worldOpen, root),
  getWorldMeta: (): Promise<WorldMeta | null> => ipcRenderer.invoke(IPC_CHANNELS.worldMeta),
  listWorldRegions: (dim: DimensionId): Promise<RegionRef[]> =>
    ipcRenderer.invoke(IPC_CHANNELS.worldListRegions, dim),
  getChunk: (dim: DimensionId, cx: number, cz: number): Promise<ChunkRenderPayload | null> =>
    ipcRenderer.invoke(IPC_CHANNELS.worldGetChunk, dim, cx, cz),
  getChunks: (dim: DimensionId, coords: { cx: number; cz: number }[]): Promise<(ChunkRenderPayload | null)[]> =>
    ipcRenderer.invoke(IPC_CHANNELS.worldGetChunks, dim, coords),
  findWorldStructures: (dim: DimensionId): Promise<StructureLocation[]> =>
    ipcRenderer.invoke(IPC_CHANNELS.worldFindStructures, dim),
  getWorldWaypoints: (root: string): Promise<WorldWaypoint[]> =>
    ipcRenderer.invoke(IPC_CHANNELS.worldWaypointsGet, root),
  setWorldWaypoints: (root: string, waypoints: WorldWaypoint[]): Promise<WorldWaypoint[]> =>
    ipcRenderer.invoke(IPC_CHANNELS.worldWaypointsSet, root, waypoints),
  openWorldEdit: (dim: DimensionId): Promise<WorldEditOpenResult> =>
    ipcRenderer.invoke(IPC_CHANNELS.worldEditOpen, dim),
  closeWorldEdit: (): Promise<void> => ipcRenderer.invoke(IPC_CHANNELS.worldEditClose),
  applyWorldEdits: (dim: DimensionId, edits: WorldEditBlock[], retention: number, sizeCapMb = 0): Promise<WorldEditApplyResult> =>
    ipcRenderer.invoke(IPC_CHANNELS.worldEditApply, dim, edits, retention, sizeCapMb),
  extractFromWorld: (dim: DimensionId, box: WorldExtractBox, nbtLimit: number): Promise<WorldExtractResult> =>
    ipcRenderer.invoke(IPC_CHANNELS.worldExtract, dim, box, nbtLimit),
  listWorldBackups: (): Promise<WorldBackupInfo[]> => ipcRenderer.invoke(IPC_CHANNELS.worldBackupsList),
  restoreWorldBackup: (id: string): Promise<WorldBackupInfo> =>
    ipcRenderer.invoke(IPC_CHANNELS.worldBackupRestore, id),
  deleteWorldBackup: (id: string): Promise<WorldBackupInfo[]> =>
    ipcRenderer.invoke(IPC_CHANNELS.worldBackupDelete, id),
  listRecentWorlds: (): Promise<WorldRef[]> => ipcRenderer.invoke(IPC_CHANNELS.recentWorldsList),
  clearRecentWorlds: (): Promise<WorldRef[]> => ipcRenderer.invoke(IPC_CHANNELS.recentWorldsClear),
  listWorkspaceStructures: (): Promise<string[]> =>
    ipcRenderer.invoke(IPC_CHANNELS.workspaceStructures),
  listWorkspaceJigsaws: (): Promise<WorkspaceJigsawPool[]> =>
    ipcRenderer.invoke(IPC_CHANNELS.workspaceJigsaws),
  setWorkspaceVersion: (version: string): Promise<Workspace | null> =>
    ipcRenderer.invoke(IPC_CHANNELS.workspaceSetVersion, version),
  listWorkspaceBiomes: (): Promise<string[]> => ipcRenderer.invoke(IPC_CHANNELS.workspaceBiomes),
  planWorkspaceExport: (req: WorkspaceExportRequest): Promise<WorkspaceExportPlan> =>
    ipcRenderer.invoke(IPC_CHANNELS.workspaceExportPlan, req),
  exportToWorkspace: (req: WorkspaceExportRequest): Promise<WorkspaceExportResult> =>
    ipcRenderer.invoke(IPC_CHANNELS.workspaceExport, req),
  resolveBlock: (name: string, properties?: Record<string, string>): Promise<ResolveBlockResult> =>
    ipcRenderer.invoke(IPC_CHANNELS.resolveBlock, name, properties),
  rethemeMap: (blocks: string[], decorationId: string): Promise<Record<string, string>> =>
    ipcRenderer.invoke(IPC_CHANNELS.rethemeMap, blocks, decorationId),
  saveRender: (data: ArrayBuffer, suggestedName: string, kind: 'png' | 'webm'): Promise<string | null> =>
    ipcRenderer.invoke(IPC_CHANNELS.saveRender, data, suggestedName, kind),
  watchFile: (filePath: string | null): Promise<void> => ipcRenderer.invoke(IPC_CHANNELS.watchFile, filePath),
  workspaceDoctor: (): Promise<WorkspaceDoctorReport> => ipcRenderer.invoke(IPC_CHANNELS.workspaceDoctor),
  workspaceDoctorFix: (code: string, file: string): Promise<DoctorFixResult> =>
    ipcRenderer.invoke(IPC_CHANNELS.workspaceDoctorFix, code, file),
  workspaceUpgrade: (): Promise<WorkspaceUpgradeReport> => ipcRenderer.invoke(IPC_CHANNELS.workspaceUpgrade),
  onFileChanged: (cb: (path: string) => void) => {
    ipcRenderer.on(IPC_EVENTS.fileChanged, (_e, p: string) => cb(p));
  },
  onWorkspaceStructuresChanged: (cb: () => void) => {
    ipcRenderer.on(IPC_EVENTS.workspaceStructuresChanged, () => cb());
  },
  onOpenDoctor: (cb: () => void) => {
    ipcRenderer.on(IPC_EVENTS.openDoctor, () => cb());
  },
  saveVersion: (req: SaveVersionRequest): Promise<SaveVersionResult> =>
    ipcRenderer.invoke(IPC_CHANNELS.saveVersion, req),
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
  aiSetLibraryRetention: (keep: number): Promise<AiConfig> =>
    ipcRenderer.invoke(IPC_CHANNELS.aiSetLibraryRetention, keep),
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
  aiDeleteVersion: (sessionId: string, version: number): Promise<boolean> =>
    ipcRenderer.invoke(IPC_CHANNELS.aiDeleteVersion, sessionId, version),
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
  setFileOpen: (open: boolean, oversized: boolean) => {
    ipcRenderer.invoke(IPC_CHANNELS.setFileOpen, open, oversized);
  },
  setProjectOpen: (open: boolean) => {
    ipcRenderer.invoke(IPC_CHANNELS.setProjectOpen, open);
  },
  renameProject: (currentFile: string, newName: string, sessionId?: string): Promise<RenameProjectResult> =>
    ipcRenderer.invoke(IPC_CHANNELS.projectRename, currentFile, newName, sessionId),
  reassembleAssembly: (): Promise<ReassembleResult> => ipcRenderer.invoke(IPC_CHANNELS.assemblyReassemble),
  reimportWorld: (): Promise<ReassembleResult> => ipcRenderer.invoke(IPC_CHANNELS.worldReimport),
  exportStructure: (srcPath: string, suggestedName: string, nbtLimit: number, mode: ExportMode, preferred?: 'nbt' | 'schem' | 'litematic'): Promise<ExportResult> =>
    ipcRenderer.invoke(IPC_CHANNELS.exportFile, srcPath, suggestedName, nbtLimit, mode, preferred),
  exportToWorld: (srcPath: string, suggestedName: string, nbtLimit: number): Promise<ExportResult> =>
    ipcRenderer.invoke(IPC_CHANNELS.exportWorld, srcPath, suggestedName, nbtLimit),
  exportMaterials: (req: MaterialsExportRequest): Promise<ExportResult> =>
    ipcRenderer.invoke(IPC_CHANNELS.exportMaterials, req),
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
  onPinnedWorkspaceChanged: (cb: (root: string | null) => void) => {
    ipcRenderer.on(IPC_EVENTS.pinnedWorkspaceChanged, (_e, root: string | null) => cb(root));
  },
  onOpenWorld: (cb: (root: string) => void) => {
    ipcRenderer.on(IPC_EVENTS.openWorld, (_e, root: string) => cb(root));
  },
  onRecentWorldsChanged: (cb: (worlds: WorldRef[]) => void) => {
    ipcRenderer.on(IPC_EVENTS.recentWorldsChanged, (_e, list: WorldRef[]) => cb(list));
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
  onExportToWorld: (cb: () => void) => {
    ipcRenderer.on(IPC_EVENTS.exportToWorld, () => cb());
  },
  onExportFile: (cb: (mode: ExportMode) => void) => {
    ipcRenderer.on(IPC_EVENTS.exportFile, (_e, mode: ExportMode) => cb(mode ?? 'nbt'));
  },
  onExportToWorkspace: (cb: () => void) => {
    ipcRenderer.on(IPC_EVENTS.exportToWorkspace, () => cb());
  },
  onRenameProject: (cb: () => void) => {
    ipcRenderer.on(IPC_EVENTS.renameProject, () => cb());
  },
  onOpenAssembly: (cb: () => void) => {
    ipcRenderer.on(IPC_EVENTS.openAssembly, () => cb());
  },
  onReimportWorld: (cb: () => void) => {
    ipcRenderer.on(IPC_EVENTS.reimportWorld, () => cb());
  },
  onCompareFile: (cb: () => void) => {
    ipcRenderer.on(IPC_EVENTS.compareFile, () => cb());
  },
  onRetheme: (cb: () => void) => {
    ipcRenderer.on(IPC_EVENTS.retheme, () => cb());
  },
  onRenderImage: (cb: () => void) => {
    ipcRenderer.on(IPC_EVENTS.renderImage, () => cb());
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
