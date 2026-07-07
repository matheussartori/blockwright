// Central renderer state. The main process stays the source of truth for
// recents and the active workspace (they arrive via IPC broadcasts); this store
// mirrors them plus app-global view state (transient notices, modal flags).
// Per-document state (the open structure, loading, chat) lives in the documents
// store (state/documents.ts) so the app can hold multiple tabs at once.
// Uses Zustand's framework-agnostic vanilla store, consumed in components via
// `useStore`.
import { createStore } from 'zustand/vanilla';
import type { UpdateInfo, Workspace, WorkspaceJigsawPool, WorldRef } from '@/shared/types';
import type { StructureDiff } from '../diff/diff';

/** An active structure comparison: what the active doc is being diffed against +
 *  the computed result (the viewer overlay + the DiffPanel both read it). */
export interface DiffView {
  /** Display name of the compared structure/version. */
  otherName: string;
  /** Path of the compared file (for reveal/open affordances). */
  otherPath: string;
  /** The doc id the diff was computed against — a tab switch invalidates it. */
  docId: string;
  result: StructureDiff;
}

export type NavMode = 'orbit' | 'fly';

/** A transient status-bar message that overrides the structure summary. */
export interface Notice {
  text: string;
  warn: boolean;
}

/** A detected mod workspace offered for a just-opened loose `.nbt` (kind 'file',
 *  filePath = the structure) or Minecraft world (kind 'world', filePath = its root). */
export interface Suggestion {
  workspace: Workspace;
  filePath: string;
  kind: 'file' | 'world';
}

export interface AppState {
  /** Recently opened files, most-recent first (mirrors main). */
  recents: string[];
  /** Active mod workspace, or null (mirrors main). */
  workspace: Workspace | null;
  /** Recently opened mod workspaces, most-recent first (mirrors main). */
  recentWorkspaces: Workspace[];
  /** Root of the PINNED workspace (auto-activates at launch), or null (mirrors main). */
  pinnedWorkspaceRoot: string | null;
  /** Recently opened worlds, most-recent first (mirrors main). */
  recentWorlds: WorldRef[];
  /** Absolute paths of the active workspace's `.nbt` structures. */
  workspaceStructures: string[];
  /** The active workspace's jigsaw template pools (Project panel's Jigsaws section). */
  workspaceJigsaws: WorkspaceJigsawPool[];
  /** Live viewer navigation mode, reflected by the Controls window. */
  navMode: NavMode;
  /** Minecraft version of the active content pack (from its version.json). */
  contentVersion: string | null;
  /** Transient status-bar message (e.g. a load error), or null for the default. */
  notice: Notice | null;
  /** Bottom-left prompt offering to load a detected mod workspace, or null. */
  suggest: Suggestion | null;
  /** A newer release detected by the update check, or null. Drives the update banner. */
  update: UpdateInfo | null;
  /** Whether the Settings modal is open. */
  settingsOpen: boolean;
  /** Which Settings section to show when it opens (e.g. routed to 'about' from
   *  the native About menu item). Consumed + reset by the modal. */
  settingsSection: string | null;
  /** Whether the Block Catalog modal is open. */
  catalogOpen: boolean;
  /** Whether the module gallery modal is open. */
  modulesOpen: boolean;
  /** Whether the in-app user Guide modal is open. */
  guideOpen: boolean;
  /** Whether the Rename Project modal is open (File ▸ Rename Project…). */
  renameOpen: boolean;
  /** Workspace name awaiting a manual version pick (shows the modal), or null. */
  versionPromptName: string | null;
  /** A chat image being shown full-size in the lightbox overlay, or null. */
  imagePreview: string | null;
  /** The structure being exported to a mod workspace (its `.nbt` path + a suggested
   *  resource name), or null when the export dialog is closed. */
  exportTarget: { path: string; name: string } | null;
  /** The active structure comparison (viewer overlay + DiffPanel), or null. */
  diff: DiffView | null;
  /** Whether the Re-theme dialog is open (File ▸ Re-theme Structure…). */
  rethemeOpen: boolean;
  /** Whether the Beauty Render dialog is open (File ▸ Render Image…). */
  renderOpen: boolean;
  /** Whether the Worldgen Doctor is open (File ▸ Workspace Check-Up…). */
  doctorOpen: boolean;

