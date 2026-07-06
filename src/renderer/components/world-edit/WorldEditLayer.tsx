// The imperative bridge between IN-WORLD editing and the Three.js viewer (renders nothing) —
// the world-mode sibling of editor/EditorLayer. While world-edit mode is on it: registers the
// pending-edits payload compositor on the streamed WorldView, re-meshes exactly the chunks each
// mutation touched, turns clicks/drags into paint/erase strokes (plane-locked like the structure
// editor) or box-select picks, previews the target cell, and runs the keyboard shortcuts.
import { useEffect } from 'react';
import { useViewer } from '../../viewer/ViewerProvider';
import { useWorldEdit } from '../../hooks/useStores';
import { worldEditStore, type WorldEditState } from '../../state/world-edit';
import { chunkKeyOf, compositePayload } from '../../world/edit-overlay';
import { ACCENT, FOCUS, VOID_MARK } from '../../viewer/overlay-colors';

/** Pixels the pointer may travel between down and up and still count as a click. */
const CLICK_SLOP = 4;

const cellKey = (c: [number, number, number]): string => `${c[0]},${c[1]},${c[2]}`;

/** The cells along the 12 edges of an inclusive box — a wireframe impression for the selection
 *  overlay that stays cheap no matter how big the box is. */
function edgeCells(min: [number, number, number], max: [number, number, number]): string[] {
  const out = new Set<string>();
  const xs = [min[0], max[0]];
  const ys = [min[1], max[1]];
  const zs = [min[2], max[2]];
  for (const y of ys) for (const z of zs) for (let x = min[0]; x <= max[0]; x++) out.add(`${x},${y},${z}`);
  for (const x of xs) for (const z of zs) for (let y = min[1]; y <= max[1]; y++) out.add(`${x},${y},${z}`);
  for (const x of xs) for (const y of ys) for (let z = min[2]; z <= max[2]; z++) out.add(`${x},${y},${z}`);
  return [...out];
}

