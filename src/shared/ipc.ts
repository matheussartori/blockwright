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
} as const;
