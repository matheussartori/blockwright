// The imperative bridge between the block editor and the Three.js viewer (renders nothing).
// While edit mode is on it: turns clicks/drags on the canvas into edits (a Paint/Void drag
// paints a stroke; every other tool selects on a click — a drag still orbits), previews the
// target cell under the cursor, runs the keyboard shortcuts, mirrors the selection + symmetry
// plane + void markers into the viewer, and re-shows the structure whenever an edit changes it.
import { useEffect } from 'react';
import { useViewer } from '../../viewer/ViewerProvider';
import { useEditor } from '../../hooks/useStores';
import { editorStore, TOOL_ORDER, type EditorState, type PickMode } from '../../state/editor';
import { cellKey, describeCell, inBounds, voidMarkers } from '../../editor/ops';
import { documentsStore, activeDocument } from '../../state/documents';
import { ACCENT, FOCUS, AIR_MARK, VOID_MARK } from '../../viewer/overlay-colors';

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

/** Tools whose left-drag paints a coalesced stroke (Paint's brush/recolor + Void). Fill is a
 *  one-shot click, so it's excluded. */
const isStrokeTool = (s: EditorState): boolean =>
  s.tool === 'void' || (s.tool === 'paint' && s.paintMode !== 'fill');

/** Tools with a block field an Alt+click can sample into (the always-available eyedropper). */
const isPaintFamily = (s: EditorState): boolean =>
  s.tool === 'paint' || s.tool === 'replace' || s.tool === 'stairs';

