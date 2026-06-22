// The preload bridge contract: every method/event the renderer reaches main
// through (window.blockwright). One method per IPC channel/event in shared/ipc.ts.
import type { AiConfig, AiProviderId, GenerationSettings } from '../ai';
import type { LanguageInfo, LanguagePref } from '../i18n';
import type { StructureData } from './structure';
import type { Workspace } from './workspace';
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
import type { BlockDictionary, BlockNote, ExportResult, ModBlockScope, WindowsReport, WindowId, CatalogBlock, GenerationCatalog, ModuleCategory, LogEntry } from './app';
import type { WorkspaceExportRequest, WorkspaceExportPlan, WorkspaceExportResult } from './export';

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
  /** Activate a known/detected workspace; returns it, or null if it no longer exists. */
  activateWorkspace: (workspace: Workspace) => Promise<Workspace | null>;
  /** Detect whether a `.nbt` path belongs to a mod project (returns its Workspace or null). */
  detectFileWorkspace: (path: string) => Promise<Workspace | null>;
  /** Recently opened mod workspaces, most-recent first. Both return the updated list. */
  listRecentWorkspaces: () => Promise<Workspace[]>;
  clearRecentWorkspaces: () => Promise<Workspace[]>;
  /** Absolute paths of the active workspace's `.nbt` structures (empty when none). */
  listWorkspaceStructures: () => Promise<string[]>;
  /** Persist a user-chosen Minecraft version for the active workspace; returns it. */
  setWorkspaceVersion: (version: string) => Promise<Workspace | null>;
  /** Custom biome ids the active workspace defines (`worldgen/biome/**`), `ns:path`. */
  listWorkspaceBiomes: () => Promise<string[]>;
  /** Live preview of exporting a structure into the active workspace: the files that
   *  would be written + any problems, recomputed as the dialog's options change. */
  planWorkspaceExport: (req: WorkspaceExportRequest) => Promise<WorkspaceExportPlan>;
  /** Write the structure + its worldgen JSON into the active workspace. */
  exportToWorkspace: (req: WorkspaceExportRequest) => Promise<WorkspaceExportResult>;
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
  /** Report whether a structure is currently open, so main can enable/disable Close File. */
  setFileOpen: (open: boolean) => void;
  /** Copy a compiled `.nbt` (srcPath) to a user-chosen location via a Save dialog;
   *  `suggestedName` seeds the dialog's filename. Returns where it landed, or a
   *  canceled/error result. */
  exportStructure: (srcPath: string, suggestedName: string) => Promise<ExportResult>;
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
  /** Notified when File ▸ Export File is chosen; the handler picks the build to
   *  save and calls `exportStructure`. */
  onExportFile: (cb: () => void) => void;
  /** Notified when File ▸ Export to Mod Workspace is chosen; the handler opens the
   *  export dialog for the active document. */
  onExportToWorkspace: (cb: () => void) => void;
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