export function WorldEditLayer() {
  const viewer = useViewer();
  const active = useWorldEdit((s) => s.active);
  const tool = useWorldEdit((s) => s.tool);
  const selection = useWorldEdit((s) => s.selection);

  // The pending-edit compositor + the per-mutation re-mesh, live for the whole edit session.
  useEffect(() => {
    if (!viewer || !active) return;
    viewer.setWorldEditOverlay((payload) => {
      const s = worldEditStore.getState();
      if (!s.pendingCount) return payload;
      const prefix = `${payload.cx},${payload.cz}`;
      const edits = Object.values(s.pending).filter((e) => chunkKeyOf(e.x, e.z) === prefix);
      return compositePayload(payload, edits, s.resolved);
    });
    const unsub = worldEditStore.subscribe((s, prev) => {
      if (s.lastTouched !== prev.lastTouched && s.lastTouched.length) {
        viewer.remeshWorldChunks(s.lastTouched);
      }
      // After a successful save the committed chunks must come back from disk, not the overlay.
      if (s.lastReport && s.lastReport !== prev.lastReport) {
        viewer.invalidateWorldChunks(s.lastReport.editedChunks.map((c) => `${c.cx},${c.cz}`));
      }
    });
    return () => {
      unsub();
      viewer.setWorldEditOverlay(null);
      // Drop any still-composited edits from the meshes (exit()/discard() already set lastTouched,
      // but a hard unmount mid-session must clean up too).
      const s = worldEditStore.getState();
      const touched = new Set<string>();
      for (const e of Object.values(s.pending)) touched.add(chunkKeyOf(e.x, e.z));
      if (touched.size) viewer.remeshWorldChunks([...touched]);
      viewer.setHover(null);
      viewer.setSelection([]);
      viewer.setPaintNav(false);
    };
  }, [viewer, active]);

  // Paint-nav: hand the left button to painting while a stroke tool is active.
  useEffect(() => {
    if (!viewer || !active) return;
    viewer.setPaintNav(tool === 'paint' || tool === 'erase');
    return () => viewer.setPaintNav(false);
  }, [viewer, active, tool]);

  // Selection wireframe (cheap edge cells — a huge box never floods the overlay).
  useEffect(() => {
    if (!viewer || !active) return;
    viewer.setSelection(selection ? edgeCells(selection.min, selection.max) : []);
  }, [viewer, active, selection]);

  // Pointer + keyboard wiring.
  useEffect(() => {
    if (!viewer || !active) return;
    const canvas = viewer.domElement;
    const st = worldEditStore.getState;

    /** The cell the current tool would affect at a screen point (world coords). */
    const target = (s: WorldEditState, x: number, y: number): [number, number, number] | null => {
      const cell =
        s.tool === 'paint' && s.paintMode === 'brush' ? viewer.pickWorldPlacement(x, y) : viewer.pickWorldBlock(x, y);
      if (!cell) return null;
      // Edits only land on chunks we actually hold (the "editable radius = loaded chunks" rule).
      return viewer.worldChunkLoaded(Math.floor(cell[0] / 16), Math.floor(cell[2] / 16)) ? cell : null;
    };

    const hue = (s: WorldEditState): number => (s.tool === 'erase' ? VOID_MARK : s.paintMode === 'brush' ? ACCENT : FOCUS);

    let down: { x: number; y: number } | null = null;
    let painting = false;
    let lastPaint: string | null = null;
    let strokePlane: { axis: 0 | 1 | 2; coord: number } | null = null;

    /** Plane lock from the clicked face (axis where solid + placement cells differ). */
    const planeFor = (cell: [number, number, number], x: number, y: number): { axis: 0 | 1 | 2; coord: number } | null => {
      const solid = viewer.pickWorldBlock(x, y);
      const front = viewer.pickWorldPlacement(x, y);
      if (!solid || !front) return null;
      for (const axis of [0, 1, 2] as const) {
        if (solid[axis] !== front[axis]) return { axis, coord: cell[axis] };
      }
      return null;
    };

    const paintAt = (s: WorldEditState, cell: [number, number, number]): void => {
      if (s.tool === 'erase') s.eraseCell(cell);
      else s.paintCell(cell);
      lastPaint = cellKey(cell);
    };

    const onDown = (e: PointerEvent) => {
      if (e.button !== 0) return;
      const s = st();
      if (s.tool === 'paint' || s.tool === 'erase') {
        const cell = target(s, e.clientX, e.clientY);
        painting = true;
        lastPaint = null;
        canvas.setPointerCapture(e.pointerId);
        strokePlane = cell ? planeFor(cell, e.clientX, e.clientY) : null;
        s.strokeBegin();
        if (s.tool === 'paint') {
          // Resolve the brush block once per stroke; textures preload so the composite is textured.
          void s.ensurePaintResolved().then((res) => {
            if (res) void viewer.ensureWorldTextures(res.textures).then(() => {
              if (cell) paintAt(st(), cell);
            });
          });
        } else if (cell) {
          paintAt(s, cell);
        }
        return;
      }
      down = { x: e.clientX, y: e.clientY };
    };

    const onMove = (e: PointerEvent) => {
      const s = st();
      if (painting) {
        const cell = strokePlane
          ? viewer.pickOnPlane(e.clientX, e.clientY, strokePlane.axis, strokePlane.coord)
          : target(s, e.clientX, e.clientY);
        if (cell && cellKey(cell) !== lastPaint) paintAt(s, cell);
        return;
      }
      if (s.tool === 'paint' || s.tool === 'erase') viewer.setHover(target(s, e.clientX, e.clientY), hue(s));
      else viewer.setHover(viewer.pickWorldBlock(e.clientX, e.clientY), FOCUS);
    };

    const onUp = (e: PointerEvent) => {
      if (e.button !== 0) return;
      if (painting) {
        painting = false;
        lastPaint = null;
        strokePlane = null;
        if (canvas.hasPointerCapture(e.pointerId)) canvas.releasePointerCapture(e.pointerId);
        return;
      }
      if (!down) return;
      const moved = Math.hypot(e.clientX - down.x, e.clientY - down.y);
      down = null;
      if (moved > CLICK_SLOP) return; // a drag orbited
      const s = st();
      if (s.tool === 'select') {
        const cell = viewer.pickWorldBlock(e.clientX, e.clientY);
        if (cell) s.pickSelect(cell);
      }
    };

    const onLeave = () => viewer.setHover(null);

    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable)) return;
      const s = st();
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        if (e.shiftKey) s.redo();
        else s.undo();
        return;
      }
      if (e.key === 'Escape') {
        if (s.anchor || s.selection) s.clearSelection();
        return;
      }
      if ((e.key === 'Delete' || e.key === 'Backspace') && s.selection) {
        e.preventDefault();
        s.deleteSelection();
      }
    };

    canvas.addEventListener('pointerdown', onDown);
    canvas.addEventListener('pointermove', onMove);
    canvas.addEventListener('pointerup', onUp);
    canvas.addEventListener('pointerleave', onLeave);
    window.addEventListener('keydown', onKey);
    return () => {
      canvas.removeEventListener('pointerdown', onDown);
      canvas.removeEventListener('pointermove', onMove);
      canvas.removeEventListener('pointerup', onUp);
      canvas.removeEventListener('pointerleave', onLeave);
      window.removeEventListener('keydown', onKey);
    };
  }, [viewer, active]);

  return null;
}
