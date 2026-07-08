// The preload bridge contract: every method/event the renderer reaches main
// through (window.blockwright). One method per IPC channel/event in shared/ipc.ts.
import type { AiConfig, AiProviderId, GenerationSettings } from '../ai';
import type { LanguageInfo, LanguagePref } from '../i18n';
import type { StructureData } from './structure';
import type { Workspace, WorkspaceJigsawPool } from './workspace';
import type {
  ChunkRenderPayload,
  DimensionId,
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
} from './world';
import type { AssembleOptions, JigsawPlan, JigsawCandidate } from './jigsaw';
import type {
  GenerateImage,
  GenerateResult,
  VersionInfo,
  ChatRecord,
  GenerateProgress,
  RenderRequest,
  RenderResult,
  BuildSelection,
  FloorDef,
} from './generation';
import type { BlockDictionary, BlockNote, ExportMode, ExportResult, ReassembleResult, RenameProjectResult, ModBlockScope, WindowsReport, WindowId, CatalogBlock, GenerationCatalog, ModuleCategory, LogEntry, UpdateInfo } from './app';
import type { DoctorFixResult, MaterialsExportRequest, WorkspaceDoctorReport, WorkspaceExportRequest, WorkspaceExportPlan, WorkspaceExportResult, WorkspaceUpgradeReport } from './export';
import type { ResolveBlockResult, SaveVersionRequest, SaveVersionResult } from './edit';

