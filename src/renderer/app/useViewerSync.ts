// The reactive effects that drive the on-screen viewer from store state: follow the
// active tab, push persisted settings, and reflect the active doc's floor plan as
// highlighted bands. Each subscribes to the relevant store(s) and re-applies on
// change; all are gated on the viewer existing (it's created once, after mount).
import { useEffect } from 'react';
import { settingsStore } from '../state/settings';
import { documentsStore, activeDocument } from '../state/documents';
import { editorStore } from '../state/editor';
import { store } from '../state/store';
import { api } from '../api';
import type { Viewer } from '../viewer/viewer';

export function useViewerSync(viewer: Viewer | null): void {
  // The on-screen viewer follows the active tab: when the focused tab changes, show
  // its structure (re-framed) or clear the scene. Structure updates within the active
  // tab (loads, new versions) are shown by `load` itself, so this only reacts to the
  // active tab *identity* changing. Also runs once the viewer is ready, to flush a
  // file opened before mount (e.g. BW_OPEN at startup).
  useEffect(() => {
    if (!viewer) return;
    let lastId: string | null = null;
    const sync = () => {
      const doc = activeDocument(documentsStore.getState());
      const id = doc?.id ?? null;
      if (id === lastId) return;
      lastId = id;
      if (doc?.kind === 'world' && doc.worldMeta) {
        viewer.enterWorldMode(doc.worldMeta, api); // streams the world around the camera
        return;
      }
      if (viewer.worldActive) viewer.exitWorldMode();
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

  // Drive the floor-plan highlight from the active doc's floor plan. The plan is now
  // auto-detected on load (and editable for opened files), so the bands simply show
  // whenever floors are present — no visibility setting.
  useEffect(() => {
    if (!viewer) return;
    const apply = () => {
      const doc = activeDocument(documentsStore.getState());
      const floors = doc?.floors ?? [];
      viewer.setFloorRegions(floors.map((f) => ({ name: f.name, from: f.from, to: f.to })));
    };
    apply();
    const unsub = documentsStore.subscribe(apply);
    return () => unsub();
  }, [viewer]);

  // Mirror the structure-diff marks into the viewer, and INVALIDATE the diff when it no
  // longer describes what's on screen: the active tab changed, or the block editor went
  // live (each edit would silently drift the marks away from reality).
  useEffect(() => {
    if (!viewer) return;
    const apply = () => {
      const diff = store.getState().diff;
      const doc = activeDocument(documentsStore.getState());
      if (diff && doc?.id !== diff.docId) {
        store.getState().setDiff(null); // stale — computed against another tab
        return; // the store change re-invokes apply via subscribe
      }
      viewer.setDiff(diff ? diff.result.cells : []);
    };
    apply();
    const unsubStore = store.subscribe((s, prev) => {
      if (s.diff !== prev.diff) apply();
    });
    const unsubDocs = documentsStore.subscribe(apply);
    const unsubEditor = editorStore.subscribe((s, prev) => {
      if (s.active && !prev.active && store.getState().diff) store.getState().setDiff(null);
    });
    return () => {
      unsubStore();
      unsubDocs();
      unsubEditor();
      viewer.setDiff([]);
    };
  }, [viewer]);
}
