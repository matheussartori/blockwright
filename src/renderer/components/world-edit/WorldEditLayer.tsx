// The imperative bridge between IN-WORLD editing and the Three.js viewer — the world-mode
// sibling of editor/EditorLayer. While world-edit mode is on it: registers the pending-edits
// payload compositor on the streamed WorldView, re-meshes exactly the chunks each mutation
// touched, turns clicks/drags into paint/erase strokes (plane-locked like the structure
// editor) or box-select picks, previews the target cell, and runs the keyboard shortcuts.
// In fly mode every pick aims at the SCREEN CENTER (the pointer is locked, so client
// coordinates are stale) and a crosshair marks the aim — so you can fly between the two
// corner picks like placing blocks in the game. A committed selection shows draggable
// top/bottom height handles.
import { useEffect } from 'react';
import { useViewer } from '../../viewer/ViewerProvider';
import { useApp, useWorldEdit } from '../../hooks/useStores';
import { commitPlaceVia, worldEditStore, type WorldEditState } from '../../state/world-edit';
import { chunkKeyOf, compositePayload } from '../../world/edit-overlay';
import type { HeightHandle } from '../../viewer/region-overlay';
import { ACCENT, FOCUS, VOID_MARK } from '../../viewer/overlay-colors';

/** Pixels the pointer may travel between down and up and still count as a click. */
const CLICK_SLOP = 4;

const cellKey = (c: [number, number, number]): string => `${c[0]},${c[1]},${c[2]}`;

