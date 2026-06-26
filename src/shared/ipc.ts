// Single source of truth for the IPC surface between main and renderer.
// Keeping the channel names here (instead of inline strings on both sides)
// makes the contract typo-proof and easy to extend.

/** Request/response channels invoked via `ipcRenderer.invoke` / `ipcMain.handle`. */
export const IPC_CHANNELS = {
  openDialog: 'dialog:open',
  loadStructure: 'structure:load',
  hasTexture: 'texture:has',
  pathExists: 'path:exists',
  recentsList: 'recents:list',
  recentsAdd: 'recents:add',
  recentsRemove: 'recents:remove',
  recentsClear: 'recents:clear',
  workspaceOpen: 'workspace:open',
  workspaceClose: 'workspace:close',
  workspaceGet: 'workspace:get',
  workspaceStructures: 'workspace:structures',
  /** The Minecraft version of the active content pack (from its version.json). */
  contentVersion: 'content:version',
  /** The configured content-pack folder, or null if none is set. */
  contentGetDir: 'content:get-dir',
  /** Prompt for a content-pack folder; persists + returns it (or null if cancelled). */
  contentChooseDir: 'content:choose-dir',
  /** The app's own version (app.getVersion()), for the About panel. */
  appVersion: 'app:version',
  /** Check GitHub Releases for a newer version (manual "Check for Updates").
   *  Shows a native "up to date"/error dialog and, if newer, pushes
   *  IPC_EVENTS.updateAvailable. Returns the UpdateInfo or null. */
  checkUpdate: 'update:check',
  /** Like checkUpdate but WITHOUT the native dialog — the About panel renders the
   *  result inline. Returns UpdateInfo or null; rejects on a network/API error. */
  checkUpdateQuiet: 'update:check-quiet',
  /** Open an external https URL in the user's default browser (e.g. the release
   *  download page) — payload: url. */
  openExternal: 'shell:open-external',
  /** The last newer-release detected by the background check, or null — pulled by
   *  the renderer on mount so a launch-time detection isn't lost to the push race. */
  updatePending: 'update:pending',
  /** Activate a known/detected workspace (payload Workspace) — returns it or null if stale. */
  workspaceActivate: 'workspace:activate',
  /** Detect whether a `.nbt` path belongs to a mod project — returns a Workspace or null. */
  workspaceDetectFile: 'workspace:detect-file',
  recentWorkspacesList: 'recent-workspaces:list',
  recentWorkspacesClear: 'recent-workspaces:clear',
  /** Persist a user-chosen Minecraft version for the active workspace. */
  workspaceSetVersion: 'workspace:set-version',
  /** Custom biome ids the active workspace defines (`worldgen/biome/**`) → string[]. */
  workspaceBiomes: 'workspace:biomes',
  /** Live preview of exporting a structure into the active workspace (payload: ExportRequest)
   *  → ExportPlan (the files that would be written + any problems). */
  workspaceExportPlan: 'workspace:export-plan',
  /** Write a structure + its worldgen JSON into the active workspace (payload: ExportRequest)
   *  → ExportResult. */
  workspaceExport: 'workspace:export',
  /** Resolve a block (name + properties) into renderable models + texture keys, so the
   *  editor can intern a newly-picked block into the live structure → ResolveBlockResult. */
  resolveBlock: 'structure:resolve-block',
  /** Save the edited structure as a new version (payload: SaveVersionRequest) → SaveVersionResult. */
  saveVersion: 'structure:save-version',
  /** Plan a full jigsaw assembly from a structure (payload: path + AssembleOptions). */
  jigsawAssemble: 'jigsaw:assemble',
  /** Candidate pieces for one connector of a structure (payload: path + index). */
  jigsawCandidates: 'jigsaw:candidates',
  /** Renderer tells main whether a structure is currently open (drives Close File). */
  setFileOpen: 'file:set-open',
  /** Renderer tells main whether the active doc is a renamable generated project
   *  (drives the File ▸ Rename Project… enabled state). */
  setProjectOpen: 'file:set-project-open',
  /** Rename a generated project: rename its library FOLDER and the latest `<name>.nbt`
   *  inside it (kept `versions/` + generation.log ride along). Payload: currentFile +
   *  newName + sessionId → RenameProjectResult. */
  projectRename: 'project:rename',
  /** Pick a split jigsaw-assembly folder and reassemble it into one `.nbt` (the inverse of
   *  the split export) → ReassembleResult (a temp file the renderer opens). */
  assemblyReassemble: 'assembly:reassemble',
  /** Pick a Minecraft SAVE folder and reassemble the pieces the player re-SAVEd with the
   *  editing scaffold → ReassembleResult (a temp file the renderer opens). */
  worldReimport: 'world:reimport',
  /** Copy the current build's `.nbt` to a user-chosen location via a Save dialog
   *  (payload: srcPath + suggestedName) → ExportResult. */
  exportFile: 'file:export',
  /** Install the current build into a user-chosen Minecraft world save as a ready-to-run
   *  datapack (payload: srcPath + suggestedName + nbtLimit) → ExportResult. */
  exportWorld: 'file:export-world',
  /** Renderer reports its floating-window state so the View menu checkmarks stay in sync. */
  windowsReport: 'windows:report',
  /** Dev-only: capture/auto-assemble config from main's env (BW_ASSEMBLE). */
  captureConfig: 'capture:config',
  /** Whether the active AI provider is usable (gates the AI generation UI). */
  aiAvailable: 'ai:available',
  /** The full multi-provider AI config (providers + active selection). */
  aiGetConfig: 'ai:get-config',
  /** Set the active provider — payload: AiProviderId. */
  aiSetActiveProvider: 'ai:set-active-provider',
  /** Set a provider's chosen model — payload: id + model. */
  aiSetModel: 'ai:set-model',
  /** Store a provider's credential (encrypted) — payload: id + secret. */
  aiSetCredential: 'ai:set-credential',
  /** Remove a provider's stored credential — payload: id. */
  aiClearCredential: 'ai:clear-credential',
  /** Update the generation cost/quality settings — payload: a partial GenerationSettings. */
  aiSetGeneration: 'ai:set-generation',
  /** Generate/edit a structure for a session (payload: sessionId + prompt). */
  aiGenerate: 'ai:generate',
  /** Cancel the in-flight generation for a session (payload: sessionId). */
  aiCancel: 'ai:cancel',
  /** Forget a generation session's conversation (payload: sessionId). */
  aiResetSession: 'ai:reset-session',
  /** Restore a session's SDK conversation id + version (payload: sessionId, sdkSessionId, version). */
  aiPrimeSession: 'ai:prime-session',
  /** List a session's compiled versions on disk (payload: sessionId) → VersionInfo[]. */
  aiListVersions: 'ai:list-versions',
  /** Delete a session's compiled version files (payload: sessionId, version) → boolean. */
  aiDeleteVersion: 'ai:delete-version',
  /** Get the folder where finished structures are saved (the browsable library) → string. */
  aiGetOutputDir: 'ai:get-output-dir',
  /** Open a native folder picker for the library folder; returns the chosen dir (persisted) or null. */
  aiChooseOutputDir: 'ai:choose-output-dir',
  /** Reveal a path in the OS file manager (Finder/Explorer); creates the folder first if missing. */
  revealPath: 'shell:reveal-path',
  /** Renderer's reply to an aiRenderRequest: the captured preview image(s) (or an
   *  error). Payload: requestId + { images? , error? }. */
  aiRenderResult: 'ai:render-result',
  /** List all placeable blocks in the active content (vanilla + workspace) → CatalogBlock[]. */
  catalogList: 'catalog:list',
  /** Resolve a single block (name[+props]) into a 1×1×1 StructureData for the catalog 3D preview. */
  previewBlock: 'catalog:preview-block',
  /** The active mod workspace's block dictionary (mod blocks + their AI annotations) → BlockDictionary | null. */
  dictionaryGet: 'catalog:dictionary',
  /** Upsert one mod block's annotation (payload: BlockNote) → the refreshed BlockDictionary | null. */
  dictionarySetNote: 'catalog:dictionary-set-note',
  /** Set the workspace's mod-block generation scope (payload: ModBlockScope) → BlockDictionary | null. */
  dictionarySetScope: 'catalog:dictionary-set-scope',
  /** The generation module registry, grouped by category → GenerationCatalog. */
  generationCatalog: 'generation:catalog',
  /** Compose + compile a module's representative build → StructureData (gallery 3D
   *  preview). Payload: category + id. */
  previewModule: 'generation:preview-module',
  /** Drive the native theme (vibrancy + traffic lights + prefers-color-scheme): 'system'|'light'|'dark'. */
  themeSet: 'theme:set',
  /** The current language preference + resolved locale → LanguageInfo. */
  languageGet: 'language:get',
  /** Set the language preference (payload: LanguagePref) → LanguageInfo. */
  languageSet: 'language:set',
  /** Load persisted per-NBT chat history for a key (payload: key). */
  chatHistoryGet: 'chat-history:get',
  /** Persist per-NBT chat history (payload: key + ChatRecord). */
  chatHistorySave: 'chat-history:save',
  /** The buffered main-process logs captured before/while the renderer mounts,
   *  so the Console dock starts populated → LogEntry[]. */
  logBacklog: 'log:backlog',
} as const;

