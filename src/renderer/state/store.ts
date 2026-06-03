// Central renderer state. The main process stays the source of truth for
// recents and the active workspace (they arrive via IPC broadcasts); this store
// mirrors them plus app-global view state (transient notices, modal flags).
// Per-document state (the open structure, loading, chat) lives in the documents
// store (state/documents.ts) so the app can hold multiple tabs at once.
// Uses Zustand's framework-agnostic vanilla store, consumed in components via
// `useStore`.
import { createStore } from 'zustand/vanilla';
import type { Workspace } from '@/shared/types';

export type NavMode = 'orbit' | 'fly';

/** A transient status-bar message that overrides the structure summary. */
export interface Notice {
  text: string;
  warn: boolean;
}

/** A detected mod workspace offered for the just-opened loose `.nbt`. */
export interface Suggestion {
  workspace: Workspace;
  filePath: string;
}

export interface AppState {
  /** Recently opened files, most-recent first (mirrors main). */
  recents: string[];
  /** Active mod workspace, or null (mirrors main). */
  workspace: Workspace | null;
  /** Recently opened mod workspaces, most-recent first (mirrors main). */
  recentWorkspaces: Workspace[];
  /** Absolute paths of the active workspace's `.nbt` structures. */
  workspaceStructures: string[];
  /** Live viewer navigation mode, reflected by the Controls window. */
  navMode: NavMode;
  /** Minecraft version of the active content pack (from its version.json). */
  contentVersion: string | null;
  /** Transient status-bar message (e.g. a load error), or null for the default. */
  notice: Notice | null;
  /** Bottom-left prompt offering to load a detected mod workspace, or null. */
  suggest: Suggestion | null;
  /** Whether the Settings modal is open. */
  settingsOpen: boolean;
  /** Whether the Block Catalog modal is open. */
  catalogOpen: boolean;
  /** Workspace name awaiting a manual version pick (shows the modal), or null. */
  versionPromptName: string | null;
  /** A chat image being shown full-size in the lightbox overlay, or null. */
  imagePreview: string | null;

  setRecents: (recents: string[]) => void;
  setWorkspace: (workspace: Workspace | null) => void;
  setRecentWorkspaces: (workspaces: Workspace[]) => void;
  setWorkspaceStructures: (paths: string[]) => void;
  setNavMode: (mode: NavMode) => void;
  setContentVersion: (version: string | null) => void;
  setNotice: (notice: Notice | null) => void;
  setSuggest: (suggest: Suggestion | null) => void;
  setSettingsOpen: (open: boolean) => void;
  setCatalogOpen: (open: boolean) => void;
  setVersionPromptName: (name: string | null) => void;
  setImagePreview: (src: string | null) => void;
}

/** Fallback content-pack version until main reports the real one (its
 *  version.json). The bundled pack is 1.21.1. */
export const FALLBACK_CONTENT_VERSION = '1.21.1';

export const store = createStore<AppState>((set) => ({
  recents: [],
  workspace: null,
  recentWorkspaces: [],
  workspaceStructures: [],
  navMode: 'orbit',
  contentVersion: FALLBACK_CONTENT_VERSION,
  notice: null,
  suggest: null,
  settingsOpen: false,
  catalogOpen: false,
  versionPromptName: null,
  imagePreview: null,

  setRecents: (recents) => set({ recents }),
  setWorkspace: (workspace) => set({ workspace }),
  setRecentWorkspaces: (recentWorkspaces) => set({ recentWorkspaces }),
  setWorkspaceStructures: (workspaceStructures) => set({ workspaceStructures }),
  setNavMode: (navMode) => set({ navMode }),
  setContentVersion: (contentVersion) => set({ contentVersion }),
  setNotice: (notice) => set({ notice }),
  setSuggest: (suggest) => set({ suggest }),
  setSettingsOpen: (settingsOpen) => set({ settingsOpen }),
  setCatalogOpen: (catalogOpen) => set({ catalogOpen }),
  setVersionPromptName: (versionPromptName) => set({ versionPromptName }),
  setImagePreview: (imagePreview) => set({ imagePreview }),
}));

/** Subscribe to one derived slice, invoking `run` immediately and on change.
 *  Returns the unsubscribe function. (Kept for non-React callers.) */
export function watch<T>(select: (s: AppState) => T, run: (value: T) => void): () => void {
  let prev = select(store.getState());
  run(prev);
  return store.subscribe((state) => {
    const next = select(state);
    if (!Object.is(next, prev)) {
      prev = next;
      run(next);
    }
  });
}
