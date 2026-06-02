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
  /** Activate a known/detected workspace (payload Workspace) — returns it or null if stale. */
  workspaceActivate: 'workspace:activate',
  /** Detect whether a `.nbt` path belongs to a mod project — returns a Workspace or null. */
  workspaceDetectFile: 'workspace:detect-file',
  recentWorkspacesList: 'recent-workspaces:list',
  recentWorkspacesClear: 'recent-workspaces:clear',
  /** Persist a user-chosen Minecraft version for the active workspace. */
  workspaceSetVersion: 'workspace:set-version',
  /** Plan a full jigsaw assembly from a structure (payload: path + AssembleOptions). */
  jigsawAssemble: 'jigsaw:assemble',
  /** Candidate pieces for one connector of a structure (payload: path + index). */
  jigsawCandidates: 'jigsaw:candidates',
  /** Renderer tells main whether a structure is currently open (drives Close File). */
  setFileOpen: 'file:set-open',
  /** Renderer reports its floating-window state so the View menu checkmarks stay in sync. */
  windowsReport: 'windows:report',
  /** Dev-only: capture/auto-assemble config from main's env (BW_ASSEMBLE). */
  captureConfig: 'capture:config',
  /** Whether an Anthropic API key is configured (gates the AI generation UI). */
  aiAvailable: 'ai:available',
  /** Non-secret status of the stored API key (set?/masked hint/from env?). */
  aiKeyInfo: 'ai:key-info',
  /** Store the Anthropic API key (encrypted in userData) — payload: key string. */
  aiSetKey: 'ai:set-key',
  /** Remove the stored Anthropic API key. */
  aiClearKey: 'ai:clear-key',
  /** Generate/edit a structure for a session (payload: sessionId + prompt). */
  aiGenerate: 'ai:generate',
  /** Cancel the in-flight generation for a session (payload: sessionId). */
  aiCancel: 'ai:cancel',
  /** Forget a generation session's conversation (payload: sessionId). */
  aiResetSession: 'ai:reset-session',
  /** Renderer's reply to an aiRenderRequest: the captured preview image(s) (or an
   *  error). Payload: requestId + { images? , error? }. */
  aiRenderResult: 'ai:render-result',
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
  /** Live progress for an in-flight generation (payload: GenerateProgress). */
  aiProgress: 'ai-progress',
  /** Ask the renderer to load a just-generated `.nbt` into the viewer and return
   *  screenshot(s) of it, so the generator can see its own build and self-correct
   *  against the reference. Payload: { requestId, path, version }; the renderer
   *  replies on IPC_CHANNELS.aiRenderResult. */
  aiRenderRequest: 'ai-render-request',
} as const;
