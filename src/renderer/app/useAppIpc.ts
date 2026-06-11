// Renderer↔main plumbing: the one-time IPC wiring (native menu / file-open / drop /
// workspace listeners + the initial state loads), and the file-open + window-state
// report back to main that keeps the View menu's checkmarks and Close File in sync.
import { useEffect } from 'react';
import type { WindowsReport } from '@/shared/types';
import { api } from '../api';
import { store } from '../state/store';
import { windowsStore } from '../state/windows';
import { documentsStore, activeDocument } from '../state/documents';
import type { DocumentFlow } from './useDocumentFlow';

/** The document handlers the IPC listeners dispatch to. */
type IpcHandlers = Pick<DocumentFlow, 'openFile' | 'close' | 'newDoc' | 'exportActive' | 'onWorkspaceChanged'>;

export function useAppIpc({ openFile, close, newDoc, exportActive, onWorkspaceChanged }: IpcHandlers): void {
  // One-time IPC wiring + initial loads.
  useEffect(() => {
    const st = store.getState();
    api.onOpenPath((p) => void openFile(p));
    api.onFileDrop((p) => void openFile(p));
    api.onCloseStructure(() => close());
    api.onOpenSettings((section) => {
      if (section) st.setSettingsSection(section);
      st.setSettingsOpen(true);
    });
    api.onNewStructure(() => newDoc());
    api.onExportFile(() => void exportActive());
    api.onOpenCatalog(() => st.setCatalogOpen(true));
    api.onOpenModules(() => st.setModulesOpen(true));
    api.onOpenGuide(() => st.setGuideOpen(true));
    api.onRecentsChanged((paths) => st.setRecents(paths));
    api.onRecentWorkspacesChanged((list) => st.setRecentWorkspaces(list));
    api.onWorkspaceChanged((ws) => void onWorkspaceChanged(ws));
    api.onToggleWindow((id) => {
      const w = windowsStore.getState();
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
      const version = await api.getContentVersion();
      if (version) st.setContentVersion(version);
    })();
  }, [openFile, close, newDoc, onWorkspaceChanged, exportActive]);

  // Mirror file-open + window state to main (drives Close File and the View menu).
  // Only re-sends when the *reported* shape changes.
  useEffect(() => {
    const lastKey = { current: '' };
    const send = () => {
      const w = windowsStore.getState();
      const doc = activeDocument(documentsStore.getState());
      const open = doc?.structure != null;
      const hasJigsaw = open && doc!.structure!.jigsaws.length > 0;
      const hasVersions = (doc?.versions.length ?? 0) > 0;
      const report: WindowsReport = {
        controls: { visible: w.controls.visible, available: open },
        inspector: { visible: w.inspector.visible, available: open },
        jigsaw: { visible: w.jigsaw.visible, available: hasJigsaw },
        generate: { visible: w.generate.visible, available: true },
        versions: { visible: w.versions.visible, available: hasVersions },
        // The Console dock is always available (logs exist regardless of state).
        console: { visible: w.console.visible, available: true },
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
}
