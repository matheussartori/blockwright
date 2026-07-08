// "Reopen last session on launch" (Settings ▸ Files): continuously records the open
// tabs that live on disk (structure files + the world) to localStorage, and restores
// them once on startup when the setting is on. A file opened at launch (double-click /
// BW_OPEN) simply lands as one more tab — restore never blocks an explicit open.
import { useEffect } from 'react';
import { documentsStore } from '../state/documents';
import { settingsStore } from '../state/settings';

const STORAGE_KEY = 'blockwright.session';

interface SessionTab {
  kind: 'file' | 'world';
  path: string;
}

interface Flow {
  openFile: (path: string) => Promise<void>;
  openWorld: (root?: string) => Promise<void>;
}

export function useSessionRestore(flow: Flow): void {
  // Restore once, before the subscription below starts overwriting the record.
  useEffect(() => {
    if (!settingsStore.getState().reopenSession) return;
    let tabs: SessionTab[];
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      tabs = raw ? (JSON.parse(raw) as SessionTab[]) : [];
    } catch {
      tabs = [];
    }
    // Don't restore over tabs something else already opened (BW_OPEN beat us here).
    if (!tabs.length || documentsStore.getState().documents.length > 0) return;
    void (async () => {
      for (const tab of tabs) {
        if (tab.kind === 'world') await flow.openWorld(tab.path);
        else await flow.openFile(tab.path);
      }
    })();
    // Intentionally mount-only: `flow` handlers are stable by construction.
  }, []);

  // Record the session on every documents change (cheap: a handful of paths).
  useEffect(() => {
    const save = () => {
      const docs = documentsStore.getState().documents;
      const tabs: SessionTab[] = [];
      for (const d of docs) {
        if (d.kind === 'world' && d.worldMeta) tabs.push({ kind: 'world', path: d.worldMeta.root });
        // `filePath` is the file the tab was opened FROM (a generated build's scratch
        // versions don't restore — reopening those is the library's job).
        else if (d.filePath && !d.generated) tabs.push({ kind: 'file', path: d.filePath });
      }
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(tabs));
      } catch {
        /* storage unavailable */
      }
    };
    save();
    return documentsStore.subscribe(save);
  }, []);
}
