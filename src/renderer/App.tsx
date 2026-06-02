// Renderer orchestration: layout (titlebar / stage / statusbar), the file
// open/load/close flow, IPC wiring, and reporting window state to main so the
// View menu stays in sync. State lives in the Zustand stores; components
// subscribe to the slice they render.
import { useCallback, useEffect, useRef } from 'react';
import type { Workspace, WindowsReport } from '@/shared/types';
import { api } from './api';
import { basename } from './ui/path';
import { store } from './state/store';
import { settingsStore } from './state/settings';
import { windowsStore } from './state/windows';
import { ViewerProvider, Viewport, useViewer } from './viewer/ViewerProvider';
import { useApp } from './hooks/useStores';
import { Titlebar } from './components/Titlebar';
import { Statusbar } from './components/Statusbar';
import { Loading } from './components/Loading';
import { Welcome } from './components/Welcome';
import { WorkspaceBadge } from './components/WorkspaceBadge';
import { WorkspaceSuggest } from './components/WorkspaceSuggest';
import { SettingsModal } from './components/SettingsModal';
import { VersionSelectModal } from './components/VersionSelectModal';
import { InspectorDock, FloatingPanels } from './components/InspectorDock';
import { ShortcutsHelp } from './components/ShortcutsHelp';

function Shell() {
  const viewer = useViewer();
  // Drives the inspector panels' availability (Info needs a file; Jigsaw needs
  // jigsaw connectors). Subscribed so the dock/floating panels track the file.
  const structure = useApp((s) => s.structure);
  const fileOpen = structure !== null;
  const availability = {
    inspector: fileOpen,
    jigsaw: structure !== null && structure.jigsaws.length > 0,
  };
  // Handlers read the latest viewer from a ref so they can stay stable; a load
  // requested before the viewer is ready is queued and run once it exists.
  const viewerRef = useRef(viewer);
  viewerRef.current = viewer;
  const pending = useRef<string | null>(null);

  const load = useCallback(async (path: string) => {
    const st = store.getState();
    if (!viewerRef.current) {
      pending.current = path; // viewport not mounted yet — run on ready
      return;
    }
    if (!(await api.pathExists(path))) {
      api.removeRecent(path); // main re-broadcasts the trimmed list
      st.setNotice({ text: `${basename(path)} no longer exists — removed from Recent`, warn: true });
      return;
    }
    st.setLoading(true);
    try {
      const data = await api.loadStructure(path);
      api.addRecent(path);
      if (data.blocks.length === 0) {
        st.setNotice({ text: `${data.name} — no structure blocks found`, warn: true });
      } else {
        await viewerRef.current.show(data);
        st.setStructure(data);
        st.setNotice(null);
        void maybeSuggestWorkspace(path);
      }
    } catch (err) {
      st.setNotice({ text: `Failed to open: ${String(err)}`, warn: true });
    } finally {
      st.setLoading(false);
    }
  }, []);

  const close = useCallback(() => {
    const st = store.getState();
    st.setSuggest(null);
    if (st.structure === null) return;
    viewerRef.current?.clear();
    st.setStructure(null);
    st.setNotice(null);
  }, []);

  const open = useCallback(async () => {
    const path = await api.openDialog();
    if (path) void load(path);
  }, [load]);

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
    if (active) void load(sug.filePath); // re-render with the mod's textures
  }, [load]);

  const onWorkspaceChanged = useCallback(
    async (ws: Workspace | null) => {
      const st = store.getState();
      st.setWorkspace(ws);
      st.setWorkspaceStructures(await api.listWorkspaceStructures());
      st.setSuggest(null);
      if (ws === null) {
        close();
        return;
      }
      // A workspace whose version we couldn't detect needs one before jigsaw
      // previews can resolve; ask.
      if (ws.minecraftVersion === null) st.setVersionPromptName(ws.name);
    },
    [close],
  );

  // One-time IPC wiring + initial loads.
  useEffect(() => {
    const st = store.getState();
    api.onOpenPath((p) => void load(p));
    api.onFileDrop((p) => void load(p));
    api.onCloseStructure(() => close());
    api.onOpenSettings(() => st.setSettingsOpen(true));
    api.onRecentsChanged((paths) => st.setRecents(paths));
    api.onRecentWorkspacesChanged((list) => st.setRecentWorkspaces(list));
    api.onWorkspaceChanged((ws) => void onWorkspaceChanged(ws));
    api.onToggleWindow((id) => {
      const w = windowsStore.getState();
      w.setVisible(id, !w[id].visible);
    });
    api.onResetWindows(() => windowsStore.getState().resetAll());

    void (async () => {
      st.setRecents(await api.listRecents());
      st.setWorkspace(await api.getWorkspace());
      st.setWorkspaceStructures(await api.listWorkspaceStructures());
      st.setRecentWorkspaces(await api.listRecentWorkspaces());
      const version = await api.getContentVersion();
      if (version) st.setContentVersion(version);
    })();
  }, [load, close, onWorkspaceChanged]);

  // Run a queued load once the viewer is ready.
  useEffect(() => {
    if (viewer && pending.current) {
      const p = pending.current;
      pending.current = null;
      void load(p);
    }
  }, [viewer, load]);

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
  // menu). Only re-sends when the *reported* shape changes, so dragging a window
  // (position churn) doesn't rebuild the native menu.
  useEffect(() => {
    const lastKey = { current: '' };
    const send = () => {
      const st = store.getState();
      const w = windowsStore.getState();
      const open = st.structure !== null;
      const hasJigsaw = open && st.structure!.jigsaws.length > 0;
      const report: WindowsReport = {
        controls: { visible: w.controls.visible, available: open },
        inspector: { visible: w.inspector.visible, available: open },
        jigsaw: { visible: w.jigsaw.visible, available: hasJigsaw },
      };
      const key = JSON.stringify({ open, report });
      if (key === lastKey.current) return;
      lastKey.current = key;
      api.setFileOpen(open);
      api.reportWindows(report);
    };
    send();
    const u1 = store.subscribe(send);
    const u2 = windowsStore.subscribe(send);
    return () => {
      u1();
      u2();
    };
  }, []);

  return (
    <>
      <Titlebar onOpen={() => void open()} />
      <main className="stage">
        <div className="stage-main">
          <Viewport />
          <Welcome
            onOpen={() => void open()}
            onLoad={(p) => void load(p)}
            onActivateWorkspace={(ws) => void api.activateWorkspace(ws)}
          />
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
