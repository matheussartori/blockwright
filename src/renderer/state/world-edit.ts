// In-world editing state: the pending-edit overlay (local until "Save to World"), the v1 tool
// set (paint brush/recolor, erase, box select + fill/delete), undo/redo over the pending map,
// and the save flow through the main-process safe write path. Parallel to `editor.ts` (the
// structure block editor) but deliberately its own store: edits here are per-cell records over
// an unbounded streamed world, not ops over a bounded StructureData.
import { createStore } from 'zustand/vanilla';
import type { DimensionId, StructureData, WorldEditApplyResult, WorldEntityEdit, WorldExtractResult } from '@/shared/types';
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
import { parsePattern, pickPatternIndex, type PatternEntry } from '../editor/pattern';
import type { MatchMode } from '../editor/ops';
import { worldMagicRegion, type WorldMagicRegion } from '../world/magic';
import { planTerrainBlend, type BlockState, type SurfaceSample, type TerrainSampler } from '../world/blend';
import type { FloorDef } from '@/shared/types';

export type WorldTool = 'paint' | 'erase' | 'select' | 'place';
export type WorldPaintMode = 'brush' | 'recolor';
/** How the Select tool picks: two-corner box, or magic (contiguous same-block region). */
export type WorldSelectMode = 'box' | 'magic';

/** The Terrain Blend toggles (v2.3 §1.2), persisted across placements in the session. */
export interface BlendState {
  /** Pillar grounded footprint columns down to the terrain ("beard"). */
  foundation: boolean;
  /** Feather-ring radius around the footprint (0 = off). */
  feather: number;
  /** Clear terrain poking through cells the structure leaves undefined. */
  excavate: boolean;
  /** Sink the aim by the structure's detected basement depth (only when one exists). */
  sink: boolean;
}

/** Below-grade depth (cells) declared by a structure's floor metadata — the storeys-based
 *  basement detection behind the Place tool's "sink" toggle. 0 when nothing is marked. */
export function basementDepthOf(floors: FloorDef[] | undefined): number {
  let depth = 0;
  for (const f of floors ?? []) {
    if (f.role === 'basement') depth = Math.max(depth, f.to + 1);
  }
  return depth;
}

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
  /** Below-grade basement depth detected from the doc's floor metadata (0 = none) —
   *  the "sink" toggle drops the aim by this much so the basement lands buried. */
  sink: number;
}

/** What `commitPlace` needs from the viewer (kept as callbacks so the store stays pure). */
export interface CommitPlaceHost {
  /** Whether the chunk holding world column (cx,cz) is streamed in (editable). */
  chunkLoaded(cx: number, cz: number): boolean;
  /** Preload textures so the composited placement meshes textured. */
  loadTextures(keys: string[]): Promise<void>;
  /** Terrain surface at a world column (Terrain Blend), or null when not streamed in. */
  surfaceAt(x: number, z: number): SurfaceSample | null;
  /** Block state at a world cell (Terrain Blend), or null when not streamed in. */
  blockAt(x: number, y: number, z: number): BlockState | null;
}

/** Hard cap on a box-selection's volume — a runaway fill would freeze the mesher and produce a
 *  save nobody wants (65 536 = a 64×16×64 slab). */
export const WORLD_SELECTION_CAP = 65536;

/** Undo history depth (snapshots of the pending map — records, so shallow copies are cheap). */
const HISTORY_CAP = 60;

type PendingMap = Record<string, PendingWorldEdit>;

/** One undo step: the per-cell block edits plus the entities pending placement. Entities
 *  aren't cell-keyed, so they snapshot as a plain list alongside the map. */
