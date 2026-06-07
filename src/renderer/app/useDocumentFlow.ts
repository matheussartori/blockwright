// The multi-document open/load/close flow + the mod-workspace suggestion handlers.
// Each open `.nbt` is a tab (a Document) with its own structure/chat/AI session; the
// on-screen viewer follows the active tab. These handlers are the single place that
// mutates the documents store from user actions (menus, the welcome screen, drops).
import { useCallback, useEffect, type MutableRefObject } from 'react';
import type { Workspace } from '@/shared/types';
import { api } from '../api';
import { basename } from '../ui/path';
import { store } from '../state/store';
import { settingsStore } from '../state/settings';
import { windowsStore } from '../state/windows';
import { documentsStore, activeDocument } from '../state/documents';
import { setDocLoader, bindGenerationProgress, hydrateDoc, cancelGeneration } from '../state/generation';
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
  newDoc: () => void;
  close: () => void;
  closeDocById: (id: string) => void;
  exportActive: () => Promise<void>;
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
          documentsStore.getState().patchDoc(docId, { loading: false, ...(working ? { path } : {}) });
          store.getState().setNotice({ text: `${data.name} — no structure blocks found`, warn: true });
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
        documentsStore.getState().patchDoc(docId, { structure: data, loading: false, ...seedFloors, ...(working ? { path } : {}) });
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

  // A blank "Untitled" generate tab: nothing in the viewer, the chat panel open and
  // ready for a prompt.
  const newDoc = useCallback(() => {
    const id = documentsStore.getState().newDoc();
    windowsStore.getState().openPanel('generate');
    void hydrateDoc(id);
  }, []);

  // Export the active tab's CURRENT build to a location the user picks. We export
  // exactly what's on screen: a previewed earlier version if one is being viewed,
  // otherwise the working build (`path`). The source is a real `.nbt` on disk, so
  // main just copies it. Suggest the file's own name, or "<title>.nbt" for an
  // untitled AI build.
  const exportActive = useCallback(async () => {
    const doc = activeDocument(documentsStore.getState());
    if (!doc) return;
    const preview = doc.viewingVersion != null
      ? doc.versions.find((v) => v.version === doc.viewingVersion)
      : null;
    const src = preview?.path ?? doc.path;
    if (!src) return; // nothing loaded to export
    const suggested = doc.filePath ? basename(doc.filePath) : `${doc.title || 'structure'}.nbt`;
    const result = await api.exportStructure(src, suggested);
    if (result.ok) {
      store.getState().setNotice({ text: `Exported to ${basename(result.path)}`, warn: false });
    } else if (!result.canceled) {
      store.getState().setNotice({ text: `Export failed: ${result.error ?? 'unknown error'}`, warn: true });
    }
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
    store.getState().setSuggest(ws ? { workspace: ws, filePath: path } : null);
  }, []);

  const acceptSuggest = useCallback(async () => {
    const sug = store.getState().suggest;
    if (!sug) return;
    const active = await api.activateWorkspace(sug.workspace);
    store.getState().setSuggest(null);
    if (!active) return;
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
    st.setSuggest(null);
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

  return { load, openFile, open, newDoc, close, closeDocById, exportActive, acceptSuggest, onWorkspaceChanged };
}
