// The multi-document open/load/close flow + the mod-workspace suggestion handlers.
// Each open `.nbt` is a tab (a Document) with its own structure/chat/AI session; the
// on-screen viewer follows the active tab. These handlers are the single place that
// mutates the documents store from user actions (menus, the welcome screen, drops).
import { useCallback, useEffect, type MutableRefObject } from 'react';
import type { ExportMode, Workspace } from '@/shared/types';
import { api } from '../api';
import { sanitizeResourceName } from '@/shared/domain/worldgen';
import { effectiveNbtLimit } from '@/shared/domain/split';
import { basename } from '../ui/path';
import { store } from '../state/store';
import { settingsStore } from '../state/settings';
import { plannerStore } from '../state/planner';
import { windowsStore } from '../state/windows';
import { documentsStore, activeDocument } from '../state/documents';
import { bindGenerationProgress, hydrateDoc, cancelGeneration } from '../state/generation';
import { setDocLoader } from '../state/doc-loader';
import { currentBasePath, commitManualVersion } from '../state/versions';
import type { Viewer } from '../viewer/viewer';

export interface LoadOpts {
  preserveCamera?: boolean;
  recent?: boolean;
  working?: boolean;
}

/** The handlers the Shell + IPC wiring need to drive documents. */
export interface DocumentFlow {
  load: (docId: string, path: string, opts?: LoadOpts) => Promise<void>;
  openFile: (path: string) => Promise<void>;
  open: () => Promise<void>;
  openWorld: (root?: string) => Promise<void>;
  openAssembly: () => Promise<void>;
  reimportWorld: () => Promise<void>;
  newDoc: () => void;
  close: () => void;
  closeDocById: (id: string) => void;
  exportActive: (mode?: ExportMode) => Promise<void>;
  exportToWorldActive: () => Promise<void>;
  exportToWorkspaceActive: () => void;
  acceptSuggest: () => Promise<void>;
  onWorkspaceChanged: (ws: Workspace | null) => Promise<void>;
}

/** Wire up the document open/load/close + workspace flow against the on-screen
 *  viewer (read from `viewerRef` so the handlers stay stable). */