export function EditorLayer() {
  const viewer = useViewer();
  const active = useEditor((s) => s.active);

  useEffect(() => {
    if (!viewer || !active) return;
    const canvas = viewer.domElement;

    // The cell the active Paint/Void tool targets at a screen point: brush + void aim at the
    // empty cell in front of a surface, recolor/fill at the solid block under the cursor. The
    // brush/void cell can fall OUTSIDE the structure (clicking a side face aims into the empty
    // space beside it) — editing is locked to the NBT's volume, so reject it here too, so no
    // ghost preview promises a placement the file can't hold.
    // Reject a cell outside the NBT's volume (editing is locked to `size`).
    const inVolume = (cell: [number, number, number] | null): [number, number, number] | null => {
      if (!cell) return null;
      const size = activeDocument(documentsStore.getState())?.structure?.size;
      return size && !inBounds(cell, size) ? null : cell;
    };

    const target = (s: EditorState, x: number, y: number): [number, number, number] | null =>
      inVolume(
        s.tool === 'void'
          ? viewer.pickPlacementAt(x, y, s.paintDepth)
          : s.tool === 'paint' && s.paintMode === 'brush'
            ? viewer.pickPlacement(x, y)
            : viewer.pickBlock(x, y),
      );

    // The hover-preview hue: what the next edit will do at the cursor.
    const hue = (s: EditorState): number => {
      if (s.tool === 'paint') return s.paintMode === 'brush' ? ACCENT : FOCUS;
      return s.voidKind === 'air' ? AIR_MARK : VOID_MARK;
    };

    // Click = pick/act; a Paint/Void drag paints. Track the down point for click detection
    // and the in-progress stroke separately. `beginPending` guards the async brush-block
    // resolve: a FAST click can release before it lands, so the first cell is painted (and the
    // stroke ended) from the resolve callback — never dropped because the mouse already lifted.
    let down: { x: number; y: number } | null = null;
    let painting = false;
    let beginPending = false;
    let lastPaint: string | null = null;
    let lastHover: string | null = null; // throttle the cursor readout to cell changes
    let lastPos: { x: number; y: number } | null = null; // for re-aiming after a depth step

    // Identify the cell under the cursor and feed the panel readout (what's actually there).
    // With the Void tool aimed DEEPER than the surface, the readout describes the depth-stepped
    // TARGET cell (the one an edit would hit), not the surface under the cursor.
    const reportHover = (x: number, y: number) => {
      const s = editorStore.getState();
      const id = s.tool === 'void' && s.paintDepth > 0 ? target(s, x, y) : viewer.identifyCell(x, y);
      const key = id ? cellKey(id) : null;
      if (key === lastHover) return;
      lastHover = key;
      const struct = activeDocument(documentsStore.getState())?.structure ?? null;
      editorStore.getState().setHoverInfo(id && struct ? { key: cellKey(id), content: describeCell(struct, id) } : null);
    };
    const clearHover = () => {
      lastHover = null;
      editorStore.getState().setHoverInfo(null);
    };

    // The plane a stroke is LOCKED to (the MagicaVoxel/Axiom convention): set from the
    // clicked face's normal at stroke start, cleared on release. While locked, the drag aims
    // at ray∩plane instead of re-picking the surface — no mid-stroke depth jumps, and the
    // stroke can bridge gaps (extend a wall across a window hole).
    let strokePlane: { axis: 0 | 1 | 2; coord: number } | null = null;

    /** The locked plane for a stroke starting at `cell`: the axis where the placement cell
     *  and the solid cell under the same point differ is the clicked face's normal. */
    const planeFor = (s: EditorState, cell: [number, number, number], x: number, y: number): { axis: 0 | 1 | 2; coord: number } | null => {
      const solidCell = viewer.pickBlock(x, y);
      const frontCell = viewer.pickPlacement(x, y);
      if (!solidCell || !frontCell) return null;
      for (const axis of [0, 1, 2] as const) {
        if (solidCell[axis] !== frontCell[axis]) return { axis, coord: cell[axis] };
      }
      return null;
    };

    const onDown = (e: PointerEvent) => {
      if (e.button !== 0) return;
      const s = editorStore.getState();
      // Alt+click = sample (the always-available eyedropper), even on a stroke tool — it
      // must not start a stroke, so route it through the click path.
      if (isStrokeTool(s) && !s.eyedropper && !e.altKey) {
        painting = true;
        beginPending = true;
        lastPaint = null;
        clearHover(); // the preview/readout belongs to hovering, not an active stroke
        canvas.setPointerCapture(e.pointerId);
        const cell = target(s, e.clientX, e.clientY);
        strokePlane = cell ? planeFor(s, cell, e.clientX, e.clientY) : null;
        // strokeBegin resets the undo-coalescing synchronously and resolves the brush block
        // (Void resolves immediately). Paint the first cell once it's ready, regardless of
        // whether the pointer is still down — then finalize if the click already ended.
        void s.strokeBegin().then(() => {
          beginPending = false;
          if (cell) {
            s.strokePaint(cell);
            lastPaint = cellKey(cell);
          }
          if (!painting) s.strokeEnd(); // a quick click lifted before the resolve landed
        });
        return;
      }
      down = { x: e.clientX, y: e.clientY };
    };

    const onMove = (e: PointerEvent) => {
      const s = editorStore.getState();
      lastPos = { x: e.clientX, y: e.clientY };
      if (painting) {
        // A locked stroke follows its start plane; otherwise re-pick the surface. Either
        // way editing stays inside the NBT volume.
        const cell = strokePlane
          ? inVolume(viewer.pickOnPlane(e.clientX, e.clientY, strokePlane.axis, strokePlane.coord))
          : target(s, e.clientX, e.clientY);
        if (cell && cellKey(cell) !== lastPaint) {
          s.strokePaint(cell);
          lastPaint = cellKey(cell);
        }
        return;
      }
      // Hover preview + cursor readout (the tools that place into a cell — "where will it land,
      // and what's there now?").
      if (s.tool === 'paint' || s.tool === 'void') {
        viewer.setHover(target(s, e.clientX, e.clientY), hue(s));
        reportHover(e.clientX, e.clientY);
      } else {
        viewer.setHover(null);
        if (lastHover !== null) clearHover();
      }
    };

    const onUp = (e: PointerEvent) => {
      if (e.button !== 0) return;
      if (painting) {
        painting = false;
        lastPaint = null;
        strokePlane = null;
        if (canvas.hasPointerCapture(e.pointerId)) canvas.releasePointerCapture(e.pointerId);
        // If the resolve is still pending, its callback paints the first cell and ends the
        // stroke (ending here would null the stroke before that paint lands).
        if (!beginPending) editorStore.getState().strokeEnd();
        return;
      }
      if (!down) return;
      const moved = Math.hypot(e.clientX - down.x, e.clientY - down.y);
      down = null;
      if (moved > CLICK_SLOP) return; // a drag orbited
      const s = editorStore.getState();
      // Eyedropper: the next click samples the block's type instead of acting. Alt+click is
      // the modifier form — always live on the tools with a block field (paint/replace/stairs).
      if (s.eyedropper || (e.altKey && isPaintFamily(s))) {
        const cell = viewer.pickBlock(e.clientX, e.clientY);
        if (cell) s.sample(cell);
        return;
      }
      // Fill is a single-click flood from the clicked block.
      if (s.tool === 'paint' && s.paintMode === 'fill') {
        const cell = viewer.pickBlock(e.clientX, e.clientY);
        if (cell) void s.fillAt(cell);
        return;
      }
      const cell = viewer.pickBlock(e.clientX, e.clientY);
      const mode: PickMode = e.shiftKey ? 'box' : e.metaKey || e.ctrlKey ? 'add' : 'single';
      s.pick(cell, mode);
    };

    const onLeave = () => {
      if (!painting) {
        viewer.setHover(null);
        clearHover();
      }
    };

    // Alt+scroll steps the Void tool's target DEEPER along the aim ray (plain scroll keeps
    // zooming the camera). Capture-phase so OrbitControls never sees the depth scroll.
    const onWheel = (e: WheelEvent) => {
      const s = editorStore.getState();
      if (!e.altKey || s.tool !== 'void') return;
      e.preventDefault();
      e.stopPropagation();
      s.setPaintDepth(s.paintDepth + (e.deltaY > 0 ? 1 : -1));
      if (lastPos) {
        const next = editorStore.getState();
        viewer.setHover(target(next, lastPos.x, lastPos.y), hue(next));
        lastHover = null; // force the readout to refresh for the new depth
        reportHover(lastPos.x, lastPos.y);
      }
    };

    canvas.addEventListener('pointerdown', onDown);
    canvas.addEventListener('pointermove', onMove);
    canvas.addEventListener('pointerup', onUp);
    canvas.addEventListener('pointerleave', onLeave);
    canvas.addEventListener('wheel', onWheel, { capture: true, passive: false });

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
      // Escape walks back one layer at a time: cancel the eyedropper → return to Select →
      // clear the selection. Esc "always gets you back to a neutral state".
      if (e.key === 'Escape') {
        if (s.eyedropper) s.setEyedropper(false);
        else if (s.tool !== 'select') s.setTool('select');
        else s.clearSelection();
        return;
      }
      // Number keys switch tools, matching the rail's order (1 = Select … 9 = Delete).
      if (!e.metaKey && !e.ctrlKey && !e.altKey && e.key >= '1' && e.key <= '9') {
        const next = TOOL_ORDER[Number(e.key) - 1];
        if (next) {
          e.preventDefault();
          s.setTool(next);
          return;
        }
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

    // Mirror the live-symmetry plane into the viewer from the editor mode + the doc's size.
    const applySymmetry = () => {
      const sym = editorStore.getState().symmetry;
      const struct = activeDocument(documentsStore.getState())?.structure;
      viewer.setSymmetryPlane(sym === 'none' || !struct ? null : sym, struct?.size ?? [0, 0, 0]);
    };
    // Mirror the explicit air/void cells into the viewer when "show voids" is on.
    // The eye explicitly promises "air / void", so turning it on reveals ALL boundary air too
    // (not just void) — regardless of the active tool — AND the interior layers of stacked
    // regions (`revealAll`, drawn dimmed), so a multi-layer void slab shows every layer. With
    // it off, no overlay; with it on and a bulk-air capture, the user opted in.
    const applyVoids = () => {
      const s = editorStore.getState();
      const struct = activeDocument(documentsStore.getState())?.structure ?? null;
      viewer.setVoids(s.showVoids && struct ? voidMarkers(struct, s.showVoids, s.showVoids) : []);
    };
    // Hand the LEFT button to painting while a Paint/Void tool is active (orbit → RIGHT button).
    const applyPaintNav = () => {
      const tool = editorStore.getState().tool;
      viewer.setPaintNav(tool === 'paint' || tool === 'void');
    };

    viewer.setSelection(editorStore.getState().selection);
    applySymmetry();
    applyVoids();
    applyPaintNav();
    const unsubSel = editorStore.subscribe((s, prev) => {
      if (s.selection !== prev.selection) viewer.setSelection(s.selection);
      if (s.symmetry !== prev.symmetry) applySymmetry();
      if (s.showVoids !== prev.showVoids) applyVoids();
      if (s.tool !== prev.tool) {
        applyPaintNav();
        viewer.setHover(null); // a tool switch invalidates the old preview + readout
        clearHover();
      }
    });

    // Re-show the viewer when an edit replaces the active doc's structure object. A paint DRAG
    // patches the structure once per cell, so a naive re-show would rebuild the mesh dozens of
    // times a second — instead coalesce to at most ONE rebuild per frame (and never overlap an
    // in-flight async show). `show` clears the overlays, so re-apply them after it.
    let last = activeDocument(documentsStore.getState())?.structure ?? null;
    let raf = 0;
    let showing = false;
    const flush = () => {
      raf = 0;
      const struct = activeDocument(documentsStore.getState())?.structure ?? null;
      if (showing || !struct || struct === last) return;
      last = struct;
      showing = true;
      void viewer.show(struct, true).then(() => {
        showing = false;
        viewer.setSelection(editorStore.getState().selection);
        applySymmetry();
        applyVoids();
        // A change may have landed mid-show — schedule another pass to catch up.
        const latest = activeDocument(documentsStore.getState())?.structure ?? null;
        if (latest && latest !== last && !raf) raf = requestAnimationFrame(flush);
      });
    };
    const unsubDoc = documentsStore.subscribe(() => {
      const struct = activeDocument(documentsStore.getState())?.structure ?? null;
      if (struct && struct !== last && !raf && !showing) raf = requestAnimationFrame(flush);
    });

    return () => {
      canvas.removeEventListener('pointerdown', onDown);
      canvas.removeEventListener('pointermove', onMove);
      canvas.removeEventListener('pointerup', onUp);
      canvas.removeEventListener('pointerleave', onLeave);
      canvas.removeEventListener('wheel', onWheel, { capture: true });
      window.removeEventListener('keydown', onKey);
      if (raf) cancelAnimationFrame(raf);
      unsubSel();
      unsubDoc();
      viewer.setSelection([]);
      viewer.setSymmetryPlane(null, [0, 0, 0]);
      viewer.setVoids([]);
      viewer.setHover(null);
      viewer.setPaintNav(false);
      clearHover();
    };
  }, [viewer, active]);

  return null;
}