export function WorldEditLayer() {
  const viewer = useViewer();
  const active = useWorldEdit((s) => s.active);
  const tool = useWorldEdit((s) => s.tool);
  const anchor = useWorldEdit((s) => s.anchor);
  const selection = useWorldEdit((s) => s.selection);
  const magic = useWorldEdit((s) => s.magic);
  const place = useWorldEdit((s) => s.place);
  const navMode = useApp((s) => s.navMode);
  const placeData = place?.data ?? null;

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
      viewer.setWorldSelection(null);
      viewer.setWorldMagicCells(null);
      viewer.setPaintNav(false);
      viewer.domElement.style.cursor = '';
    };
  }, [viewer, active]);

  // Paint-nav: hand the left button to painting while a stroke tool is active.
  useEffect(() => {
    if (!viewer || !active) return;
    viewer.setPaintNav(tool === 'paint' || tool === 'erase');
    return () => viewer.setPaintNav(false);
  }, [viewer, active, tool]);

  // The selection region overlay: dashed while the second corner is aimed, solid + height
  // handles once committed. One region box, so size never matters.
  useEffect(() => {
    if (!viewer || !active) return;
    viewer.setWorldSelection(selection, anchor ? 'preview' : 'committed');
  }, [viewer, active, selection, anchor]);

  // The magic-select blob overlay follows the committed region.
  useEffect(() => {
    if (!viewer || !active) return;
    viewer.setWorldMagicCells(magic?.cells ?? null);
  }, [viewer, active, magic]);

  // The Place tool's ghost meshes: built once per picked structure, dropped with it.
  useEffect(() => {
    if (!viewer || !active) return;
    // Re-position once the async build lands (the anchor may already be aimed).
    void viewer.setWorldGhost(placeData).then(() => {
      const g = worldEditStore.getState().place;
      if (placeData && g?.anchor) viewer.placeWorldGhost(g.anchor, g.turns);
    });
    return () => void viewer.setWorldGhost(null);
  }, [viewer, active, placeData]);

  // Ghost transform follows every aim/nudge/rotate (cheap — no mesh rebuild).
  useEffect(() => {
    if (!viewer || !active || !place?.anchor) return;
    viewer.placeWorldGhost(place.anchor, place.turns);
  }, [viewer, active, place]);

  // Pointer + keyboard wiring.
  useEffect(() => {
    if (!viewer || !active) return;
    const canvas = viewer.domElement;
    const st = worldEditStore.getState;

    /** Where a pick aims: the pointer in orbit mode, the locked crosshair (screen center)
     *  in fly mode — pointer-locked client coordinates are frozen at the lock point. */
    const aimPoint = (e?: { clientX: number; clientY: number }): [number, number] => {
      if (!viewer.flying && e) return [e.clientX, e.clientY];
      const rect = canvas.getBoundingClientRect();
      return [rect.left + rect.width / 2, rect.top + rect.height / 2];
    };

    /** The cell the current tool would affect at a screen point (world coords). */
    const target = (s: WorldEditState, x: number, y: number): [number, number, number] | null => {
      const cell =
        s.tool === 'paint' && s.paintMode === 'brush' ? viewer.pickWorldPlacement(x, y) : viewer.pickWorldBlock(x, y);
      if (!cell) return null;
      // Edits only land on chunks we actually hold (the "editable radius = loaded chunks" rule).
      return viewer.worldChunkLoaded(Math.floor(cell[0] / 16), Math.floor(cell[2] / 16)) ? cell : null;
    };

    const hue = (s: WorldEditState): number => (s.tool === 'erase' ? VOID_MARK : s.paintMode === 'brush' ? ACCENT : FOCUS);

    /** Build-range clamp for height adjustments (from the chunk holding the box's min corner). */
    const yBounds = (): [number, number] | undefined => {
      const sel = st().selection;
      if (!sel) return undefined;
      return viewer.worldYRange(Math.floor(sel.min[0] / 16), Math.floor(sel.min[2] / 16)) ?? undefined;
    };

    let down: { x: number; y: number } | null = null;
    let painting = false;
    let lastPaint: string | null = null;
    let strokePlane: { axis: 0 | 1 | 2; coord: number } | null = null;
    /** Height-handle drag: which face, the box's center column, and the grab offset so the
     *  face follows the cursor without jumping by the handle's stand-off distance. */
    let heightDrag: { face: HeightHandle; x: number; z: number; offset: number } | null = null;
    let hoverHandle: HeightHandle | null = null;

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

    const setHandleHover = (face: HeightHandle | null): void => {
      if (face === hoverHandle) return;
      hoverHandle = face;
      viewer.setWorldSelectionHandleHover(face);
      canvas.style.cursor = face ? 'ns-resize' : '';
      // Steal the left button from orbit while over a handle, so the grab can't rotate.
      if (st().tool === 'select') viewer.setPaintNav(face !== null);
    };

    /** One aim update — hover preview, select rubber band, place ghost follow. Runs on
     *  pointermove (orbit) and every frame in fly mode (the camera moves without events). */
    const updateAim = (x: number, y: number): void => {
      const s = st();
      if (s.tool !== 'select') setHandleHover(null); // no stale resize cursor across tool switches
      if (s.tool === 'place') {
        // The ghost IS the preview: follow the aim until a click pins the anchor.
        if (s.place && !s.place.locked) {
          const cell = viewer.pickWorldPlacement(x, y);
          if (cell) s.aimPlace(cell, false);
        }
        return;
      }
      if (s.tool === 'select' && s.selectMode === 'magic') {
        viewer.setHover(viewer.pickWorldBlock(x, y), FOCUS);
        return;
      }
      if (s.tool === 'select') {
        // Height handles are grabbable only with a free cursor (orbit mode).
        if (!viewer.flying && s.selection && !s.anchor) {
          setHandleHover(viewer.pickWorldSelectionHandle(x, y));
          if (hoverHandle) {
            viewer.setHover(null);
            return;
          }
        } else {
          setHandleHover(null);
        }
        const cell = viewer.pickWorldBlock(x, y);
        if (s.anchor && cell) s.previewSelect(cell); // live rubber band to the aimed cell
        viewer.setHover(cell, FOCUS);
        return;
      }
      viewer.setHover(target(s, x, y), hue(s));
    };

    /** Commit the Place ghost with the viewer's chunk/texture services. */
    const commitPlace = () => void commitPlaceVia(viewer);

    const onDown = (e: PointerEvent) => {
      if (e.button !== 0) return;
      const s = st();
      if (s.tool === 'select' && hoverHandle && s.selection) {
        const sel = s.selection;
        const centerX = sel.min[0] + (sel.max[0] - sel.min[0] + 1) / 2;
        const centerZ = sel.min[2] + (sel.max[2] - sel.min[2] + 1) / 2;
        const grabY = viewer.pickYOnVerticalLine(e.clientX, e.clientY, centerX, centerZ);
        const planeY = hoverHandle === 'top' ? sel.max[1] + 1 : sel.min[1];
        heightDrag = { face: hoverHandle, x: centerX, z: centerZ, offset: grabY === null ? 0 : planeY - grabY };
        canvas.setPointerCapture(e.pointerId);
        return;
      }
      if (s.tool === 'paint' || s.tool === 'erase') {
        const [x, y] = aimPoint(e);
        const cell = target(s, x, y);
        painting = true;
        lastPaint = null;
        canvas.setPointerCapture(e.pointerId);
        strokePlane = cell ? planeFor(cell, x, y) : null;
        s.strokeBegin();
        if (s.tool === 'paint') {
          // Resolve the brush pattern once per stroke; textures preload so the composite is textured.
          void s.ensurePaintResolved().then((res) => {
            if (res) void viewer.ensureWorldTextures(res.flatMap((r) => r.textures)).then(() => {
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
      if (heightDrag) {
        const y = viewer.pickYOnVerticalLine(e.clientX, e.clientY, heightDrag.x, heightDrag.z);
        if (y !== null) {
          const plane = y + heightDrag.offset;
          // The top face sits at maxY+1, the bottom at minY — map the plane back to the cell.
          s.adjustSelectionY(heightDrag.face, heightDrag.face === 'top' ? Math.round(plane) - 1 : Math.round(plane), yBounds());
        }
        return;
      }
      if (painting) {
        const [x, y] = aimPoint(e);
        const cell = strokePlane
          ? viewer.pickOnPlane(x, y, strokePlane.axis, strokePlane.coord)
          : target(s, x, y);
        if (cell && cellKey(cell) !== lastPaint) paintAt(s, cell);
        return;
      }
      const [x, y] = aimPoint(e);
      updateAim(x, y);
    };

    const onUp = (e: PointerEvent) => {
      if (e.button !== 0) return;
      if (heightDrag) {
        heightDrag = null;
        if (canvas.hasPointerCapture(e.pointerId)) canvas.releasePointerCapture(e.pointerId);
        updateAim(...aimPoint(e)); // re-pick the handle under the released cursor
        return;
      }
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
      const [x, y] = aimPoint(e);
      if (s.tool === 'select') {
        const cell = viewer.pickWorldBlock(x, y);
        if (cell && s.selectMode === 'magic') s.magicPick(cell, (bx, by, bz) => viewer.worldBlockStateAt(bx, by, bz));
        else if (cell) s.pickSelect(cell);
      }
      if (s.tool === 'place' && s.place) {
        const cell = viewer.pickWorldPlacement(x, y);
        if (cell) s.aimPlace(cell, true); // a click pins (or re-pins) the anchor
      }
    };

    const onLeave = () => {
      viewer.setHover(null);
      setHandleHover(null);
    };

    // Fly mode has no cursor events for camera motion (WASD / mouse-look), so the aim —
    // hover cube, rubber band, ghost follow — tracks the crosshair every frame instead.
    let raf = 0;
    const tick = () => {
      raf = requestAnimationFrame(tick);
      if (!viewer.flying || painting) return;
      updateAim(...aimPoint());
    };
    raf = requestAnimationFrame(tick);

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
      if (s.tool === 'place' && s.place) {
        const nudges: Record<string, ['x' | 'y' | 'z', 1 | -1]> = {
          ArrowLeft: ['x', -1],
          ArrowRight: ['x', 1],
          ArrowUp: ['z', -1],
          ArrowDown: ['z', 1],
          PageUp: ['y', 1],
          PageDown: ['y', -1],
        };
        const nudge = nudges[e.key];
        if (nudge) {
          e.preventDefault();
          s.nudgePlace(nudge[0], nudge[1]);
          return;
        }
        if (e.key === 'r' || e.key === 'R') {
          e.preventDefault();
          s.rotatePlace(e.shiftKey ? -1 : 1);
          return;
        }
        if (e.key === 'Enter' && s.place.anchor) {
          e.preventDefault();
          commitPlace();
          return;
        }
        if (e.key === 'Escape') {
          s.cancelPlace();
          return;
        }
      }
      // Height nudges for a committed selection: PgUp/PgDn move the top, Shift moves the bottom.
      if (s.tool === 'select' && s.selection && !s.anchor && (e.key === 'PageUp' || e.key === 'PageDown')) {
        e.preventDefault();
        const dir = e.key === 'PageUp' ? 1 : -1;
        const face: HeightHandle = e.shiftKey ? 'bottom' : 'top';
        const current = face === 'top' ? s.selection.max[1] : s.selection.min[1];
        s.adjustSelectionY(face, current + dir, yBounds());
        return;
      }
      if (e.key === 'Escape') {
        if (s.anchor || s.selection || s.magic) s.clearSelection();
        return;
      }
      if ((e.key === 'Delete' || e.key === 'Backspace') && (s.selection || s.magic)) {
        e.preventDefault();
        if (s.magic) s.deleteMagic();
        else s.deleteSelection();
      }
    };

    canvas.addEventListener('pointerdown', onDown);
    canvas.addEventListener('pointermove', onMove);
    canvas.addEventListener('pointerup', onUp);
    canvas.addEventListener('pointerleave', onLeave);
    window.addEventListener('keydown', onKey);
    return () => {
      cancelAnimationFrame(raf);
      canvas.removeEventListener('pointerdown', onDown);
      canvas.removeEventListener('pointermove', onMove);
      canvas.removeEventListener('pointerup', onUp);
      canvas.removeEventListener('pointerleave', onLeave);
      window.removeEventListener('keydown', onKey);
      canvas.style.cursor = '';
    };
  }, [viewer, active]);

  // The fly-mode crosshair: marks where a click will land while the pointer is locked.
  if (!active || navMode !== 'fly') return null;
  return <div className="world-edit-crosshair" aria-hidden />;
}
