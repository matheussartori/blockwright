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
} as const;

/** Fire-and-forget messages pushed from main to the renderer. */
export const IPC_EVENTS = {
  openPath: 'open-path',
  /** Recents list changed in main (e.g. via the native menu) — payload is the new list. */
  recentsChanged: 'recents-changed',
  /** Active mod workspace changed — payload is the Workspace or null. */
  workspaceChanged: 'workspace-changed',
} as const;