interface PendingSnapshot {
  blocks: PendingMap;
  entities: WorldEntityEdit[];
}

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
  /** Entities pending placement (the Place tool's fidelity payload) — saved with the blocks.
   *  Not composited into the overlay mesh; the Save dialog reports the count. */
  pendingEntities: WorldEntityEdit[];
  /** Renderable palette entries per state key (resolved once, reused by the compositor). */
  resolved: Record<string, ResolvedWorldBlock>;
  /** Box-select state: the first corner, and the committed box (both inclusive). */
  anchor: [number, number, number] | null;
  selection: { min: [number, number, number]; max: [number, number, number] } | null;
  /** How the Select tool picks (box corners / magic region). */
  selectMode: WorldSelectMode;
  /** Magic select's tolerance (exact state / same block / same family). */
  magicMatch: MatchMode;
  /** The committed magic region, or null. */
  magic: WorldMagicRegion | null;
  /** The Place tool's Terrain Blend toggles. */
  blend: BlendState;
  /** The Place tool's ghost (a structure being positioned), or null. */
  place: PlaceGhostState | null;
  /** Chunk keys whose composite changed in the LAST mutation — the layer re-meshes exactly these. */
  lastTouched: string[];
  past: PendingSnapshot[];
  future: PendingSnapshot[];
  saving: boolean;
  saveOpen: boolean;
  lastReport: WorldEditApplyResult | null;
  error: string | null;

  enter(dim: DimensionId): Promise<boolean>;
  exit(): Promise<void>;
  setTool(tool: WorldTool): void;
  setPaintMode(mode: WorldPaintMode): void;
  setPaintBlock(id: string): void;
  setSelectMode(mode: WorldSelectMode): void;
  setMagicMatch(mode: MatchMode): void;
  /** Patch the Terrain Blend toggles. */
  setBlend(patch: Partial<BlendState>): void;
  /** Resolve every entry of the current paint pattern to renderable entries (cached).
   *  Null when the pattern is malformed or any block fails to resolve. */
  ensurePaintResolved(): Promise<ResolvedWorldBlock[] | null>;
  /** Snapshot for undo — one per stroke/batch, so a drag coalesces into one step. */
  strokeBegin(): void;
  /** Place the paint block (brush/recolor target cell already picked by the layer). */
  paintCell(cell: [number, number, number]): void;
  /** Place air (erase) at a solid cell. */
  eraseCell(cell: [number, number, number]): void;
  /** Box-select: first pick anchors, second commits the box, a third re-anchors. */
  pickSelect(cell: [number, number, number]): void;
  /** Magic select: flood the contiguous same-block region from a picked cell (reads the
   *  committed world through `blockAt`). Replaces any box selection. */
  magicPick(cell: [number, number, number], blockAt: (x: number, y: number, z: number) => BlockState | null): void;
  /** Fill the magic region with the paint pattern (one undo step). */
  fillMagic(): Promise<void>;
  /** Fill the magic region with air. */
  deleteMagic(): void;
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

  // Memoized parse of the paint field — a pattern string would otherwise re-parse on
  // every painted cell of a drag.
  let patternSrc: string | null = null;
  let patternCache: PatternEntry[] | null = null;
  const paintPattern = (): PatternEntry[] | null => {
    const src = get().paintBlock;
    if (src !== patternSrc) {
      patternSrc = src;
      patternCache = parsePattern(src);
    }
    return patternCache;
  };

  /** Fill `cells` with the pattern (each cell picks deterministically) as ONE undo step. */
  const fillCells = (cells: Iterable<readonly [number, number, number]>, pattern: PatternEntry[]): void => {
    get().strokeBegin();
    const pending = get().pending;
    const touched = new Set<string>();
    for (const [x, y, z] of cells) {
      pending[cellKeyOf(x, y, z)] = { x, y, z, name: pattern[pickPatternIndex(pattern, x, y, z)].name };
      touched.add(chunkKeyOf(x, z));
    }
    set({ pendingCount: Object.keys(pending).length, lastTouched: [...touched], future: [] });
  };

  /** Fill the committed selection box with a pattern as ONE undo step (volume-capped). */
  const fillBox = (pattern: PatternEntry[]): void => {
    const sel = get().selection;
    if (!sel) return;
    const [x0, y0, z0] = sel.min;
    const [x1, y1, z1] = sel.max;
    const volume = (x1 - x0 + 1) * (y1 - y0 + 1) * (z1 - z0 + 1);
    if (volume > WORLD_SELECTION_CAP) {
      set({ error: `selection too large (${volume.toLocaleString()} blocks — cap ${WORLD_SELECTION_CAP.toLocaleString()})` });
      return;
    }
    const cells: [number, number, number][] = [];
    for (let y = y0; y <= y1; y++)
      for (let z = z0; z <= z1; z++)
        for (let x = x0; x <= x1; x++) cells.push([x, y, z]);
    fillCells(cells, pattern);
  };

  /** One-entry air pattern (erase fills). */
  const AIR_PATTERN: PatternEntry[] = [{ name: AIR, weight: 1 }];

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
    pendingEntities: [],
    resolved: {},
    anchor: null,
    selection: null,
    selectMode: 'box',
    magicMatch: 'block',
    magic: null,
    blend: { foundation: true, feather: 2, excavate: false, sink: true },
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
        pendingEntities: [],
        anchor: null,
        selection: null,
        magic: null,
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
    setSelectMode: (selectMode) => set({ selectMode, anchor: null }),
    // A tolerance change makes the committed region stale — drop it.
    setMagicMatch: (magicMatch) => set({ magicMatch, magic: null }),
    setBlend: (patch) => set({ blend: { ...get().blend, ...patch } }),

    ensurePaintResolved: async () => {
      const pattern = paintPattern();
      if (!pattern) return null;
      const resolved = { ...get().resolved };
      const out: ResolvedWorldBlock[] = [];
      try {
        for (const p of pattern) {
          const key = stateKeyOf(p.name);
          let hit = resolved[key];
          if (!hit) {
            const res = await api.resolveBlock(p.name, {});
            hit = { entry: res.entry, textures: res.textures };
            resolved[key] = hit;
          }
          out.push(hit);
        }
      } catch {
        return null;
      }
      set({ resolved });
      return out;
    },

    strokeBegin: () => {
      const s = get();
      const past = [...s.past, { blocks: s.pending, entities: s.pendingEntities }].slice(-HISTORY_CAP);
      set({ past, future: [], pending: { ...s.pending } });
    },

    paintCell: (cell) => {
      const pattern = paintPattern();
      if (!pattern) return; // malformed pattern — nothing to paint
      const name = pattern[pickPatternIndex(pattern, cell[0], cell[1], cell[2])].name;
      putEdit({ x: cell[0], y: cell[1], z: cell[2], name });
    },

    eraseCell: (cell) => {
      putEdit({ x: cell[0], y: cell[1], z: cell[2], name: AIR });
    },

    pickSelect: (cell) => {
      const { anchor } = get();
      if (!anchor) {
        set({ anchor: cell, selection: spanRegion(cell, cell), magic: null });
        return;
      }
      set({ selection: spanRegion(anchor, cell), anchor: null });
    },

    magicPick: (cell, blockAt) => {
      const magic = worldMagicRegion(cell, blockAt, get().magicMatch);
      set({ magic, anchor: null, selection: null });
    },

    fillMagic: async () => {
      const s = get();
      if (!s.magic?.cells.length) return;
      const pattern = paintPattern();
      if (!pattern || (await s.ensurePaintResolved()) === null) {
        set({ error: `unknown block: ${s.paintBlock}` });
        return;
      }
      fillCells(s.magic.cells, pattern);
    },

    deleteMagic: () => {
      const m = get().magic;
      if (m?.cells.length) fillCells(m.cells, AIR_PATTERN);
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

    clearSelection: () => set({ anchor: null, selection: null, magic: null }),

    fillSelection: async () => {
      const s = get();
      if (!s.selection) return;
      const pattern = paintPattern();
      if (!pattern || (await s.ensurePaintResolved()) === null) {
        set({ error: `unknown block: ${s.paintBlock}` });
        return;
      }
      fillBox(pattern);
    },

    deleteSelection: () => {
      fillBox(AIR_PATTERN);
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
      set({
        tool: 'place',
        anchor: null,
        place: { docId, label, data, anchor: null, locked: false, turns: 0, sink: basementDepthOf(data.floors) },
      }),

    aimPlace: (cell, lock) => {
      const g = get().place;
      if (!g || (g.locked && !lock)) return; // hover stops following once pinned
      const [w, , d] = rotatedSize(g.data.size, g.turns);
      // A detected basement sinks the aim so the below-grade storeys land buried
      // (the semi-buried case of §1.2) — toggled by the blend "sink" switch.
      const sink = get().blend.sink ? g.sink : 0;
      const anchor: [number, number, number] = [
        cell[0] - Math.floor(w / 2),
        cell[1] - sink,
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
      // Terrain Blend (§1.2): foundation/feather/excavation edits planned against the
      // COMMITTED terrain (read through the host's samplers) — never overlapping the
      // structure's own cells, same undo step, same pending-edit preview.
      const b = s.blend;
      let blendEdits: PendingWorldEdit[] = [];
      if (b.foundation || b.feather > 0 || b.excavate) {
        const sampler: TerrainSampler = {
          surfaceAt: (x, z) => host.surfaceAt(x, z),
          blockAt: (x, y, z) => host.blockAt(x, y, z)?.name ?? null,
        };
        blendEdits = planTerrainBlend(
          { edits: plan.edits, anchor: g.anchor, size: rotatedSize(g.data.size, g.turns) },
          sampler,
          b,
        ).filter((e) => host.chunkLoaded(Math.floor(e.x / 16), Math.floor(e.z / 16)));
      }
      const total = plan.edits.length + blendEdits.length;
      if (total > WORLD_SELECTION_CAP) {
        set({ error: `placement too large (${total.toLocaleString()} blocks — cap ${WORLD_SELECTION_CAP.toLocaleString()})` });
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
      // Blend states are terrain blocks (grass/dirt/sand…) already streamed in this world,
      // so resolution virtually always succeeds; a failure falls back to a flat-colour
      // entry (the chunk palette usually renders the real model anyway).
      for (const e of blendEdits) {
        if (e.name === AIR) continue;
        const key = stateKeyOf(e.name, e.properties);
        if (resolved[key]) {
          for (const t of resolved[key].textures) textures.add(t);
          continue;
        }
        try {
          const r = await api.resolveBlock(e.name, e.properties ?? {});
          resolved[key] = { entry: r.entry, textures: r.textures };
          for (const t of r.textures) textures.add(t);
        } catch {
          resolved[key] = { entry: { name: e.name, properties: e.properties, models: [], color: [0.45, 0.37, 0.3], air: false }, textures: [] };
        }
      }
      await host.loadTextures([...textures]);
      s.strokeBegin();
      const pending = get().pending;
      const touched = new Set<string>();
      for (const e of [...plan.edits, ...blendEdits]) {
        pending[cellKeyOf(e.x, e.y, e.z)] = e;
        touched.add(chunkKeyOf(e.x, e.z));
      }
      set({
        resolved,
        pendingCount: Object.keys(pending).length,
        pendingEntities: [...get().pendingEntities, ...plan.entities],
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
        future: [...s.future, { blocks: s.pending, entities: s.pendingEntities }],
        pending: prev.blocks,
        pendingCount: Object.keys(prev.blocks).length,
        pendingEntities: prev.entities,
        lastTouched: changedChunks(s.pending, prev.blocks),
      });
    },

    redo: () => {
      const s = get();
      const next = s.future[s.future.length - 1];
      if (!next) return;
      set({
        future: s.future.slice(0, -1),
        past: [...s.past, { blocks: s.pending, entities: s.pendingEntities }],
        pending: next.blocks,
        pendingCount: Object.keys(next.blocks).length,
        pendingEntities: next.entities,
        lastTouched: changedChunks(s.pending, next.blocks),
      });
    },

    discard: () => {
      const touched = chunksOf(Object.keys(get().pending));
      set({ pending: {}, pendingCount: 0, pendingEntities: [], past: [], future: [], lastTouched: touched, anchor: null, magic: null });
    },

    setSaveOpen: (saveOpen) => set({ saveOpen }),

    save: async (retention, sizeCapMb = 0) => {
      const s = get();
      if (!s.dim || !s.pendingCount || s.saving) return null;
      set({ saving: true, error: null });
      try {
        const report = await api.applyWorldEdits(s.dim, Object.values(s.pending), s.pendingEntities, retention, sizeCapMb);
        const touched = chunksOf(Object.keys(s.pending));
        set({
          saving: false,
          lastReport: report,
          pending: {},
          pendingCount: 0,
          pendingEntities: [],
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
  worldSurfaceAt(x: number, z: number): SurfaceSample | null;
  worldBlockStateAt(x: number, y: number, z: number): BlockState | null;
}): Promise<boolean> {
  return worldEditStore.getState().commitPlace({
    chunkLoaded: (cx, cz) => viewer.worldChunkLoaded(cx, cz),
    loadTextures: (keys) => viewer.ensureWorldTextures(keys),
    surfaceAt: (x, z) => viewer.worldSurfaceAt(x, z),
    blockAt: (x, y, z) => viewer.worldBlockStateAt(x, y, z),
  });
}
