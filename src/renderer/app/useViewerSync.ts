// The reactive effects that drive the on-screen viewer from store state: follow the
// active tab, push persisted settings, and reflect the active doc's floor plan as
// highlighted bands. Each subscribes to the relevant store(s) and re-applies on
// change; all are gated on the viewer existing (it's created once, after mount).
import { useEffect } from 'react';
import { store } from '../state/store';
import { settingsStore } from '../state/settings';
import { documentsStore, activeDocument } from '../state/documents';
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

  // Drive the floor-plan highlight from the active doc's floor plan. Shown whenever
  // floors are defined; the "only while editing" setting scopes it to when the
  // Generate floors section is open (store.floorsEditing).
  useEffect(() => {
    if (!viewer) return;
    const apply = () => {
      const doc = activeDocument(documentsStore.getState());
      const floors = doc?.floors ?? [];
      const onlyEditing = settingsStore.getState().floorsOnlyWhenEditing;
      const show = floors.length > 0 && (!onlyEditing || store.getState().floorsEditing);
      viewer.setFloorRegions(
        show ? floors.map((f) => ({ name: f.name, from: f.from, to: f.to })) : [],
      );
    };
    apply();
    const subs = [
      documentsStore.subscribe(apply),
      settingsStore.subscribe(apply),
      store.subscribe(apply),
    ];
    return () => subs.forEach((u) => u());
  }, [viewer]);
}
