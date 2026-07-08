// In-world editing state: the pending-edit overlay (local until "Save to World"), the v1 tool
// set (paint brush/recolor, erase, box select + fill/delete), undo/redo over the pending map,
// and the save flow through the main-process safe write path. Parallel to `editor.ts` (the
// structure block editor) but deliberately its own store: edits here are per-cell records over
// an unbounded streamed world, not ops over a bounded StructureData.
import { createStore } from 'zustand/vanilla';
import type { DimensionId, StructureData, WorldEditApplyResult, WorldExtractResult } from '@/shared/types';
import { api } from '../api';
import {
  AIR,
  cellKeyOf,
  chunkKeyOf,
  stateKeyOf,
  type PendingWorldEdit,
  type ResolvedWorldBlock,
} from '../world/edit-overlay';
import { adjustFaceY, spanRegion } from '../world/selection';
import { planPlacement, rotatedSize, type PlaceTurns } from '../world/place';

export type WorldTool = 'paint' | 'erase' | 'select' | 'place';
export type WorldPaintMode = 'brush' | 'recolor';

/** The live Place-tool ghost: the source structure plus where it currently sits. */
export interface PlaceGhostState {
  /** Source document id (the panel's picker highlights it). */
  docId: string;
  /** Human label (the tab title) shown in the panel readout. */
  label: string;
  data: StructureData;
  /** Min corner of the ROTATED bounding box (world cells); null until aimed. */
  anchor: [number, number, number] | null;
  /** True once a click pinned the anchor (hover stops following the cursor). */
  locked: boolean;
  /** CW quarter-turns about +Y (the `transformProps` convention). */
  turns: PlaceTurns;
}