/** Fire-and-forget messages pushed from main to the renderer. */
export const IPC_EVENTS = {
  openPath: 'open-path',
  /** Recents list changed in main (e.g. via the native menu) — payload is the new list. */
  recentsChanged: 'recents-changed',
  /** Active mod workspace changed — payload is the Workspace or null. */
  workspaceChanged: 'workspace-changed',
  /** Recent-workspaces list changed — payload is the new Workspace[]. */
  recentWorkspacesChanged: 'recent-workspaces-changed',
  /** Request the renderer to close the current structure and return to welcome. */
  closeStructure: 'close-structure',
  /** Request the renderer to open the Settings panel (native menu / Cmd+,). */
  openSettings: 'open-settings',
  /** Toggle a floating window's visibility from the View menu — payload is its id. */
  windowToggle: 'window-toggle',
  /** Reset every floating window to its home position (View ▸ Layout). */
  windowsReset: 'windows-reset',
  /** Open the AI "New Structure" generation panel (File ▸ New Structure). */
  newStructure: 'new-structure',
  /** Ask the renderer to export the current build (File ▸ Export File). The
   *  renderer picks the source path + suggested name and calls IPC_CHANNELS.exportFile. */
  exportFile: 'export-file',
  /** Ask the renderer to export the current build into a world save (File ▸ Export to World).
   *  The renderer picks source + name + limit and calls IPC_CHANNELS.exportWorld. */
  exportToWorld: 'export-to-world',
  /** Ask the renderer to open the "Export to mod" dialog for the active document
   *  (File ▸ Export to Workspace). */
  exportToWorkspace: 'export-to-workspace',
  /** Ask the renderer to open the Rename Project dialog (File ▸ Rename Project…). */
  renameProject: 'rename-project',
  /** Ask the renderer to run the Open Jigsaw Assembly flow (File ▸ Open Jigsaw Assembly…). */
  openAssembly: 'open-assembly',
  /** Ask the renderer to run the Reimport from World flow (File ▸ Reimport from World…). */
  reimportWorld: 'reimport-world',
  /** Live progress for an in-flight generation (payload: GenerateProgress). */
  aiProgress: 'ai-progress',
  /** Ask the renderer to load a just-generated `.nbt` into the viewer and return
   *  screenshot(s) of it, so the generator can see its own build and self-correct
   *  against the reference. Payload: { requestId, path, version }; the renderer
   *  replies on IPC_CHANNELS.aiRenderResult. */
  aiRenderRequest: 'ai-render-request',
  /** A console message captured in the main process, pushed live to the renderer's
   *  Console dock — payload is a LogEntry. */
  logEntry: 'log-entry',
  /** Open the Block Catalog modal (View menu). */
  openCatalog: 'open-catalog',
  /** Open the Module Gallery modal (View menu). */
  openModules: 'open-modules',
  /** Open the in-app user Guide modal (Help ▸ Guide). */
  openGuide: 'open-guide',
  /** The language changed in main (menu picker) — payload is the new LanguageInfo. */
  languageChanged: 'language-changed',
  /** A newer release is available — payload is an UpdateInfo. Pushed by the
   *  startup auto-check (macOS/Linux) and the manual menu check. */
  updateAvailable: 'update-available',
} as const;
