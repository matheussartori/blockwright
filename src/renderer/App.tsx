// Renderer orchestration: layout (titlebar / tabs / stage / statusbar), the
// multi-document open/load/close flow, IPC wiring, and reporting window state to
// main so the View menu stays in sync. Each open `.nbt` is a tab (a Document in
// the documents store) with its own structure, chat and AI session; the on-screen
// viewer follows the active tab, while a headless capture viewer screenshots
// builds generating in background tabs so concurrent generations don't collide.
import { useCallback, useEffect, useRef } from 'react';
import type { Workspace, WindowsReport, GenerateImage, RenderRequest } from '@/shared/types';
import { api } from './api';
import { basename } from './ui/path';
import { store } from './state/store';
import { settingsStore } from './state/settings';
import { windowsStore } from './state/windows';
import { documentsStore, activeDocument, docBySession } from './state/documents';
import { setDocLoader, bindGenerationProgress, hydrateDoc, cancelGeneration } from './state/generation';
import { ViewerProvider, Viewport, useViewer, useCaptureViewer } from './viewer/ViewerProvider';
import type { Viewer } from './viewer/viewer';
import { useActiveDoc, useDocuments } from './hooks/useStores';
import { Titlebar } from './components/Titlebar';
import { TabBar } from './components/TabBar';
import { Statusbar } from './components/Statusbar';
import { Loading } from './components/Loading';
import { Welcome } from './components/Welcome';
import { WorkspaceBadge } from './components/WorkspaceBadge';
import { WorkspaceSuggest } from './components/WorkspaceSuggest';
import { SettingsModal } from './components/SettingsModal';
import { VersionSelectModal } from './components/VersionSelectModal';
import { ImagePreview } from './components/ImagePreview';
import { InspectorDock, FloatingPanels } from './components/InspectorDock';
import { ShortcutsHelp } from './components/ShortcutsHelp';

/** Split a data URL into the { mediaType, data } the model expects. */
function toImg(url: string): GenerateImage {
  const [head, data] = url.split(',');
  return { mediaType: head.slice(5, head.indexOf(';')), data };
}

/** Multi-angle screenshots for the AI self-review loop: exterior orbits, a
 *  vertical cross-section, then top-down floor-plan cutaways (generate.ts labels
 *  them in this order). */
function captureAll(viewer: Viewer): GenerateImage[] {
  const shots = viewer.capture();
  const section = viewer.captureSection();
  const cutaways = viewer.captureCutaways();
  return [...shots, ...section, ...cutaways].map(toImg);
}