/** What `commitPlace` needs from the viewer (kept as callbacks so the store stays pure). */
export interface CommitPlaceHost {
  /** Whether the chunk holding world column (cx,cz) is streamed in (editable). */
  chunkLoaded(cx: number, cz: number): boolean;
  /** Preload textures so the composited placement meshes textured. */
  loadTextures(keys: string[]): Promise<void>;
}

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
  /** The Place tool's ghost (a structure being positioned), or null. */
  place: PlaceGhostState | null;
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
  /** Live rubber band: while the first corner is anchored, stretch the box to the aimed
   *  cell so the region is visible BEFORE the second click. No-op once committed. */
  previewSelect(cell: [number, number, number]): void;
  /** Move the committed box's top/bottom face to world Y `y` (drag handles / steppers),
   *  clamped so the box never inverts nor leaves `bounds` (the build range) when given. */
  adjustSelectionY(face: 'top' | 'bottom', y: number, bounds?: [number, number]): void;
  clearSelection(): void;
  /** Fill the committed selection with the paint block (volume-capped). */
  fillSelection(): Promise<void>;
  /** Fill the committed selection with air. */
  deleteSelection(): void;
  /** Extract the committed selection into a temp `.nbt` structure (committed world, not pending
   *  edits). Returns the result so the caller can open it as a tab or route it to Export As;
   *  null when there's no selection. `nbtLimit` decides `oversized`. */
  extractSelection(nbtLimit: number): Promise<WorldExtractResult | null>;
  /** Start placing an open structure: switches to the Place tool with a fresh ghost. */
  beginPlace(docId: string, label: string, data: StructureData): void;
  /** Center the ghost's rotated footprint on a world cell. `lock` pins it (a click);
   *  unlocked aims (hover-follow) are ignored once the anchor is pinned. */
  aimPlace(cell: [number, number, number], lock: boolean): void;
  /** Nudge the pinned/aimed ghost one cell along an axis. */
  nudgePlace(axis: 'x' | 'y' | 'z', dir: 1 | -1): void;
  /** Rotate the ghost 90° (dir 1 = CW), keeping its footprint center fixed. */
  rotatePlace(dir: 1 | -1): void;
  /** Drop the ghost (nothing was committed). */
  cancelPlace(): void;
  /** Turn the ghost into pending edits (ONE undo step). The ghost stays for repeat
   *  placement. Returns false (with `error` set) when the placement is too large or
   *  covers chunks that aren't streamed in. */
  commitPlace(host: CommitPlaceHost): Promise<boolean>;
  undo(): void;
  redo(): void;
  /** Drop every pending edit (and its history). */
  discard(): void;
  setSaveOpen(open: boolean): void;
  /** Commit the pending edits through the safe write path. Returns the report (also stored). */
  save(retention: number, sizeCapMb?: number): Promise<WorldEditApplyResult | null>;
  clearError(): void;
  /** Extraction (Save selection as… / Open as tab) in flight — the buttons show a busy state. */
  extracting: boolean;
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
    place: null,
    lastTouched: [],
    past: [],
    future: [],
    saving: false,
    saveOpen: false,
    lastReport: null,
    error: null,
    extracting: false,

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
        place: null,
        past: [],
        future: [],
        saveOpen: false,
        lastTouched: touched, // the layer re-meshes these AFTER clearing the overlay
      });
    },

    // Leaving the Place tool drops its ghost — the ghost's lifecycle IS the tool's.
    setTool: (tool) => set({ tool, anchor: null, ...(tool !== 'place' ? { place: null } : {}) }),
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
        set({ anchor: cell, selection: spanRegion(cell, cell) });
        return;
      }
      set({ selection: spanRegion(anchor, cell), anchor: null });
    },

    previewSelect: (cell) => {
      const { anchor } = get();
      if (!anchor) return;
      set({ selection: spanRegion(anchor, cell) });
    },

    adjustSelectionY: (face, y, bounds) => {
      const { selection } = get();
      if (!selection) return;
      const next = adjustFaceY(selection, face, y, bounds);
      if (next.min[1] === selection.min[1] && next.max[1] === selection.max[1]) return;
      set({ selection: next });
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

    extractSelection: async (nbtLimit) => {
      const s = get();
      if (!s.selection || !s.dim || s.extracting) return null;
      set({ extracting: true, error: null });
      try {
        const result = await api.extractFromWorld(s.dim, { min: s.selection.min, max: s.selection.max }, nbtLimit);
        if (!result.ok) set({ error: result.error });
        return result;
      } catch (e) {
        set({ error: e instanceof Error ? e.message : String(e) });
        return null;
      } finally {
        set({ extracting: false });
      }
    },

    beginPlace: (docId, label, data) =>
      set({ tool: 'place', anchor: null, place: { docId, label, data, anchor: null, locked: false, turns: 0 } }),

    aimPlace: (cell, lock) => {
      const g = get().place;
      if (!g || (g.locked && !lock)) return; // hover stops following once pinned
      const [w, , d] = rotatedSize(g.data.size, g.turns);
      const anchor: [number, number, number] = [
        cell[0] - Math.floor(w / 2),
        cell[1],
        cell[2] - Math.floor(d / 2),
      ];
      set({ place: { ...g, anchor, locked: g.locked || lock } });
    },

    nudgePlace: (axis, dir) => {
      const g = get().place;
      if (!g?.anchor) return;
      const anchor = [...g.anchor] as [number, number, number];
      anchor[axis === 'x' ? 0 : axis === 'y' ? 1 : 2] += dir;
      set({ place: { ...g, anchor, locked: true } });
    },

    rotatePlace: (dir) => {
      const g = get().place;
      if (!g) return;
      const turns = ((g.turns + (dir === 1 ? 1 : 3)) % 4) as PlaceTurns;
      if (!g.anchor) {
        set({ place: { ...g, turns } });
        return;
      }
      // Keep the footprint CENTER fixed: re-derive the min corner for the new footprint.
      const [w0, , d0] = rotatedSize(g.data.size, g.turns);
      const [w1, , d1] = rotatedSize(g.data.size, turns);
      const anchor: [number, number, number] = [
        g.anchor[0] + Math.floor(w0 / 2) - Math.floor(w1 / 2),
        g.anchor[1],
        g.anchor[2] + Math.floor(d0 / 2) - Math.floor(d1 / 2),
      ];
      set({ place: { ...g, anchor, turns } });
    },

    cancelPlace: () => set({ place: null }),

    commitPlace: async (host) => {
      const s = get();
      const g = s.place;
      if (!g?.anchor) return false;
      const plan = planPlacement(g.data, g.anchor, g.turns);
      if (!plan.edits.length) return false;
      if (plan.edits.length > WORLD_SELECTION_CAP) {
        set({ error: `placement too large (${plan.edits.length.toLocaleString()} blocks — cap ${WORLD_SELECTION_CAP.toLocaleString()})` });
        return false;
      }
      // The §2 rule holds for placements too: edits only land on streamed-in chunks.
      const missing = new Set<string>();
      for (const e of plan.edits) {
        const cx = Math.floor(e.x / 16);
        const cz = Math.floor(e.z / 16);
        if (!host.chunkLoaded(cx, cz)) missing.add(`${cx},${cz}`);
      }
      if (missing.size) {
        set({ error: `${missing.size} target chunks are not loaded yet — move closer so the whole footprint streams in` });
        return false;
      }
      // Resolve every unique solid state (rotation makes NEW states — a rotated stair
      // meshes differently). A failed resolution falls back to the SOURCE palette entry
      // with the rewritten props: the saved state is still correct, only the preview
      // geometry keeps the unrotated model.
      const resolved = { ...get().resolved };
      const textures = new Set<string>();
      for (const [key, st] of plan.states) {
        if (!resolved[key]) {
          try {
            const r = await api.resolveBlock(st.name, st.properties ?? {});
            resolved[key] = { entry: r.entry, textures: r.textures };
          } catch {
            const src = g.data.palette[st.sourceState];
            resolved[key] = { entry: { ...src, properties: st.properties }, textures: [] };
          }
        }
        for (const t of resolved[key].textures) textures.add(t);
      }
      await host.loadTextures([...textures]);
      s.strokeBegin();
      const pending = get().pending;
      const touched = new Set<string>();
      for (const e of plan.edits) {
        pending[cellKeyOf(e.x, e.y, e.z)] = e;
        touched.add(chunkKeyOf(e.x, e.z));
      }
      set({
        resolved,
        pendingCount: Object.keys(pending).length,
        lastTouched: [...touched],
        future: [],
        error: null,
      });
      return true;
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

    save: async (retention, sizeCapMb = 0) => {
      const s = get();
      if (!s.dim || !s.pendingCount || s.saving) return null;
      set({ saving: true, error: null });
      try {
        const report = await api.applyWorldEdits(s.dim, Object.values(s.pending), retention, sizeCapMb);
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

/** Commit the Place ghost through a Viewer's world surface — the one adapter the
 *  panel's button and the layer's Enter key share. */
export function commitPlaceVia(viewer: {
  worldChunkLoaded(cx: number, cz: number): boolean;
  ensureWorldTextures(keys: string[]): Promise<void>;
}): Promise<boolean> {
  return worldEditStore.getState().commitPlace({
    chunkLoaded: (cx, cz) => viewer.worldChunkLoaded(cx, cz),
    loadTextures: (keys) => viewer.ensureWorldTextures(keys),
  });
}
