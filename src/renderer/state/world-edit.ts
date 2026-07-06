// In-world editing state: the pending-edit overlay (local until "Save to World"), the v1 tool
// set (paint brush/recolor, erase, box select + fill/delete), undo/redo over the pending map,
// and the save flow through the main-process safe write path. Parallel to `editor.ts` (the
// structure block editor) but deliberately its own store: edits here are per-cell records over
// an unbounded streamed world, not ops over a bounded StructureData.
import { createStore } from 'zustand/vanilla';
import type { DimensionId, WorldEditApplyResult } from '@/shared/types';
import { api } from '../api';
import {
  AIR,
  cellKeyOf,
  chunkKeyOf,
  stateKeyOf,
  type PendingWorldEdit,
  type ResolvedWorldBlock,
} from '../world/edit-overlay';

export type WorldTool = 'paint' | 'erase' | 'select';
export type WorldPaintMode = 'brush' | 'recolor';

/** Hard cap on a box-selection's volume — a runaway fill would freeze the mesher and produce a
 *  save nobody wants (65 536 = a 64×16×64 slab). */
export const WORLD_SELECTION_CAP = 65536;

/** Undo history depth (snapshots of the pending map — records, so shallow copies are cheap). */
const HISTORY_CAP = 60;

type PendingMap = Record<string, PendingWorldEdit>;

export interface WorldEditState {
  /** Edit mode live (a session is open in main and the overlay is composited). */
  active: boolean;
  /** Session opening in flight (the Edit toggle shows a busy state). */
  opening: boolean;
  /** Whether the OS lock is a REAL exclusivity guarantee (false on macOS/Linux → caution note). */
  lockExclusive: boolean;
  dim: DimensionId | null;
  tool: WorldTool;
  paintMode: WorldPaintMode;
  /** Block id painted by the brush (default state; properties come later). */
  paintBlock: string;
  /** Pending edits, keyed `"x,y,z"` — the overlay compositor + the save payload. */
  pending: PendingMap;
  pendingCount: number;
  /** Renderable palette entries per state key (resolved once, reused by the compositor). */
  resolved: Record<string, ResolvedWorldBlock>;
  /** Box-select state: the first corner, and the committed box (both inclusive). */
  anchor: [number, number, number] | null;
  selection: { min: [number, number, number]; max: [number, number, number] } | null;
  /** Chunk keys whose composite changed in the LAST mutation — the layer re-meshes exactly these. */
  lastTouched: string[];
  past: PendingMap[];
  future: PendingMap[];
  saving: boolean;
  saveOpen: boolean;
  lastReport: WorldEditApplyResult | null;
  error: string | null;

  enter(dim: DimensionId): Promise<boolean>;
  exit(): Promise<void>;
  setTool(tool: WorldTool): void;
  setPaintMode(mode: WorldPaintMode): void;
  setPaintBlock(id: string): void;
  /** Resolve the current paint block to a renderable entry (cached). Null on failure. */
  ensurePaintResolved(): Promise<ResolvedWorldBlock | null>;
  /** Snapshot for undo — one per stroke/batch, so a drag coalesces into one step. */
  strokeBegin(): void;
  /** Place the paint block (brush/recolor target cell already picked by the layer). */
  paintCell(cell: [number, number, number]): void;
  /** Place air (erase) at a solid cell. */
  eraseCell(cell: [number, number, number]): void;
  /** Box-select: first pick anchors, second commits the box, a third re-anchors. */
  pickSelect(cell: [number, number, number]): void;
  clearSelection(): void;
  /** Fill the committed selection with the paint block (volume-capped). */
  fillSelection(): Promise<void>;
  /** Fill the committed selection with air. */
  deleteSelection(): void;
  undo(): void;
  redo(): void;
  /** Drop every pending edit (and its history). */
  discard(): void;
  setSaveOpen(open: boolean): void;
  /** Commit the pending edits through the safe write path. Returns the report (also stored). */
  save(retention: number): Promise<WorldEditApplyResult | null>;
  clearError(): void;
}

