// Central renderer state. The main process stays the source of truth for
// recents and the active workspace (they arrive via IPC broadcasts); this store
// mirrors them plus view-local state so UI pieces can subscribe to just the
// slice they render instead of being pushed to imperatively. Uses Zustand's
// framework-agnostic vanilla store — the renderer has no React.
import { createStore } from 'zustand/vanilla';
import type { StructureData, Workspace } from '@/shared/types';

export interface AppState {
  /** Recently opened files, most-recent first (mirrors main). */
  recents: string[];
  /** Active mod workspace, or null (mirrors main). */
  workspace: Workspace | null;
  /** Recently opened mod workspaces, most-recent first (mirrors main). */
  recentWorkspaces: Workspace[];
  /** Absolute paths of the active workspace's `.nbt` structures. */
  workspaceStructures: string[];
  /** True while a file is being parsed/rendered. */
  loading: boolean;
  /** The currently displayed structure, or null on the welcome screen. */
  structure: StructureData | null;

  setRecents: (recents: string[]) => void;
  setWorkspace: (workspace: Workspace | null) => void;
  setRecentWorkspaces: (workspaces: Workspace[]) => void;
  setWorkspaceStructures: (paths: string[]) => void;
  setLoading: (loading: boolean) => void;
  setStructure: (structure: StructureData | null) => void;
}

export const store = createStore<AppState>((set) => ({
  recents: [],
  workspace: null,
  recentWorkspaces: [],
  workspaceStructures: [],
  loading: false,
  structure: null,

  setRecents: (recents) => set({ recents }),
  setWorkspace: (workspace) => set({ workspace }),
  setRecentWorkspaces: (recentWorkspaces) => set({ recentWorkspaces }),
  setWorkspaceStructures: (workspaceStructures) => set({ workspaceStructures }),
  setLoading: (loading) => set({ loading }),
  setStructure: (structure) => set({ structure }),
}));

/** Subscribe to one derived slice, invoking `run` immediately and on change.
 *  Returns the unsubscribe function. */
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
