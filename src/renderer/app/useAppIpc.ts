// Renderer↔main plumbing: the one-time IPC wiring (native menu / file-open / drop /
// workspace listeners + the initial state loads), and the file-open + window-state
// report back to main that keeps the View menu's checkmarks and Close File in sync.
import { useEffect } from 'react';
import type { WindowsReport } from '@/shared/types';
import { effectiveNbtLimit } from '@/shared/domain/split';
import { api } from '../api';
import { store } from '../state/store';
import { settingsStore } from '../state/settings';
import { windowsStore } from '../state/windows';
import { documentsStore, activeDocument } from '../state/documents';
import { editorStore } from '../state/editor';
import { loadDoc } from '../state/doc-loader';
import { compareActiveWith } from '../state/diff';
import type { DocumentFlow } from './useDocumentFlow';

/** The document handlers the IPC listeners dispatch to. */
type IpcHandlers = Pick<
  DocumentFlow,
  | 'openFile'
  | 'openWorld'
  | 'openAssembly'
  | 'reimportWorld'
  | 'close'
  | 'newDoc'
  | 'exportActive'
  | 'exportToWorldActive'
  | 'exportToWorkspaceActive'
  | 'onWorkspaceChanged'
>;

export function useAppIpc({ openFile, openWorld, openAssembly, reimportWorld, close, newDoc, exportActive, exportToWorldActive, exportToWorkspaceActive, onWorkspaceChanged }: IpcHandlers): void {
  // One-time IPC wiring + initial loads.
  useEffect(() => {
    const st = store.getState();
    api.onOpenPath((p) => void openFile(p));
    api.onFileDrop((p) => void openFile(p));
    api.onOpenWorld((root) => void openWorld(root));
    api.onCloseStructure(() => close());
    api.onOpenSettings((section) => {
      if (section) st.setSettingsSection(section);
      st.setSettingsOpen(true);
    });
    api.onNewStructure(() => newDoc());
    api.onExportFile((mode) => void exportActive(mode));
    api.onExportToWorld(() => void exportToWorldActive());
    api.onExportToWorkspace(() => exportToWorkspaceActive());
    api.onRenameProject(() => st.setRenameOpen(true));
    api.onOpenAssembly(() => void openAssembly());
    api.onReimportWorld(() => void reimportWorld());
    api.onCompareFile(() => {
      // Pick the other file via the native dialog, then diff it against the active doc.
      void api.openDialog().then((p) => (p ? compareActiveWith(p) : undefined));
    });
    api.onRetheme(() => st.setRethemeOpen(true));
    api.onRenderImage(() => st.setRenderOpen(true));
    api.onOpenDoctor(() => st.setDoctorOpen(true));
    // Watch mode: an external edit to the on-screen file hot-reloads it in place —
    // unless a run is in flight or the block editor holds unsaved edits (never clobber).
    api.onFileChanged((p) => {
      const doc = documentsStore.getState().documents.find((d) => d.path === p);
      if (!doc || doc.busy) return;
      const ed = editorStore.getState();
      if (ed.active && ed.dirty) return;
      void loadDoc(doc.id, p, { preserveCamera: true });
    });
    api.onWorkspaceStructuresChanged(() => {
      void api.listWorkspaceStructures().then((paths) => st.setWorkspaceStructures(paths));
    });
    api.onOpenCatalog(() => st.setCatalogOpen(true));
    api.onOpenModules(() => st.setModulesOpen(true));
    api.onOpenGuide(() => st.setGuideOpen(true));
    api.onUpdateAvailable((info) => st.setUpdate(info));
    api.onRecentsChanged((paths) => st.setRecents(paths));
    api.onRecentWorkspacesChanged((list) => st.setRecentWorkspaces(list));
    api.onPinnedWorkspaceChanged((root) => st.setPinnedWorkspaceRoot(root));
    api.onRecentWorldsChanged((list) => st.setRecentWorlds(list));
    api.onWorkspaceChanged((ws) => void onWorkspaceChanged(ws));
    api.onToggleWindow((id) => {
      const w = windowsStore.getState();
      // `project` (left panel) tracks visibility in its own flat flag.
      if (id === 'project') return w.setProjectVisible(!w.projectVisible);
      // `controls` (shortcuts popover) and `console` (bottom dock) are plain
      // visibility toggles; the dockable sidebar panels surface via openPanel.
      if (!w[id].visible && id !== 'controls' && id !== 'console') w.openPanel(id);
      else w.setVisible(id, !w[id].visible);
    });
    api.onResetWindows(() => windowsStore.getState().resetAll());

    void (async () => {
      st.setRecents(await api.listRecents());
      st.setWorkspace(await api.getWorkspace());
      st.setWorkspaceStructures(await api.listWorkspaceStructures());
      st.setRecentWorkspaces(await api.listRecentWorkspaces());
      st.setPinnedWorkspaceRoot(await api.getPinnedWorkspace());
      st.setRecentWorlds(await api.listRecentWorlds());
      const version = await api.getContentVersion();
      if (version) st.setContentVersion(version);
      // Pull any launch-time update detection the push may have raced past.
      const pending = await api.getPendingUpdate();
      if (pending) st.setUpdate(pending);
    })();
  }, [openFile, openWorld, openAssembly, reimportWorld, close, newDoc, onWorkspaceChanged, exportActive, exportToWorldActive, exportToWorkspaceActive]);

  // Watch mode registration: main watches whichever structure file is on screen, so an
  // external edit (VS Code, an Axiom export, a build script) hot-reloads the viewer.
  useEffect(() => {
    let last: string | null | undefined;
    const send = () => {
      const doc = activeDocument(documentsStore.getState());
      const p = doc && doc.kind !== 'world' ? (doc.path ?? null) : null;
      if (p === last) return;
      last = p;
      void api.watchFile(p);
    };
    send();
    return documentsStore.subscribe(send);
  }, []);

  // Mirror file-open + window state to main (drives Close File, the export items'
  // enabled state, and the View menu). Only re-sends when the *reported* shape changes.
  useEffect(() => {
    const lastKey = { current: '' };
    const send = () => {
      const w = windowsStore.getState();
      const doc = activeDocument(documentsStore.getState());
      const open = doc?.structure != null;
      // Whether the open structure exceeds the configured Structure Block size
      // limit on any axis — gates File ▸ Export as Jigsaw (a within-limit build
      // has nothing to split; Export as NBT stays available regardless).
      const limit = effectiveNbtLimit(settingsStore.getState().nbtSizeLimit, store.getState().workspace?.minecraftVersion ?? null);
      const oversized = open && doc!.structure!.size.some((axis) => axis > limit);
      const hasJigsaw = open && doc!.structure!.jigsaws.length > 0;
      const hasVersions = (doc?.versions.length ?? 0) > 0;
      // A generated project (its own library folder) is renamable.
      const renamable = doc?.generated === true && doc.filePath != null;
      const report: WindowsReport = {
        controls: { visible: w.controls.visible, available: open },
        inspector: { visible: w.inspector.visible, available: open },
        jigsaw: { visible: w.jigsaw.visible, available: hasJigsaw },
        generate: { visible: w.generate.visible, available: true },
        versions: { visible: w.versions.visible, available: hasVersions },
        // The Console dock is always available (logs exist regardless of state).
        console: { visible: w.console.visible, available: true },
        // The left Project panel is always available (workspace + recents).
        project: { visible: w.projectVisible, available: true },
      };
      const key = JSON.stringify({ open, oversized, renamable, report });
      if (key === lastKey.current) return;
      lastKey.current = key;
      api.setFileOpen(open, oversized);
      api.setProjectOpen(renamable);
      api.reportWindows(report);
    };
    send();
    const u1 = windowsStore.subscribe(send);
    const u2 = documentsStore.subscribe(send);
    // The size-limit pref (Settings ▸ Viewer) and the workspace's MC version both
    // feed the `auto` limit, so a change to either can flip `oversized`.
    const u3 = settingsStore.subscribe(send);
    const u4 = store.subscribe(send);
    return () => {
      u1();
      u2();
      u3();
      u4();
    };
  }, []);
}