/** All chunk keys covered by a set of cell keys. */
function chunksOf(cells: Iterable<string>): string[] {
  const out = new Set<string>();
  for (const key of cells) {
    const [x, , z] = key.split(',').map(Number);
    out.add(chunkKeyOf(x, z));
  }
  return [...out];
}

/** Chunk keys whose cells DIFFER between two pending maps (undo/redo remesh set). */
function changedChunks(a: PendingMap, b: PendingMap): string[] {
  const keys = new Set<string>();
  for (const k of Object.keys(a)) if (a[k] !== b[k]) keys.add(k);
  for (const k of Object.keys(b)) if (a[k] !== b[k]) keys.add(k);
  return chunksOf(keys);
}

export const worldEditStore = createStore<WorldEditState>((set, get) => {
  /** Write one edit into the CURRENT pending map (mutated in place — `strokeBegin` cloned it),
   *  notifying subscribers via `lastTouched`/`pendingCount`. */
  const putEdit = (edit: PendingWorldEdit): void => {
    const s = get();
    s.pending[cellKeyOf(edit.x, edit.y, edit.z)] = edit;
    set({
      pendingCount: Object.keys(s.pending).length,
      lastTouched: [chunkKeyOf(edit.x, edit.z)],
      future: [],
    });
  };

  /** Fill the committed selection box with `name` as ONE undo step (volume-capped). */
  const fillBox = (name: string): void => {
    const s = get();
    const sel = s.selection;
    if (!sel) return;
    const [x0, y0, z0] = sel.min;
    const [x1, y1, z1] = sel.max;
    const volume = (x1 - x0 + 1) * (y1 - y0 + 1) * (z1 - z0 + 1);
    if (volume > WORLD_SELECTION_CAP) {
      set({ error: `selection too large (${volume.toLocaleString()} blocks — cap ${WORLD_SELECTION_CAP.toLocaleString()})` });
      return;
    }
    s.strokeBegin();
    const pending = get().pending;
    const touched = new Set<string>();
    for (let y = y0; y <= y1; y++) {
      for (let z = z0; z <= z1; z++) {
        for (let x = x0; x <= x1; x++) {
          pending[cellKeyOf(x, y, z)] = { x, y, z, name };
          touched.add(chunkKeyOf(x, z));
        }
      }
    }
    set({ pendingCount: Object.keys(pending).length, lastTouched: [...touched], future: [] });
  };

  return {
    active: false,
    opening: false,
    lockExclusive: false,
    dim: null,
    tool: 'paint',
    paintMode: 'brush',
    paintBlock: 'minecraft:stone',
    pending: {},
    pendingCount: 0,
    resolved: {},
    anchor: null,
    selection: null,
    lastTouched: [],
    past: [],
    future: [],
    saving: false,
    saveOpen: false,
    lastReport: null,
    error: null,

    enter: async (dim) => {
      if (get().active || get().opening) return get().active;
      set({ opening: true, error: null });
      try {
        const res = await api.openWorldEdit(dim);
        set({ active: true, opening: false, dim, lockExclusive: res.lockExclusive, lastReport: null });
        return true;
      } catch (e) {
        set({ opening: false, error: e instanceof Error ? e.message : String(e) });
        return false;
      }
    },

    exit: async () => {
      const touched = chunksOf(Object.keys(get().pending));
      try {
        await api.closeWorldEdit();
      } catch {
        /* the session dies with the window either way */
      }
      set({
        active: false,
        dim: null,
        pending: {},
        pendingCount: 0,
        anchor: null,
        selection: null,
        past: [],
        future: [],
        saveOpen: false,
        lastTouched: touched, // the layer re-meshes these AFTER clearing the overlay
      });
    },

    setTool: (tool) => set({ tool, anchor: null }),
    setPaintMode: (paintMode) => set({ paintMode }),
    setPaintBlock: (paintBlock) => set({ paintBlock }),

    ensurePaintResolved: async () => {
      const { paintBlock, resolved } = get();
      const key = stateKeyOf(paintBlock);
      const hit = resolved[key];
      if (hit) return hit;
      try {
        const res = await api.resolveBlock(paintBlock, {});
        const entry: ResolvedWorldBlock = { entry: res.entry, textures: res.textures };
        set({ resolved: { ...get().resolved, [key]: entry } });
        return entry;
      } catch {
        return null;
      }
    },

    strokeBegin: () => {
      const s = get();
      const past = [...s.past, s.pending].slice(-HISTORY_CAP);
      set({ past, future: [], pending: { ...s.pending } });
    },

    paintCell: (cell) => {
      const { paintBlock } = get();
      putEdit({ x: cell[0], y: cell[1], z: cell[2], name: paintBlock });
    },

    eraseCell: (cell) => {
      putEdit({ x: cell[0], y: cell[1], z: cell[2], name: AIR });
    },

    pickSelect: (cell) => {
      const { anchor } = get();
      if (!anchor) {
        const single: [number, number, number] = [cell[0], cell[1], cell[2]];
        set({ anchor: cell, selection: { min: single, max: [cell[0], cell[1], cell[2]] } });
        return;
      }
      const min: [number, number, number] = [
        Math.min(anchor[0], cell[0]),
        Math.min(anchor[1], cell[1]),
        Math.min(anchor[2], cell[2]),
      ];
      const max: [number, number, number] = [
        Math.max(anchor[0], cell[0]),
        Math.max(anchor[1], cell[1]),
        Math.max(anchor[2], cell[2]),
      ];
      set({ selection: { min, max }, anchor: null });
    },

    clearSelection: () => set({ anchor: null, selection: null }),

    fillSelection: async () => {
      const s = get();
      if (!s.selection) return;
      if ((await s.ensurePaintResolved()) === null) {
        set({ error: `unknown block: ${s.paintBlock}` });
        return;
      }
      fillBox(s.paintBlock);
    },

    deleteSelection: () => {
      fillBox(AIR);
    },

    undo: () => {
      const s = get();
      const prev = s.past[s.past.length - 1];
      if (!prev) return;
      set({
        past: s.past.slice(0, -1),
        future: [...s.future, s.pending],
        pending: prev,
        pendingCount: Object.keys(prev).length,
        lastTouched: changedChunks(s.pending, prev),
      });
    },

    redo: () => {
      const s = get();
      const next = s.future[s.future.length - 1];
      if (!next) return;
      set({
        future: s.future.slice(0, -1),
        past: [...s.past, s.pending],
        pending: next,
        pendingCount: Object.keys(next).length,
        lastTouched: changedChunks(s.pending, next),
      });
    },

    discard: () => {
      const touched = chunksOf(Object.keys(get().pending));
      set({ pending: {}, pendingCount: 0, past: [], future: [], lastTouched: touched, anchor: null });
    },

    setSaveOpen: (saveOpen) => set({ saveOpen }),

    save: async (retention) => {
      const s = get();
      if (!s.dim || !s.pendingCount || s.saving) return null;
      set({ saving: true, error: null });
      try {
        const report = await api.applyWorldEdits(s.dim, Object.values(s.pending), retention);
        const touched = chunksOf(Object.keys(s.pending));
        set({
          saving: false,
          lastReport: report,
          pending: {},
          pendingCount: 0,
          past: [],
          future: [],
          lastTouched: touched,
        });
        return report;
      } catch (e) {
        set({ saving: false, error: e instanceof Error ? e.message : String(e) });
        return null;
      }
    },

    clearError: () => set({ error: null }),
  };
});

export type { PendingWorldEdit, ResolvedWorldBlock } from '../world/edit-overlay';