function Shell() {
  const viewer = useViewer();
  const captureViewer = useCaptureViewer();
  const activeDoc = useActiveDoc();
  const docCount = useDocuments((s) => s.documents.length);
  const structure = activeDoc?.structure ?? null;
  const fileOpen = structure !== null;
  const availability = {
    inspector: fileOpen,
    jigsaw: structure !== null && structure.jigsaws.length > 0,
    // Generate is always available — you can author from scratch or iterate on
    // whatever .nbt the active tab holds.
    generate: true,
  };
  // Handlers read the latest viewers from refs so they can stay stable.
  const viewerRef = useRef(viewer);
  viewerRef.current = viewer;
  const captureRef = useRef(captureViewer);
  captureRef.current = captureViewer;
  // Serializes AI render captures so two background generations can't interleave
  // on the single shared capture viewer (each show() would clobber the other).
  const renderChain = useRef<Promise<void>>(Promise.resolve());

  // Close a tab, first cancelling any generation running in it (so a closed tab
  // doesn't keep burning a generation in the background).
  const closeDocById = useCallback((id: string) => {
    cancelGeneration(id);
    documentsStore.getState().closeDoc(id);
  }, []);

  // Load `path` into the document `docId`: parse it, store the structure on the
  // doc, and — if that doc is the active tab — show it in the on-screen viewer.
  // `recent` is false for AI-generated temp versions so they never pollute the
  // recent-files list or trigger the mod-workspace suggestion.
  const load = useCallback(
    async (docId: string, path: string, opts?: { preserveCamera?: boolean; recent?: boolean }) => {
      const recent = opts?.recent ?? true;
      const preserveCamera = opts?.preserveCamera ?? false;
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
          documentsStore.getState().patchDoc(docId, { loading: false, path });
          store.getState().setNotice({ text: `${data.name} — no structure blocks found`, warn: true });
          return;
        }
        documentsStore.getState().patchDoc(docId, { structure: data, path, loading: false });
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

  // Open a file in a tab: focus its tab if already open (and already loaded),
  // else create one, restore its persisted chat, and load it.
  const openFile = useCallback(
    async (path: string) => {
      const ds = documentsStore.getState();
      const existing = ds.documents.find((d) => d.filePath === path);
      const id = ds.openDoc(path); // focuses an existing tab or creates a new one
      if (existing && existing.structure && existing.path === path) return; // already loaded
      await hydrateDoc(id);
      await load(id, path, { recent: true });
    },
    [load],
  );

  const open = useCallback(async () => {
    const path = await api.openDialog();
    if (path) void openFile(path);
  }, [openFile]);

  // A blank "Untitled" generate tab: nothing in the viewer, the chat panel open
  // and ready for a prompt.
  const newDoc = useCallback(() => {
    const id = documentsStore.getState().newDoc();
    windowsStore.getState().openPanel('generate');
    void hydrateDoc(id);
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
    // Re-render the file (with the mod's textures) in its tab, keeping the camera.
    const doc = documentsStore.getState().documents.find((d) => d.filePath === sug.filePath);
    if (doc) void load(doc.id, sug.filePath, { preserveCamera: true, recent: true });
  }, [load]);

  const onWorkspaceChanged = useCallback(async (ws: Workspace | null) => {
    const st = store.getState();
    st.setWorkspace(ws);
    st.setWorkspaceStructures(await api.listWorkspaceStructures());
    st.setSuggest(null);
    // A workspace whose version we couldn't detect needs one before jigsaw
    // previews can resolve; ask.
    if (ws && ws.minecraftVersion === null) st.setVersionPromptName(ws.name);
  }, []);

  // Give the generation module a way to load its results into the viewer, and
  // bind the single global progress listener (routes to the right tab).
  useEffect(() => {
    setDocLoader((docId, path, o) => load(docId, path, o));
    bindGenerationProgress();
  }, [load]);

  // One-time IPC wiring + initial loads.
  useEffect(() => {
    const st = store.getState();
    api.onOpenPath((p) => void openFile(p));
    api.onFileDrop((p) => void openFile(p));
    api.onCloseStructure(() => close());
    api.onOpenSettings(() => st.setSettingsOpen(true));
    api.onNewStructure(() => newDoc());
    api.onRecentsChanged((paths) => st.setRecents(paths));
    api.onRecentWorkspacesChanged((list) => st.setRecentWorkspaces(list));
    api.onWorkspaceChanged((ws) => void onWorkspaceChanged(ws));
    api.onToggleWindow((id) => {
      const w = windowsStore.getState();
      if (!w[id].visible && id !== 'controls') w.openPanel(id);
      else w.setVisible(id, !w[id].visible);
    });
    api.onResetWindows(() => windowsStore.getState().resetAll());
    // The AI generator (main) asks us to render each version it emits and hand
    // back screenshots. We route by session id: the ACTIVE tab's build renders
    // in the on-screen viewer (the user watches it evolve), while a BACKGROUND
    // tab's build renders in the headless capture viewer so it doesn't disturb
    // whatever the user is currently looking at — letting tabs generate at once.
    const handleRender = async ({ requestId, sessionId, path, version }: RenderRequest) => {
      try {
        const doc = docBySession(sessionId);
        const isActive = !!doc && documentsStore.getState().activeId === doc.id;
        const data = await api.loadStructure(path);
        if (doc) documentsStore.getState().patchDoc(doc.id, { structure: data, path });
        let target: Viewer | null;
        if (isActive && viewerRef.current) {
          await viewerRef.current.show(data, version > 1);
          target = viewerRef.current;
        } else {
          await captureRef.current?.show(data);
          target = captureRef.current;
        }
        const images = target ? captureAll(target) : [];
        api.sendRenderResult({ requestId, images });
      } catch (err) {
        api.sendRenderResult({ requestId, error: String(err) });
      }
    };
    // Chain each render so captures never interleave on the shared viewers.
    api.onAiRenderRequest((req) => {
      renderChain.current = renderChain.current.then(() => handleRender(req));
    });

    void (async () => {
      st.setRecents(await api.listRecents());
      st.setWorkspace(await api.getWorkspace());
      st.setWorkspaceStructures(await api.listWorkspaceStructures());
      st.setRecentWorkspaces(await api.listRecentWorkspaces());
      const version = await api.getContentVersion();
      if (version) st.setContentVersion(version);
    })();
  }, [openFile, close, newDoc, onWorkspaceChanged]);

  // The on-screen viewer follows the active tab: when the focused tab changes,
  // show its structure (re-framed) or clear the scene. Structure updates within
  // the active tab (loads, new versions) are shown by `load` itself, so this only
  // reacts to the active tab *identity* changing. Also runs once the viewer is
  // ready, to flush a file opened before mount (e.g. BW_OPEN at startup).
  useEffect(() => {
    if (!viewer) return;
    let lastId: string | null = null;
    const sync = () => {
      const doc = activeDocument(documentsStore.getState());
      const id = doc?.id ?? null;
      if (id === lastId) return;
      lastId = id;
      if (doc?.structure) void viewer.show(doc.structure);
      else viewer.clear();
    };
    sync();
    return documentsStore.subscribe(sync);
  }, [viewer]);

  // Push persisted settings into the viewer, now and on every change.
  useEffect(() => {
    if (!viewer) return;
    const apply = () => {
      const s = settingsStore.getState();
      viewer.setLookSensitivity(s.lookSensitivity);
      viewer.setInvertY(s.invertY);
      viewer.setShowGrid(s.showGrid);
      viewer.setShowJigsaw(s.showJigsaw);
      viewer.setHideShell(s.hideShell);
    };
    apply();
    return settingsStore.subscribe(apply);
  }, [viewer]);

  // Mirror file-open + window state to main (drives Close File and the View
  // menu). Only re-sends when the *reported* shape changes.
  useEffect(() => {
    const lastKey = { current: '' };
    const send = () => {
      const w = windowsStore.getState();
      const doc = activeDocument(documentsStore.getState());
      const open = doc?.structure != null;
      const hasJigsaw = open && doc!.structure!.jigsaws.length > 0;
      const report: WindowsReport = {
        controls: { visible: w.controls.visible, available: open },
        inspector: { visible: w.inspector.visible, available: open },
        jigsaw: { visible: w.jigsaw.visible, available: hasJigsaw },
        generate: { visible: w.generate.visible, available: true },
      };
      const key = JSON.stringify({ open, report });
      if (key === lastKey.current) return;
      lastKey.current = key;
      api.setFileOpen(open);
      api.reportWindows(report);
    };
    send();
    const u1 = windowsStore.subscribe(send);
    const u2 = documentsStore.subscribe(send);
    return () => {
      u1();
      u2();
    };
  }, []);

  return (
    <>
      <div className="topbar">
        <Titlebar />
        <TabBar onNew={newDoc} onClose={closeDocById} />
      </div>
      <main className="stage">
        <div className="stage-main">
          <Viewport />
          {docCount === 0 && (
            <Welcome
              onOpen={() => void open()}
              onLoad={(p) => void openFile(p)}
              onActivateWorkspace={(ws) => void api.activateWorkspace(ws)}
              onGenerate={newDoc}
            />
          )}
          {docCount > 0 && !fileOpen && !activeDoc?.loading && (
            <div className="empty-tab">
              <p>This tab is empty.</p>
              <p className="empty-tab-hint">
                Describe a build in the Generate panel, or open an <code>.nbt</code> file.
              </p>
            </div>
          )}
          <FloatingPanels availability={availability} />
          <WorkspaceBadge />
          <WorkspaceSuggest
            onAccept={() => void acceptSuggest()}
            onDismiss={() => store.getState().setSuggest(null)}
          />
          <ShortcutsHelp available={fileOpen} />
          <Loading />
        </div>
        <InspectorDock availability={availability} />
      </main>
      <Statusbar />
      <SettingsModal />
      <VersionSelectModal />
      <ImagePreview />
    </>
  );
}

export function App() {
  return (
    <div className={`shell platform-${api.platform}`}>
      <ViewerProvider>
        <Shell />
      </ViewerProvider>
    </div>
  );
}