export function useDocumentFlow(viewerRef: MutableRefObject<Viewer | null>): DocumentFlow {
  // Close a tab, first cancelling any generation running in it (so a closed tab
  // doesn't keep burning a generation in the background).
  const closeDocById = useCallback((id: string) => {
    cancelGeneration(id);
    documentsStore.getState().closeDoc(id);
  }, []);

  // Load `path` into the document `docId`: parse it, store the structure on the doc,
  // and — if that doc is the active tab — show it in the on-screen viewer. `recent`
  // is false for AI-generated temp versions so they never pollute the recent-files
  // list or trigger the mod-workspace suggestion.
  const load = useCallback(
    async (docId: string, path: string, opts?: LoadOpts) => {
      const recent = opts?.recent ?? true;
      const preserveCamera = opts?.preserveCamera ?? false;
      // When previewing an earlier version (working:false) we show it in the viewer
      // but leave the doc's working `path` (the AI edit base) on the latest.
      const working = opts?.working ?? true;
      const ds = documentsStore.getState();
      if (!ds.documents.some((d) => d.id === docId)) return; // tab closed mid-load
      if (!(await api.pathExists(path))) {
        if (recent) api.removeRecent(path); // main re-broadcasts the trimmed list
        store.getState().setNotice({ text: `${basename(path)} no longer exists — removed from Recent`, warn: true });
        return;
      }
      ds.patchDoc(docId, { loading: true });
      try {
        const data = await api.loadStructure(path);
        if (recent) api.addRecent(path);
        if (data.blocks.length === 0) {
          // A parseable file with zero placed blocks: don't land the tab on the build
          // planner — flag it so the stage shows the "no blocks" empty state instead.
          documentsStore.getState().patchDoc(docId, { loading: false, emptyPath: path, ...(working ? { path } : {}) });
          store.getState().setNotice(null);
          return;
        }
        // Seed the floor plan from the storeys main auto-detected on load — but only
        // when this doc has none yet (a persisted/edited plan wins) and we're showing
        // the working build (not previewing an earlier version).
        const cur = documentsStore.getState().documents.find((d) => d.id === docId);
        const seedFloors =
          working && cur && cur.floors.length === 0 && data.floors && data.floors.length > 0
            ? { floors: data.floors }
            : {};
        documentsStore.getState().patchDoc(docId, { structure: data, emptyPath: null, loading: false, ...seedFloors, ...(working ? { path } : {}) });
        store.getState().setNotice(null);
        if (documentsStore.getState().activeId === docId && viewerRef.current) {
          await viewerRef.current.show(data, preserveCamera);
        }
        if (recent) void maybeSuggestWorkspace(path);
      } catch (err) {
        documentsStore.getState().patchDoc(docId, { loading: false });
        store.getState().setNotice({ text: `Failed to open: ${String(err)}`, warn: true });
      }
    },
    [],
  );

  // Open a file in a tab: focus its tab if already open (and already loaded), else
  // create one, restore its persisted chat, and load it.
  const openFile = useCallback(
    async (path: string) => {
      const ds = documentsStore.getState();
      const existing = ds.documents.find((d) => d.filePath === path);
      const id = ds.openDoc(path); // focuses an existing tab or creates a new one
      if (existing && existing.structure) return; // already open + loaded — just focus it
      // Opening a file is a VIEW action — default the dock to Info, not whatever tab
      // (often Generate) was last left selected. The new-build/generate flow sets its
      // own tab in `build()`, so this only affects opening an existing structure.
      windowsStore.getState().setActiveTab('inspector');
      await hydrateDoc(id);
      // If this file has AI generation history, resume on its LATEST version so
      // reopening lands exactly where the user left off (and the viewer matches the
      // Versions panel's highlight, instead of showing the original file). Recents
      // and workspace detection still key off the real file the user opened.
      const doc = documentsStore.getState().documents.find((d) => d.id === id);
      const latest = doc && doc.versions.length > 0 ? doc.versions[doc.versions.length - 1] : null;
      if (latest) {
        api.addRecent(path);
        await load(id, latest.path, { recent: false });
        void maybeSuggestWorkspace(path);
      } else {
        await load(id, path, { recent: true });
      }
    },
    [load],
  );

  const open = useCallback(async () => {
    const path = await api.openDialog();
    if (path) void openFile(path);
  }, [openFile]);

  // Open a Minecraft world (no root = folder picker) as a world tab. Like opening a
  // loose `.nbt`, a world that sits inside a mod project's dev run dir (and no active
  // workspace) triggers the bottom-left workspace suggestion, so the mod's blocks
  // render with their real textures in the fly-through.
  const openWorld = useCallback(async (root?: string) => {
    const meta = await api.openWorld(root);
    if (!meta) return;
    documentsStore.getState().openWorldDoc(meta);
    if (store.getState().workspace !== null) return;
    const ws = await api.detectWorldWorkspace(meta.root);
    store.getState().setSuggest(ws ? { workspace: ws, filePath: meta.root, kind: 'world' } : null);
  }, []);

  // Reassemble a split jigsaw assembly (Blockwright's own export, or an Export to World
  // datapack) back into one structure and open it as a new document, so an oversized build
  // can be re-edited as a whole. main picks the folder, stitches the pieces, and returns a
  // temp `.nbt` to open. A partial result (missing pieces) still opens, with a warning.
  const openAssembly = useCallback(async () => {
    const result = await api.reassembleAssembly();
    if (result.ok) {
      await openFile(result.path);
      store.getState().setNotice(
        result.missing > 0
          ? { text: `Reassembled with ${result.missing} piece(s) missing`, warn: true }
          : { text: 'Reassembled the structure', warn: false },
      );
    } else if (!result.canceled) {
      store.getState().setNotice({ text: `Reassemble failed: ${result.error ?? 'unknown error'}`, warn: true });
    }
  }, [openFile]);

  // A blank "Untitled" build tab: nothing in the viewer — the stage shows the Details-first
  // NewBuildPanel (App renders it for an empty, non-busy doc). We deliberately DON'T force the
  // chat dock open here: a fresh build starts in the planner, and `build()` reveals the chat
  // (so you can watch progress + iterate) once generation kicks off. Reset the planner draft so
  // a new tab starts from a clean slate, not a previous tab's half-configured build.
  const newDoc = useCallback(() => {
    const id = documentsStore.getState().newDoc();
    plannerStore.getState().reset();
    void hydrateDoc(id);
  }, []);

  // Export the active tab's CURRENT version (the promoted one, else the latest) to a
  // location the user picks. The source is a real `.nbt` on disk, so main just copies
  // it. Suggest the file's own name, or "<title>.nbt" for an untitled AI build.
  // `mode` picks the flavour: 'nbt' = one pure file (never split — mods need the raw
  // file whatever its size), 'jigsaw' = the split assembly (menu-gated to oversized).
  const exportActive = useCallback(async (mode: ExportMode = 'nbt') => {
    const doc = activeDocument(documentsStore.getState());
    if (!doc) return;
    const src = currentBasePath(doc);
    if (!src) return; // nothing loaded to export
    const suggested = doc.filePath ? basename(doc.filePath) : `${doc.title || 'structure'}.nbt`;
    const nbtLimit = effectiveNbtLimit(settingsStore.getState().nbtSizeLimit, store.getState().workspace?.minecraftVersion ?? null);
    const result = await api.exportStructure(src, suggested, nbtLimit, mode);
    if (result.ok) {
      const text = result.splitPieces ? `Split into ${result.splitPieces} jigsaw pieces` : `Exported to ${basename(result.path)}`;
      store.getState().setNotice({ text, warn: false });
    } else if (!result.canceled) {
      store.getState().setNotice({ text: `Export failed: ${result.error ?? 'unknown error'}`, warn: true });
    }
  }, []);

  // Install the active tab's current build into a Minecraft world save for editing + round-trip
  // (main picks the save folder; within the size limit → a raw .nbt loadable with one structure
  // block, else an editing datapack of pieces with SAVE-mode structure blocks). After editing
  // in-world the user runs Reimport from World. Same source selection as exportActive.
  const exportToWorldActive = useCallback(async () => {
    const doc = activeDocument(documentsStore.getState());
    if (!doc) return;
    const src = currentBasePath(doc);
    if (!src) return;
    const suggested = doc.filePath ? basename(doc.filePath) : `${doc.title || 'structure'}.nbt`;
    const nbtLimit = effectiveNbtLimit(settingsStore.getState().nbtSizeLimit, store.getState().workspace?.minecraftVersion ?? null);
    const result = await api.exportToWorld(src, suggested, nbtLimit);
    if (result.ok) {
      store.getState().setNotice({ text: 'Installed into your world', warn: false });
    } else if (!result.canceled) {
      store.getState().setNotice({ text: `Export failed: ${result.error ?? 'unknown error'}`, warn: true });
    }
  }, []);

  // Reassemble the pieces the player re-SAVEd in their world (the editing scaffold
  // round-trip). main picks the save folder, reads the edited pieces, and returns a
  // stitched temp `.nbt`. When a project tab is open we commit that structure as a NEW
  // VERSION of it (so the in-world edits become v(N+1) of the same project, and the
  // Versions panel / Current pointer pick it up) — re-encoded faithfully via the
  // save-version path (no AI repair). With no tab open we just open it as a fresh doc.
  const reimportWorld = useCallback(async () => {
    const result = await api.reimportWorld();
    if (!result.ok) {
      if (!result.canceled) store.getState().setNotice({ text: `Reimport failed: ${result.error ?? 'unknown error'}`, warn: true });
      return;
    }
    const missingNote = result.missing > 0 ? ` (${result.missing} piece(s) missing)` : '';
    // Commit into the active GENERATED project — the round-trip's home (you exported it from
    // there). We only graft onto a `generated` tab so the in-world edits can't silently attach
    // to an unrelated opened file; anything else opens as a fresh document.
    const doc = activeDocument(documentsStore.getState());
    if (doc?.generated) {
      try {
        const structure = await api.loadStructure(result.path);
        const res = await api.saveVersion({
          sessionId: doc.sessionId,
          sourcePath: result.path,
          size: structure.size,
          palette: structure.palette.map((p) => ({ name: p.name, properties: p.properties })),
          blocks: structure.blocks.map((b) => ({ state: b.state, pos: b.pos })),
          slug: doc.title && doc.title !== 'Untitled' ? doc.title : undefined,
        });
        if (res.ok && res.version != null && res.path) {
          await commitManualVersion(doc.id, res.version, res.path, res.libraryPath ?? null);
          store.getState().setNotice({ text: `Reimported into ${doc.title} as v${res.version}${missingNote}`, warn: result.missing > 0 });
        } else {
          // Surface the failure rather than silently opening a stray copy and claiming success.
          store.getState().setNotice({ text: `Reimport failed: ${res.error ?? 'could not commit the version'}`, warn: true });
        }
      } catch (err) {
        store.getState().setNotice({ text: `Reimport failed: ${err instanceof Error ? err.message : String(err)}`, warn: true });
      }
      return;
    }
    await openFile(result.path);
    store.getState().setNotice({ text: `Reimported the edited structure${missingNote}`, warn: result.missing > 0 });
  }, [openFile]);

  // Open the "Export to mod" dialog for the active tab's current build. Same source
  // selection as exportActive (a previewed version or the working build); the dialog
  // (ExportModal) then writes it + the worldgen JSON into the active workspace.
  const exportToWorkspaceActive = useCallback(() => {
    const doc = activeDocument(documentsStore.getState());
    if (!doc) return;
    const src = currentBasePath(doc);
    if (!src) return;
    const stem = doc.filePath ? basename(doc.filePath).replace(/\.nbt$/i, '') : doc.title || 'structure';
    store.getState().setExportTarget({ path: src, name: sanitizeResourceName(stem) });
  }, []);

  // Close the active tab; the active-tab effect re-points the viewer afterwards.
  const close = useCallback(() => {
    const id = documentsStore.getState().activeId;
    if (!id) return;
    store.getState().setSuggest(null);
    // "See inside" is a per-structure aid, not a durable preference — reset it.
    settingsStore.getState().set('hideShell', false);
    closeDocById(id);
  }, [closeDocById]);

  const maybeSuggestWorkspace = useCallback(async (path: string) => {
    if (store.getState().workspace !== null) return;
    const ws = await api.detectFileWorkspace(path);
    store.getState().setSuggest(ws ? { workspace: ws, filePath: path, kind: 'file' } : null);
  }, []);

  const acceptSuggest = useCallback(async () => {
    const sug = store.getState().suggest;
    if (!sug) return;
    const active = await api.activateWorkspace(sug.workspace);
    store.getState().setSuggest(null);
    if (!active) return;
    // A world doesn't reload from a path — onWorkspaceChanged already soft-refreshes
    // the streamed chunks so the mod's textures resolve. Nothing more to do here.
    if (sug.kind === 'world') return;
    // Re-render with the mod's textures, keeping the camera — and re-render the
    // structure CURRENTLY shown (the latest version, or whichever version is being
    // previewed), not the original file, which would jump the viewer back to the
    // baseline while the Versions panel still says v3.
    const doc = documentsStore.getState().documents.find((d) => d.filePath === sug.filePath);
    if (!doc) return;
    const preview = doc.viewingVersion != null
      ? doc.versions.find((v) => v.version === doc.viewingVersion)
      : null;
    const path = preview?.path ?? doc.path ?? sug.filePath;
    void load(doc.id, path, { preserveCamera: true, recent: false, working: preview == null });
  }, [load]);

  const onWorkspaceChanged = useCallback(async (ws: Workspace | null) => {
    const st = store.getState();
    st.setWorkspace(ws);
    st.setWorkspaceStructures(await api.listWorkspaceStructures());
    st.setWorkspaceJigsaws(await api.listWorkspaceJigsaws());
    st.setSuggest(null);
    // If a world is open, soft-refresh its streamed chunks so the workspace's blocks — which the app
    // didn't know before — pick up their textures, without moving the camera. (A structure re-renders
    // via acceptSuggest's load(); a world can't reload from a path, so the viewer re-fetches its chunks.)
    if (viewerRef.current?.worldActive) viewerRef.current.refreshWorld();
    // A workspace whose version we couldn't detect needs one before jigsaw previews
    // can resolve; ask.
    if (ws && ws.minecraftVersion === null) st.setVersionPromptName(ws.name);
  }, []);

  // Give the generation module a way to load its results into the viewer, and bind
  // the single global progress listener (routes to the right tab).
  useEffect(() => {
    setDocLoader((docId, path, o) => load(docId, path, o));
    bindGenerationProgress();
  }, [load]);

  return { load, openFile, open, openWorld, openAssembly, reimportWorld, newDoc, close, closeDocById, exportActive, exportToWorldActive, exportToWorkspaceActive, acceptSuggest, onWorkspaceChanged };
}