  setRecents: (recents: string[]) => void;
  setWorkspace: (workspace: Workspace | null) => void;
  setRecentWorkspaces: (workspaces: Workspace[]) => void;
  setPinnedWorkspaceRoot: (root: string | null) => void;
  setRecentWorlds: (worlds: WorldRef[]) => void;
  setWorkspaceStructures: (paths: string[]) => void;
  setWorkspaceJigsaws: (pools: WorkspaceJigsawPool[]) => void;
  setNavMode: (mode: NavMode) => void;
  setContentVersion: (version: string | null) => void;
  setNotice: (notice: Notice | null) => void;
  setSuggest: (suggest: Suggestion | null) => void;
  setUpdate: (update: UpdateInfo | null) => void;
  setSettingsOpen: (open: boolean) => void;
  setSettingsSection: (section: string | null) => void;
  setCatalogOpen: (open: boolean) => void;
  setModulesOpen: (open: boolean) => void;
  setGuideOpen: (open: boolean) => void;
  setRenameOpen: (open: boolean) => void;
  setVersionPromptName: (name: string | null) => void;
  setImagePreview: (src: string | null) => void;
  setExportTarget: (target: { path: string; name: string } | null) => void;
  setDiff: (diff: DiffView | null) => void;
  setRethemeOpen: (open: boolean) => void;
  setRenderOpen: (open: boolean) => void;
  setDoctorOpen: (open: boolean) => void;
}

/** Fallback content-pack version until main reports the real one (its
 *  version.json). The bundled pack is 1.21.1. */
export const FALLBACK_CONTENT_VERSION = '1.21.1';

export const store = createStore<AppState>((set) => ({
  recents: [],
  workspace: null,
  recentWorkspaces: [],
  pinnedWorkspaceRoot: null,
  recentWorlds: [],
  workspaceStructures: [],
  workspaceJigsaws: [],
  navMode: 'orbit',
  contentVersion: FALLBACK_CONTENT_VERSION,
  notice: null,
  suggest: null,
  update: null,
  settingsOpen: false,
  settingsSection: null,
  catalogOpen: false,
  modulesOpen: false,
  guideOpen: false,
  renameOpen: false,
  versionPromptName: null,
  imagePreview: null,
  exportTarget: null,
  diff: null,
  rethemeOpen: false,
  renderOpen: false,
  doctorOpen: false,

  setRecents: (recents) => set({ recents }),
  setWorkspace: (workspace) => set({ workspace }),
  setRecentWorkspaces: (recentWorkspaces) => set({ recentWorkspaces }),
  setPinnedWorkspaceRoot: (pinnedWorkspaceRoot) => set({ pinnedWorkspaceRoot }),
  setRecentWorlds: (recentWorlds) => set({ recentWorlds }),
  setWorkspaceStructures: (workspaceStructures) => set({ workspaceStructures }),
  setWorkspaceJigsaws: (workspaceJigsaws) => set({ workspaceJigsaws }),
  setNavMode: (navMode) => set({ navMode }),
  setContentVersion: (contentVersion) => set({ contentVersion }),
  setNotice: (notice) => set({ notice }),
  setSuggest: (suggest) => set({ suggest }),
  setUpdate: (update) => set({ update }),
  setSettingsOpen: (settingsOpen) => set({ settingsOpen }),
  setSettingsSection: (settingsSection) => set({ settingsSection }),
  setCatalogOpen: (catalogOpen) => set({ catalogOpen }),
  setModulesOpen: (modulesOpen) => set({ modulesOpen }),
  setGuideOpen: (guideOpen) => set({ guideOpen }),
  setRenameOpen: (renameOpen) => set({ renameOpen }),
  setVersionPromptName: (versionPromptName) => set({ versionPromptName }),
  setImagePreview: (imagePreview) => set({ imagePreview }),
  setExportTarget: (exportTarget) => set({ exportTarget }),
  setDiff: (diff) => set({ diff }),
  setRethemeOpen: (rethemeOpen) => set({ rethemeOpen }),
  setRenderOpen: (renderOpen) => set({ renderOpen }),
  setDoctorOpen: (doctorOpen) => set({ doctorOpen }),
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
