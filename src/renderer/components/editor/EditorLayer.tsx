// The imperative bridge between the block editor and the Three.js viewer (renders
// nothing). While edit mode is on it: turns a click on the canvas into a block pick
// (a drag still orbits — we only act on a click that didn't move), runs the keyboard
// shortcuts (nudge / delete / undo / redo / clear), mirrors the selection into the
// viewer's overlay, and re-shows the structure whenever an edit changes it.
import { useEffect } from 'react';
import { useViewer } from '../../viewer/ViewerProvider';
import { useEditor } from '../../hooks/useStores';
import { editorStore, type PickMode } from '../../state/editor';
import { documentsStore, activeDocument } from '../../state/documents';

/** Pixels the pointer may travel between down and up and still count as a click. */
const CLICK_SLOP = 4;

const NUDGE: Record<string, [number, number, number]> = {
  ArrowLeft: [-1, 0, 0],
  ArrowRight: [1, 0, 0],
  ArrowUp: [0, 0, -1],
  ArrowDown: [0, 0, 1],
  PageUp: [0, 1, 0],
  PageDown: [0, -1, 0],
};

export function EditorLayer() {
  const viewer = useViewer();
  const active = useEditor((s) => s.active);

  useEffect(() => {
    if (!viewer || !active) return;
    const canvas = viewer.domElement;

    // Click = pick a block; drag = orbit (handled by OrbitControls, we just bow out).
    let down: { x: number; y: number } | null = null;
    const onDown = (e: PointerEvent) => {
      if (e.button === 0) down = { x: e.clientX, y: e.clientY };
    };
    const onUp = (e: PointerEvent) => {
      if (e.button !== 0 || !down) return;
      const moved = Math.hypot(e.clientX - down.x, e.clientY - down.y);
      down = null;
      if (moved > CLICK_SLOP) return;
      const s = editorStore.getState();
      // Eyedropper: the next click samples the block's type instead of acting.
      if (s.eyedropper) {
        const cell = viewer.pickBlock(e.clientX, e.clientY);
        if (cell) s.sample(cell);
        return;
      }
      // Place drops a block against the clicked face; every other tool selects.
      if (s.tool === 'place') {
        const cell = viewer.pickPlacement(e.clientX, e.clientY);
        if (cell) void s.placeAt(cell);
        return;
      }
      const cell = viewer.pickBlock(e.clientX, e.clientY);
      const mode: PickMode = e.shiftKey ? 'box' : e.metaKey || e.ctrlKey ? 'add' : 'single';
      s.pick(cell, mode);
    };
    canvas.addEventListener('pointerdown', onDown);
    canvas.addEventListener('pointerup', onUp);

    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
      const s = editorStore.getState();
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        if (e.shiftKey) s.redo();
        else s.undo();
        return;
      }
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'y') {
        e.preventDefault();
        s.redo();
        return;
      }
      if (e.key === 'Escape') {
        s.clearSelection();
        return;
      }
      if (!s.selection.length) return;
      if (e.key === 'Delete' || e.key === 'Backspace') {
        e.preventDefault();
        s.remove();
        return;
      }
      const delta = NUDGE[e.key];
      if (delta) {
        e.preventDefault();
        s.move(delta);
      }
    };
    window.addEventListener('keydown', onKey);

    viewer.setSelection(editorStore.getState().selection);
    const unsubSel = editorStore.subscribe((s, prev) => {
      if (s.selection !== prev.selection) viewer.setSelection(s.selection);
    });

    // Re-show the viewer when an edit replaces the active doc's structure object.
    let last = activeDocument(documentsStore.getState())?.structure ?? null;
    const unsubDoc = documentsStore.subscribe(() => {
      const struct = activeDocument(documentsStore.getState())?.structure ?? null;
      if (struct && struct !== last) void viewer.show(struct, true);
      last = struct;
    });

    return () => {
      canvas.removeEventListener('pointerdown', onDown);
      canvas.removeEventListener('pointerup', onUp);
      window.removeEventListener('keydown', onKey);
      unsubSel();
      unsubDoc();
      viewer.setSelection([]);
    };
  }, [viewer, active]);

  return null;
}