export interface BlockwrightApi {
  platform: NodeJS.Platform;
  /** Dev-only: capture/auto-assemble config from main's env (BW_ASSEMBLE), or
   *  null. When set, the renderer auto-runs an assembly so the headless capture
   *  screenshots a full assembly instead of just the root piece. */
  captureAssemble: () => Promise<{ depth: number; seed: number } | null>;
  openDialog: () => Promise<string | null>;
  loadStructure: (path: string) => Promise<StructureData>;
  /** Build a texture URL served by the custom protocol. Key is "namespace/path". */
  textureUrl: (key: string) => string;
  hasTexture: (key: string) => Promise<boolean>;
  /** Open a mod workspace (directory picker); returns the active workspace or null. */
  openWorkspace: () => Promise<Workspace | null>;
  closeWorkspace: () => Promise<null>;
  getWorkspace: () => Promise<Workspace | null>;
  /** Minecraft version of the active content pack (its version.json), or null. */
  getContentVersion: () => Promise<string | null>;
  /** The configured content-pack folder, or null if none is set. */
  getContentDir: () => Promise<string | null>;
  /** Prompt for a content-pack folder; persists + returns it (null if cancelled). */
  chooseContentDir: () => Promise<string | null>;
  /** The app's own version (from package.json), for the About panel. */
  getAppVersion: () => Promise<string>;
  /** Manually check GitHub Releases for a newer version. Surfaces a native
   *  "up to date"/error dialog and, if newer, fires onUpdateAvailable. */
  checkForUpdates: () => Promise<UpdateInfo | null>;
  /** Like checkForUpdates but WITHOUT the native dialog (the About panel shows the
   *  result inline). Resolves to UpdateInfo or null; rejects on a check error. */
  checkForUpdatesQuiet: () => Promise<UpdateInfo | null>;
  /** Open an https URL in the user's default browser (e.g. a release page). */
  openExternal: (url: string) => Promise<void>;
  /** The last newer-release detected by the launch/background check, or null —
   *  pulled on mount so a launch-time detection isn't lost to the event race. */
  getPendingUpdate: () => Promise<UpdateInfo | null>;
  /** A newer release was detected (startup auto-check or the manual menu check). */
  onUpdateAvailable: (cb: (info: UpdateInfo) => void) => void;
  /** Activate a known/detected workspace; returns it, or null if it no longer exists. */
  activateWorkspace: (workspace: Workspace) => Promise<Workspace | null>;
  /** Detect whether a `.nbt` path belongs to a mod project (returns its Workspace or null). */
  detectFileWorkspace: (path: string) => Promise<Workspace | null>;
  /** Detect whether a world save sits inside a mod project's dev run dir (its Workspace or null). */
  detectWorldWorkspace: (root: string) => Promise<Workspace | null>;
  /** Pin (true) the active workspace so it auto-activates at launch / unpin (false).
   *  Returns the pinned workspace's root, or null when nothing is pinned. */
  pinWorkspace: (pin: boolean) => Promise<string | null>;
  /** The pinned workspace's root path, or null when none is pinned. */
  getPinnedWorkspace: () => Promise<string | null>;
  /** Notified when the pinned workspace changes (statusbar pin / native menu). */
  onPinnedWorkspaceChanged: (cb: (root: string | null) => void) => void;
  /** Recently opened mod workspaces, most-recent first. Both return the updated list. */
  listRecentWorkspaces: () => Promise<Workspace[]>;
  clearRecentWorkspaces: () => Promise<Workspace[]>;
  // ── World viewer ──────────────────────────────────────────────────────────
  /** Open a Minecraft world folder → its meta, or null if cancelled. Omit `root` for a folder
   *  picker; pass a path (recents/menu) to open it directly. Activates it in main. */
  openWorld: (root?: string) => Promise<WorldMeta | null>;
  /** Meta of the currently-open world, or null. */
  getWorldMeta: () => Promise<WorldMeta | null>;
  /** Region coordinates available in a dimension of the active world. */
  listWorldRegions: (dim: DimensionId) => Promise<RegionRef[]>;
  /** Resolve one chunk into a render payload (typed-array grids), or null if absent. */
  getChunk: (dim: DimensionId, cx: number, cz: number) => Promise<ChunkRenderPayload | null>;
  /** Batch chunk resolve (a ring of chunks) in one round-trip; preserves input order. */
  getChunks: (dim: DimensionId, coords: { cx: number; cz: number }[]) => Promise<(ChunkRenderPayload | null)[]>;
  /** Find generated structures in a dimension (cached after the first scan). */
  findWorldStructures: (dim: DimensionId) => Promise<StructureLocation[]>;
  /** A world's saved camera waypoints (persisted in userData, keyed by world root). */
  getWorldWaypoints: (root: string) => Promise<WorldWaypoint[]>;
  /** Replace a world's waypoint list; resolves to the persisted list. */
  setWorldWaypoints: (root: string, waypoints: WorldWaypoint[]) => Promise<WorldWaypoint[]>;
  /** Open a WORLD-EDIT session on the active world (takes session.lock; throws when Minecraft
   *  demonstrably holds it). */
  openWorldEdit: (dim: DimensionId) => Promise<WorldEditOpenResult>;
  /** Close the world-edit session, releasing the session lock. */
  closeWorldEdit: () => Promise<void>;
  /** Write block edits through the safe write path (enforced backup, per-chunk refusals reported).
   *  `retention` prunes backup sets past that count after the save (0 = keep all). */
  applyWorldEdits: (dim: DimensionId, edits: WorldEditBlock[], retention: number, sizeCapMb?: number) => Promise<WorldEditApplyResult>;
  /** Extract a box of the active world into a temp `.nbt` structure (committed world, not pending
   *  edits). `nbtLimit` decides `oversized`. The renderer opens it as a tab or routes it to Export As. */
  extractFromWorld: (dim: DimensionId, box: WorldExtractBox, nbtLimit: number) => Promise<WorldExtractResult>;
  /** Backup sets of the active world (newest first). */
  listWorldBackups: () => Promise<WorldBackupInfo[]>;
  /** Restore one backup set over the active world's files. */
  restoreWorldBackup: (id: string) => Promise<WorldBackupInfo>;
  /** Delete one backup set → the updated list. */
  deleteWorldBackup: (id: string) => Promise<WorldBackupInfo[]>;
  /** Recently opened worlds, most-recent first. Both return the updated list. */
  listRecentWorlds: () => Promise<WorldRef[]>;
  clearRecentWorlds: () => Promise<WorldRef[]>;
  /** Absolute paths of the active workspace's `.nbt` structures (empty when none). */
  listWorkspaceStructures: () => Promise<string[]>;
  /** The active workspace's jigsaw template pools (pieces resolved), by folder. */
  listWorkspaceJigsaws: () => Promise<WorkspaceJigsawPool[]>;
  /** Persist a user-chosen Minecraft version for the active workspace; returns it. */
  setWorkspaceVersion: (version: string) => Promise<Workspace | null>;
  /** Custom biome ids the active workspace defines (`worldgen/biome/**`), `ns:path`. */
  listWorkspaceBiomes: () => Promise<string[]>;
  /** Live preview of exporting a structure into the active workspace: the files that
   *  would be written + any problems, recomputed as the dialog's options change. */
  planWorkspaceExport: (req: WorkspaceExportRequest) => Promise<WorkspaceExportPlan>;
  /** Write the structure + its worldgen JSON into the active workspace. */
  exportToWorkspace: (req: WorkspaceExportRequest) => Promise<WorkspaceExportResult>;
  /** Resolve a block (name + properties) into renderable models + texture keys, so the
   *  editor can intern a newly-picked block (Replace / Stairs) into the live structure. */
  resolveBlock: (name: string, properties?: Record<string, string>) => Promise<ResolveBlockResult>;
  /** Role-classify block names and map them to a decoration's blocks (the one-click
   *  re-theme): source name → target name, only for blocks the decoration re-maps. */
  rethemeMap: (blocks: string[], decorationId: string) => Promise<Record<string, string>>;
  /** Save a Beauty Render (PNG still / WebM turntable) via the native save dialog;
   *  resolves with the written path, or null when cancelled. */
  saveRender: (data: ArrayBuffer, suggestedName: string, kind: 'png' | 'webm') => Promise<string | null>;
  /** Watch mode: report the on-screen structure file (null = none) so main can watch it. */
  watchFile: (filePath: string | null) => Promise<void>;
  /** Run the Worldgen Doctor over the active workspace. */
  workspaceDoctor: () => Promise<WorkspaceDoctorReport>;
  /** Apply one Doctor fix-it (safe codes only: folder rename / spawn_overrides / format). */
  workspaceDoctorFix: (code: string, file: string) => Promise<DoctorFixResult>;
  /** Run the datapack upgrader over the active workspace; resolves to the loss report. */
  workspaceUpgrade: () => Promise<WorkspaceUpgradeReport>;
  /** Watch mode: the on-screen structure file changed on disk (hot-reload it). */
  onFileChanged: (cb: (path: string) => void) => void;
  /** Watch mode: the active workspace's structure folder changed on disk. */
  onWorkspaceStructuresChanged: (cb: () => void) => void;
  /** Notified when File ▸ Workspace Check-Up… is chosen; the handler opens the Doctor. */
  onOpenDoctor: (cb: () => void) => void;
  /** Save the edited structure as a new version (`vN.nbt`), like an AI build version. */
  saveVersion: (req: SaveVersionRequest) => Promise<SaveVersionResult>;
  /** Plan a full jigsaw assembly starting from a structure file. */
  assembleJigsaw: (path: string, options: AssembleOptions) => Promise<JigsawPlan>;
  /** Candidate pieces that can attach to one connector of a structure (manual mode). */
  jigsawCandidates: (path: string, connectorIndex: number) => Promise<JigsawCandidate[]>;
  /** Whether the active AI provider is usable right now (gates the generation UI). */
  aiAvailable: () => Promise<boolean>;
  /** The full multi-provider AI config (providers + active selection) for Settings. */
  aiGetConfig: () => Promise<AiConfig>;
  /** Set which provider generation runs on; returns the updated config. */
  aiSetActiveProvider: (id: AiProviderId) => Promise<AiConfig>;
  /** Set a provider's chosen model; returns the updated config. */
  aiSetModel: (id: AiProviderId, model: string) => Promise<AiConfig>;
  /** Store a provider's credential (encrypted, in the main process); returns the updated config. */
  aiSetCredential: (id: AiProviderId, secret: string) => Promise<AiConfig>;
  /** Remove a provider's stored credential; returns the updated config. */
  aiClearCredential: (id: AiProviderId) => Promise<AiConfig>;
  /** Update the generation cost/quality settings (a partial merge); returns the updated config. */
  aiSetGeneration: (patch: Partial<GenerationSettings>) => Promise<AiConfig>;
  /** Library retention: keep the last N versions per generated build (0 = keep all). */
  aiSetLibraryRetention: (keep: number) => Promise<AiConfig>;
  /** Generate or edit a structure for a session; returns the written `.nbt` or an error.
   *  Optional reference images are sent to the model as visual guidance. `basePath` is
   *  the `.nbt` currently open in the viewer; on a fresh session it seeds the model with
   *  that structure so the first prompt edits it instead of building from scratch. */
  aiGenerate: (
    sessionId: string,
    prompt: string,
    images?: GenerateImage[],
    selection?: BuildSelection,
    basePath?: string,
    /** The user's Floor plan for this build — overrides the model's declared storeys
     *  when locating the ground-floor level for the air-fill. */
    floors?: FloorDef[],
  ) => Promise<GenerateResult>;
  /** Cancel the in-flight generation for a session (resolves the pending aiGenerate as canceled). */
  aiCancel: (sessionId: string) => Promise<void>;
  /** Forget a generation session's conversation so the next prompt starts fresh. */
  aiResetSession: (sessionId: string) => Promise<void>;
  /** Restore a session's SDK conversation id + version from persisted history so a
   *  follow-up after restart resumes the same Claude conversation. */
  aiPrimeSession: (sessionId: string, sdkSessionId: string | null, version: number) => Promise<void>;
  /** List the compiled versions (`vN.nbt`) on disk for a generation session, so the
   *  Versions panel can offer earlier builds to view. Empty when none/unknown. */
  aiListVersions: (sessionId: string) => Promise<VersionInfo[]>;
  /** Delete a compiled version's files for a session (scratch + library mirror). The
   *  caller guards against deleting the Current version. Resolves true if removed. */
  aiDeleteVersion: (sessionId: string, version: number) => Promise<boolean>;
  /** The folder where finished structures are auto-saved as clean `<slug>.nbt` files. */
  aiGetOutputDir: () => Promise<string>;
  /** Open a native folder picker for the library folder; resolves to the chosen (persisted) dir, or null if cancelled. */
  aiChooseOutputDir: () => Promise<string | null>;
  /** Reveal a path in the OS file manager (Finder/Explorer), creating the folder first if missing. */
  revealPath: (target: string) => Promise<void>;
  /** Load persisted chat history for a key (a file path, or a session id), or null. */
  chatHistoryGet: (key: string) => Promise<ChatRecord | null>;
  /** Persist chat history for a key (debounced by the caller). */
  chatHistorySave: (key: string, record: ChatRecord) => Promise<void>;
  /** Notified with live token/phase progress while a generation is in flight. */
  onAiProgress: (cb: (progress: GenerateProgress) => void) => void;
  /** Notified when main wants the just-generated `.nbt` rendered + screenshotted
   *  for the generator's self-review loop. The handler should load the structure,
   *  capture it, and reply via `sendRenderResult`. */
  onAiRenderRequest: (cb: (req: RenderRequest) => void) => void;
  /** Reply to an onAiRenderRequest with the captured image(s) or an error. */
  sendRenderResult: (result: RenderResult) => void;
  /** Report whether a structure is currently open (drives Close File / Export as NBT),
   *  and whether it exceeds the configured Structure Block size limit (drives the
   *  Export as Jigsaw item's enabled state). */
  setFileOpen: (open: boolean, oversized: boolean) => void;
  /** Report whether the active doc is a renamable generated project, so main can
   *  enable/disable File ▸ Rename Project…. */
  setProjectOpen: (open: boolean) => void;
  /** Rename a generated project (its library folder + latest `<name>.nbt`). `sessionId`
   *  re-points a live generation session's mirror to the renamed folder. */
  renameProject: (currentFile: string, newName: string, sessionId?: string) => Promise<RenameProjectResult>;
  /** Pick a split jigsaw-assembly folder and reassemble it into one `.nbt` (inverse of the
   *  split export); resolves to the written temp file the renderer then opens. */
  reassembleAssembly: () => Promise<ReassembleResult>;
  /** Pick a Minecraft save and reassemble the pieces the player re-SAVEd after Export to World;
   *  resolves to the written temp file the renderer then opens. */
  reimportWorld: () => Promise<ReassembleResult>;
  /** Copy a compiled `.nbt` (srcPath) to a user-chosen location via a Save dialog;
   *  `suggestedName` seeds the dialog's filename. `mode` picks the flavour: `nbt` writes
   *  one pure file regardless of size (mods need that), `jigsaw` cuts it into a jigsaw
   *  assembly folder (`nbtLimit` is the resolved per-axis size limit it must exceed).
   *  Returns where it landed, or a canceled/error result. */
  exportStructure: (srcPath: string, suggestedName: string, nbtLimit: number, mode: ExportMode, preferred?: 'nbt' | 'schem' | 'litematic') => Promise<ExportResult>;
  /** Install the build into a user-chosen Minecraft world save for editing + round-trip: within
   *  the size limit → the raw `.nbt` loadable with one structure block; oversized → an editing
   *  datapack of ≤-limit pieces with SAVE-mode structure blocks. Reimport from World brings it back. */
  exportToWorld: (srcPath: string, suggestedName: string, nbtLimit: number) => Promise<ExportResult>;
  /** Save the Materials panel's Bill of Materials via a Save dialog (CSV/JSON — the
   *  chosen extension picks the payload; `format` orders the dialog's filters). */
  exportMaterials: (req: MaterialsExportRequest) => Promise<ExportResult>;
  /** Report the floating-window state so the View menu's checkmarks/enabled state track it. */
  reportWindows: (state: WindowsReport) => void;
  /** Whether a path still exists on disk (used to validate recents before opening). */
  pathExists: (path: string) => Promise<boolean>;
  /** All placeable blocks in the active content (vanilla pack + workspace namespace),
   *  each with a representative texture key — for the Block Catalog browser. */
  listCatalog: () => Promise<CatalogBlock[]>;
  /** Resolve a single block into a 1×1×1 StructureData (for the catalog's 3D preview). */
  previewBlock: (id: string) => Promise<StructureData>;
  /** The active mod workspace's block dictionary (its blocks + AI annotations + generation
   *  scope), or null when no mod workspace is open. Powers the Catalog's annotation editor. */
  getDictionary: () => Promise<BlockDictionary | null>;
  /** Upsert one mod block's annotation (description/role/ignore); returns the refreshed dictionary. */
  setBlockNote: (note: BlockNote) => Promise<BlockDictionary | null>;
  /** Set the workspace's mod-block generation scope; returns the refreshed dictionary. */
  setDictionaryScope: (scope: ModBlockScope) => Promise<BlockDictionary | null>;
  /** The generation module registry (grouped by category) for the composer's selects
   *  and the module gallery. */
  generationCatalog: () => Promise<GenerationCatalog>;
  /** Compose + compile a module's representative build into StructureData (the module
   *  gallery's 3D preview). Resolves null-shaped data only if the module has no preview. */
  previewModule: (category: ModuleCategory, id: string) => Promise<StructureData>;
  /** Drive the native appearance (macOS vibrancy + traffic lights + the renderer's
   *  prefers-color-scheme) so a forced theme isn't fighting a vibrancy stuck on the OS. */
  setThemeSource: (pref: 'system' | 'light' | 'dark') => Promise<void>;
  /** The current language preference + the concrete locale it resolves to. */
  getLanguage: () => Promise<LanguageInfo>;
  /** Persist a language preference; returns the resolved language info. */
  setLanguage: (pref: LanguagePref) => Promise<LanguageInfo>;
  /** Notified when the language changes (e.g. via the native Language menu). */
  onLanguageChanged: (cb: (info: LanguageInfo) => void) => void;
  /** Recently opened files, most-recent first. All return the updated list. */
  listRecents: () => Promise<string[]>;
  addRecent: (path: string) => Promise<string[]>;
  removeRecent: (path: string) => Promise<string[]>;
  clearRecents: () => Promise<string[]>;
  onOpenPath: (cb: (path: string) => void) => void;
  onFileDrop: (cb: (path: string) => void) => void;
  /** Notified when the recents list changes in main (e.g. via the native menu). */
  onRecentsChanged: (cb: (paths: string[]) => void) => void;
  /** Notified when the active mod workspace changes (opened or closed). */
  onWorkspaceChanged: (cb: (workspace: Workspace | null) => void) => void;
  /** Notified when the recent-workspaces list changes. */
  onRecentWorkspacesChanged: (cb: (workspaces: Workspace[]) => void) => void;
  /** Main asks the renderer to open a world folder (File ▸ Open World / recents / BW_OPEN_WORLD). */
  onOpenWorld: (cb: (root: string) => void) => void;
  /** The recent-worlds list changed in main — payload is the new list. */
  onRecentWorldsChanged: (cb: (worlds: WorldRef[]) => void) => void;
  /** Notified when main requests closing the current structure (native File menu). */
  onCloseStructure: (cb: () => void) => void;
  /** Notified when main requests opening the Settings panel (native menu / Cmd+,). */
  onOpenSettings: (cb: (section?: string) => void) => void;
  /** Notified when the View menu toggles a floating window's visibility. */
  onToggleWindow: (cb: (id: WindowId) => void) => void;
  /** Notified when the View ▸ Layout menu requests resetting window positions. */
  onResetWindows: (cb: () => void) => void;
  /** Notified when File ▸ New Structure is chosen (opens the AI generation panel). */
  onNewStructure: (cb: () => void) => void;
  /** Notified when File ▸ Export as NBT / Export as Jigsaw is chosen; the handler
   *  picks the build to save and calls `exportStructure` with the requested mode. */
  onExportFile: (cb: (mode: ExportMode) => void) => void;
  /** Notified when File ▸ Export to World is chosen; the handler picks the build and
   *  calls `exportToWorld`. */
  onExportToWorld: (cb: () => void) => void;
  /** Notified when File ▸ Export to Mod Workspace is chosen; the handler opens the
   *  export dialog for the active document. */
  onExportToWorkspace: (cb: () => void) => void;
  /** Notified when File ▸ Rename Project… is chosen; the handler opens the rename dialog. */
  onRenameProject: (cb: () => void) => void;
  /** Notified when File ▸ Open Jigsaw Assembly… is chosen; the handler runs the reassembly. */
  onOpenAssembly: (cb: () => void) => void;
  /** Notified when File ▸ Reimport from World… is chosen; the handler runs the reassembly. */
  onReimportWorld: (cb: () => void) => void;
  /** Notified when File ▸ Compare with File… is chosen; the handler picks a file and
   *  opens the structure-diff view against the active document. */
  onCompareFile: (cb: () => void) => void;
  /** Notified when File ▸ Re-theme Structure… is chosen; the handler opens the dialog. */
  onRetheme: (cb: () => void) => void;
  /** Notified when File ▸ Render Image… is chosen; the handler opens the Beauty Render dialog. */
  onRenderImage: (cb: () => void) => void;
  /** The main-process log backlog buffered before the renderer mounted, so the
   *  Console dock starts with the full session history. */
  getLogBacklog: () => Promise<LogEntry[]>;
  /** Notified for each new main-process log line (live tail into the Console dock). */
  onLogEntry: (cb: (entry: LogEntry) => void) => void;
  /** Notified when View ▸ Block Catalog is chosen. */
  onOpenCatalog: (cb: () => void) => void;
  /** Notified when View ▸ Module Gallery is chosen. */
  onOpenModules: (cb: () => void) => void;
  /** Notified when Help ▸ Guide is chosen. */
  onOpenGuide: (cb: () => void) => void;
}

declare global {
  interface Window {
    blockwright: BlockwrightApi;
  }
}
