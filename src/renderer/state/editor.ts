// The block-editor's state: edit mode, the active tool, the current selection, the
// tool parameters, and an undo/redo history of structure snapshots. Edits run the pure
// ops (editor/ops.ts) over the active document's live StructureData and patch it back
// into the documents store; the viewer follows (EditorLayer re-shows on structure change)
// and the selection overlay tracks `selection`. Saving re-encodes the edited blocks to a
// new `.nbt` version (no AI passes), so a bad edit is never fatal — there's always undo
// and the version chain.
import { createStore } from 'zustand/vanilla';
import type { StructureData } from '@/shared/types';
import { api } from '../api';
import { store } from './store';
import { settingsStore } from './settings';
import { documentsStore, activeDocument } from './documents';
import { commitManualVersion, currentBasePath } from './versions';
import { transformProps } from '@/shared/structure/orientation';
import {
  buildStairs,
  cellKey,
  deleteSelection,
  extrudeSelection,
  fillVoidBox,
  floodRegion,
  HORIZONTALS,
  internEntry,
  magicSelect,
  mirrorCell,
  moveSelection,
  parseCell,
  placeCells,
  planTransform,
  recolorCell,
  repaintCells,
  replaceSelection,
  rethemeBlocks,
  selectBox,
  setVoidCell,
  type Axis,
  type Cell,
  type CellContent,
  type EditData,
  type Horizontal,
  type MatchMode,
  type OpResult,
  type PropXform,
} from '../editor/ops';
import { parsePattern, pickPatternIndex, type PatternEntry } from '../editor/pattern';
import type { PaletteEntry } from '@/shared/types';

export type { MatchMode };

/** The canonical tool order — the rail's layout AND the 1–9 number-key shortcuts, so the
 *  key you press always matches the button position you see. */
export const TOOL_ORDER = [
  'select',
  'move',
  'transform',
  'extrude',
  'stairs',
  'paint',
  'replace',
  'void',
  'delete',
] as const;

/** The live-symmetry plane: none, or a mirror across the structure's centre on X or Z. */
export type Symmetry = 'none' | 'x' | 'z';

export type Tool = (typeof TOOL_ORDER)[number];

/** Paint sub-mode: add blocks against surfaces (brush), repaint existing ones (recolor),
 *  or flood-fill a connected region (fill). */
export type PaintMode = 'brush' | 'recolor' | 'fill';

/** What the Void tool writes into a cell: explicit air (clears terrain on paste) or structure
 *  void (preserves it). There's no "clear" — an omitted cell preserves terrain exactly like
 *  structure_void, so Void already covers that intent. */
export type VoidKind = 'air' | 'void';

/** How a pick combines with the current selection (decided by modifier keys). `magic`
 *  (Alt+click) selects the contiguous same-block region under the tolerance mode. */
export type PickMode = 'single' | 'add' | 'box' | 'magic';

/** A point-in-time snapshot for undo/redo (the parts an op can change). */
interface Snapshot {
  blocks: StructureData['blocks'];
  palette: StructureData['palette'];
  textures: string[];
}

/** Undo snapshot cap fallback — Settings ▸ Editor's undo depth overrides it live. */
const UNDO_CAP = 60;

/** The stack cap right now (the setting, clamped to something sane). */
const undoCap = (): number => {
  const depth = settingsStore.getState().editorUndoDepth;
  return Number.isFinite(depth) && depth >= 10 ? Math.min(500, Math.round(depth)) : UNDO_CAP;
};

const SYMMETRY_KEY = 'blockwright.editor.symmetry';

/** The symmetry remembered across sessions (Settings ▸ Editor's persist toggle). */
function loadPersistedSymmetry(): Symmetry {
  try {
    const v = localStorage.getItem(SYMMETRY_KEY);
    return v === 'x' || v === 'z' ? v : 'none';
  } catch {
    return 'none';
  }
}

export interface EditorState {
  active: boolean;
  tool: Tool;
  /** Selected cell keys ("x,y,z"), the set every op acts on. */
  selection: string[];
  /** The last single-clicked cell — the box-select origin and the stairs start. */
  anchor: string | null;
  /** Tool parameters. */
  replaceBlock: string;
  paintBlock: string;
  /** Paint sub-mode (brush / recolor / fill). */
  paintMode: PaintMode;
  /** Magic select's tolerance: exact state / same block / same material family. */
  magicMatch: MatchMode;
  /** What the Void tool writes (air = clears terrain / structure void = preserves it). */
  voidKind: VoidKind;
  /** How many cells DEEPER than the first surface the Void tool targets (Alt+scroll) —
   *  0 = the cell in front of the aimed face, N = N cells further along the ray, so
   *  layers behind the first surface are reachable. Resets on tool change. */
  paintDepth: number;
  /** Show the air + structure-void cells as ghost markers (any tool). */
  showVoids: boolean;
  /** What's under the cursor while painting/editing voids (the readout), or null. */
  hoverInfo: { key: string; content: CellContent } | null;
  stairsBlock: string;
  stairsDir: Horizontal;
  stairsSteps: number;
  extrudeCount: number;
  /** Cells between extrude copies — 1 = a contiguous run, >1 = a repeating array. */
  extrudeStep: number;
  /** Eyedropper active — the next click samples a block's type into the active tool's block. */
  eyedropper: boolean;
  /** Live symmetry: mirror Paint + Delete across the structure's centre (off / X / Z). */
  symmetry: Symmetry;
  /** Unsaved edits since the last save. */
  dirty: boolean;
  saving: boolean;
  past: Snapshot[];
  future: Snapshot[];

  setActive: (active: boolean) => void;
  setTool: (tool: Tool) => void;
  pick: (cell: Cell | null, mode: PickMode) => void;
  clearSelection: () => void;
  setReplaceBlock: (id: string) => void;
  setPaintBlock: (id: string) => void;
  setPaintMode: (mode: PaintMode) => void;
  setMagicMatch: (mode: MatchMode) => void;
  setVoidKind: (kind: VoidKind) => void;
  setPaintDepth: (n: number) => void;
  setShowVoids: (on: boolean) => void;
  setHoverInfo: (info: { key: string; content: CellContent } | null) => void;
  setStairsBlock: (id: string) => void;
  setStairsDir: (dir: Horizontal) => void;
  setStairsSteps: (n: number) => void;
  setExtrudeCount: (n: number) => void;
  setExtrudeStep: (n: number) => void;
  setEyedropper: (on: boolean) => void;
  setSymmetry: (s: Symmetry) => void;
  /** Set the active tool's block from the block at a cell (the eyedropper). */
  sample: (cell: Cell) => void;
  move: (delta: Cell) => void;
  extrude: (axis: Axis, dir: 1 | -1) => void;
  transform: (xform: PropXform) => Promise<void>;
  /** Rewrite the data-marker string of the data-mode structure blocks at `keys` (one undo
   *  step). Rides on the block as `dataMeta`; save merges it into the block-entity NBT. */
  setDataMeta: (keys: string[], value: string) => void;
  /** Begin a paint/void stroke: resolve the brush block once (so each painted cell is a
   *  synchronous edit) and arm the one-undo-step coalescing. */
  strokeBegin: () => Promise<void>;
  /** Paint one cell into the current stroke — brush adds, recolor repaints, void marks. */
  strokePaint: (cell: Cell) => void;
  /** End the current stroke (the next stroke starts a fresh undo step). */
  strokeEnd: () => void;
  /** Flood-fill from a cell (Paint's Fill) — its own one-shot undo step. */
  fillAt: (cell: Cell) => Promise<void>;
  /** Fill the selection's bounding box with the Void tool's air/void kind in one step —
   *  a multi-layer void region as one operation (and one undo step). Solids are preserved. */
  fillVoid: () => void;
  remove: () => void;
  replace: () => Promise<void>;
  stairs: () => Promise<void>;
  /** Re-theme: swap the palette entries at `mapping`'s indices for the named blocks,
   *  carrying each source entry's blockstate properties over — one undoable step over
   *  the whole build (the Re-theme dialog's Apply). */
  retheme: (mapping: Record<number, string>) => Promise<void>;
  undo: () => void;
  redo: () => void;
  save: () => Promise<void>;
}

const editData = (s: StructureData): EditData => ({ size: s.size, palette: s.palette, blocks: s.blocks });
const snapshot = (s: StructureData): Snapshot => ({ blocks: s.blocks, palette: s.palette, textures: s.textures });
/** Count non-air blocks — the `blockCount` shown for the structure (shared by commit + restore). */
const countSolid = (blocks: { state: number }[], palette: { air?: boolean }[]): number =>
  blocks.filter((b) => !palette[b.state]?.air).length;

export const editorStore = createStore<EditorState>((set, get) => {
  // A paint/void STROKE coalesces a drag into one undo step: the brush pattern is resolved
  // once at `strokeBegin` (so each dragged cell is a synchronous edit), and only the
  // stroke's FIRST committed cell snapshots for undo. A plain block id is the one-entry
  // pattern; multi-entry patterns pick per cell (deterministic — see editor/pattern.ts).
  interface StrokePick {
    entry: PaletteEntry;
    textures: string[];
    mirror: { entry: PaletteEntry; textures: string[] } | null;
  }
  let stroke: { pattern: PatternEntry[]; picks: StrokePick[] } | null = null;
  let strokeSnapped = false;
  // The "show voids" state saved when entering the Void tool (which forces the overlay on),
  // so leaving the tool restores whatever the user had before. null = not currently in the Void tool.
  let voidPrevShowVoids: boolean | null = null;

  /** Patch the active doc with an op result (merging any new textures + recomputing the
   *  block count) and update the selection. Snapshots for undo first unless `snap` is false
   *  — a stroke snapshots once, then patches in place for the rest of the drag. */
  const applyResult = (result: OpResult, extraTextures: string[], snap: boolean): void => {
    const doc = activeDocument(documentsStore.getState());
    if (!doc?.structure) return;
    const past = snap ? [...get().past, snapshot(doc.structure)].slice(-undoCap()) : get().past;
    const textures = extraTextures.length
      ? [...new Set([...doc.structure.textures, ...extraTextures])]
      : doc.structure.textures;
    documentsStore.getState().patchDoc(doc.id, {
      structure: { ...doc.structure, blocks: result.blocks, palette: result.palette, textures, blockCount: countSolid(result.blocks, result.palette) },
    });
    set({ selection: result.selection, past, future: snap ? [] : get().future, dirty: true });
  };

  /** Apply an op result as its own one-undo-step edit (the default for a discrete action). */
  const commit = (result: OpResult, extraTextures: string[] = []): void => applyResult(result, extraTextures, true);

  const restore = (snap: Snapshot): void => {
    const doc = activeDocument(documentsStore.getState());
    if (!doc?.structure) return;
    const blockCount = countSolid(snap.blocks, snap.palette);
    documentsStore.getState().patchDoc(doc.id, {
      structure: { ...doc.structure, blocks: snap.blocks, palette: snap.palette, textures: snap.textures, blockCount },
    });
  };

  /** Run a synchronous op against the active structure + selection and commit its result
   *  (a `null` result is a no-op — e.g. nothing selected). */
  const editActive = (run: (d: EditData, selection: string[]) => OpResult | null): void => {
    const doc = activeDocument(documentsStore.getState());
    if (!doc?.structure) return;
    const result = run(editData(doc.structure), get().selection);
    if (result) commit(result);
  };

  return {
    active: false,
    tool: 'select',
    selection: [],
    anchor: null,
    replaceBlock: 'minecraft:stone',
    paintBlock: 'minecraft:stone',
    paintMode: 'brush',
    magicMatch: 'block',
    voidKind: 'air',
    paintDepth: 0,
    showVoids: false,
    hoverInfo: null,
    stairsBlock: 'minecraft:oak_stairs',
    stairsDir: 'east',
    stairsSteps: 4,
    extrudeCount: 3,
    extrudeStep: 1,
    eyedropper: false,
    symmetry: 'none',
    dirty: false,
    saving: false,
    past: [],
    future: [],

    setActive: (active) => {
      if (!active) {
        stroke = null;
        strokeSnapped = false;
      }
      if (active) {
        // Settings ▸ Editor: start on the configured tool, and either restore the
        // remembered symmetry (persist ON) or reset it (a stale mirror plane from a
        // past session is a surprise, not a preference).
        const s = settingsStore.getState();
        set({
          active,
          tool: s.editorDefaultTool,
          symmetry: s.editorSymmetryPersist ? loadPersistedSymmetry() : 'none',
        });
        return;
      }
      set({ active, selection: [], anchor: null, eyedropper: false, hoverInfo: null });
    },
    // The Void tool always reveals the air/void markers (the eye is disabled meanwhile). We
    // remember the overlay state on entry and restore it on exit, so toggling the tool doesn't
    // silently flip a preference the user set: hidden → forced on → hidden again; shown → stays shown.
    setTool: (tool) => {
      const cur = get().tool;
      // Depth targeting is a per-tool aiming aid — a stale depth on the next tool
      // would silently aim past the surface, so a switch always resets it.
      const depth = tool === cur ? {} : { paintDepth: 0 };
      if (tool === 'void' && cur !== 'void') {
        voidPrevShowVoids = get().showVoids;
        set({ tool, showVoids: true, ...depth });
      } else if (tool !== 'void' && cur === 'void') {
        set({ tool, showVoids: voidPrevShowVoids ?? get().showVoids, ...depth });
        voidPrevShowVoids = null;
      } else {
        set({ tool, ...depth });
      }
    },
    clearSelection: () => set({ selection: [], anchor: null }),

    pick: (cell, mode) => {
      if (!cell) {
        set({ selection: [], anchor: null });
        return;
      }
      const key = cellKey(cell);
      if (mode === 'add') {
        const has = get().selection.includes(key);
        set({ selection: has ? get().selection.filter((k) => k !== key) : [...get().selection, key], anchor: key });
      } else if (mode === 'box' && get().anchor) {
        const doc = activeDocument(documentsStore.getState());
        if (doc?.structure) set({ selection: selectBox(editData(doc.structure), parseCell(get().anchor!), cell) });
      } else if (mode === 'magic') {
        const doc = activeDocument(documentsStore.getState());
        if (doc?.structure) set({ selection: magicSelect(editData(doc.structure), cell, get().magicMatch), anchor: key });
      } else {
        set({ selection: [key], anchor: key });
      }
    },

    setReplaceBlock: (replaceBlock) => set({ replaceBlock }),
    setPaintBlock: (paintBlock) => set({ paintBlock }),
    setPaintMode: (paintMode) => set({ paintMode }),
    setMagicMatch: (magicMatch) => set({ magicMatch }),
    setVoidKind: (voidKind) => set({ voidKind }),
    setPaintDepth: (n) => set({ paintDepth: Math.max(0, Math.min(64, Math.round(n))) }),
    setShowVoids: (showVoids) => set({ showVoids }),
    setHoverInfo: (hoverInfo) => set({ hoverInfo }),
    setStairsBlock: (stairsBlock) => set({ stairsBlock }),
    setStairsDir: (stairsDir) => set({ stairsDir }),
    setStairsSteps: (stairsSteps) => set({ stairsSteps: Math.max(1, Math.min(64, stairsSteps)) }),
    setExtrudeCount: (extrudeCount) => set({ extrudeCount: Math.max(1, Math.min(64, extrudeCount)) }),
    setExtrudeStep: (extrudeStep) => set({ extrudeStep: Math.max(1, Math.min(16, extrudeStep)) }),
    setEyedropper: (eyedropper) => set({ eyedropper }),
    setSymmetry: (symmetry) => {
      set({ symmetry });
      // Remember it across sessions when Settings ▸ Editor says so.
      if (settingsStore.getState().editorSymmetryPersist) {
        try {
          localStorage.setItem(SYMMETRY_KEY, symmetry);
        } catch {
          /* storage unavailable */
        }
      }
    },
    sample: (cell) => {
      const doc = activeDocument(documentsStore.getState());
      if (!doc?.structure) {
        set({ eyedropper: false });
        return;
      }
      const block = doc.structure.blocks.find((b) => cellKey(b.pos) === cellKey(cell));
      const entry = block ? doc.structure.palette[block.state] : undefined;
      if (!entry || entry.air) {
        set({ eyedropper: false });
        return;
      }
      // Sample into whichever tool's block field is in play.
      const tool = get().tool;
      if (tool === 'paint') set({ paintBlock: entry.name, eyedropper: false });
      else if (tool === 'stairs') set({ stairsBlock: entry.name, eyedropper: false });
      else set({ replaceBlock: entry.name, eyedropper: false });
    },

    move: (delta) => editActive((d, sel) => (sel.length ? moveSelection(d, sel, delta) : null)),
    extrude: (axis, dir) =>
      editActive((d, sel) => (sel.length ? extrudeSelection(d, sel, axis, dir * get().extrudeCount, get().extrudeStep) : null)),
    transform: async (xform) => {
      const doc = activeDocument(documentsStore.getState());
      if (!doc?.structure || !get().selection.length) return;
      const struct = doc.structure;
      const placements = planTransform(editData(struct), get().selection, xform);
      if (!placements.length) return;
      // A mirror/rotate changes blockstates (a stair's facing), so a transformed block may
      // need a palette entry the structure doesn't have yet — resolve those models once.
      const combo = (name: string, props: Record<string, string>) => `${name}|${JSON.stringify(props)}`;
      let palette = struct.palette;
      const indexByCombo = new Map<string, number>();
      palette.forEach((p, i) => indexByCombo.set(combo(p.name, (p.properties ?? {}) as Record<string, string>), i));
      const missing = [
        ...new Map(
          placements.filter((pl) => !indexByCombo.has(combo(pl.name, pl.props))).map((pl) => [combo(pl.name, pl.props), pl]),
        ).values(),
      ];
      const extraTextures: string[] = [];
      if (missing.length) {
        const resolved = await Promise.all(missing.map((pl) => api.resolveBlock(pl.name, pl.props)));
        resolved.forEach((res, i) => {
          const interned = internEntry(palette, res.entry);
          palette = interned.palette;
          indexByCombo.set(combo(missing[i].name, missing[i].props), interned.index);
          extraTextures.push(...res.textures);
        });
      }
      const sel = new Set(get().selection);
      const targets = new Set(placements.map((pl) => cellKey(pl.pos)));
      const kept = struct.blocks.filter((b) => !sel.has(cellKey(b.pos)) && !targets.has(cellKey(b.pos)));
      const placed = placements.map((pl) => ({
        state: indexByCombo.get(combo(pl.name, pl.props))!,
        pos: pl.pos,
        ...(pl.nbtPos ? { nbtPos: pl.nbtPos } : {}),
        ...(pl.dataMeta != null ? { dataMeta: pl.dataMeta } : {}),
      }));
      commit({ blocks: [...kept, ...placed], palette, selection: placed.map((p) => cellKey(p.pos)) }, extraTextures);
    },
    setDataMeta: (keys, value) => {
      const doc = activeDocument(documentsStore.getState());
      if (!doc?.structure || !keys.length) return;
      const sel = new Set(keys);
      const blocks = doc.structure.blocks.map((b) => (sel.has(cellKey(b.pos)) ? { ...b, dataMeta: value } : b));
      commit({ blocks, palette: doc.structure.palette, selection: get().selection });
    },
    strokeBegin: async () => {
      strokeSnapped = false;
      stroke = null;
      // The Void tool builds its (air/void) entry locally per cell — no resolve needed.
      if (get().tool === 'void') return;
      // Parse the brush field as a (possibly one-entry) percentage pattern and resolve
      // every entry once — plus each one's mirrored variant when symmetry is on — so
      // every dragged cell is a synchronous, model-ready edit.
      const pattern = parsePattern(get().paintBlock);
      if (!pattern) return; // malformed pattern — the stroke paints nothing
      const sym = get().symmetry;
      const wantMirror = sym !== 'none' && get().paintMode === 'brush';
      try {
        const picks = await Promise.all(
          pattern.map(async (p): Promise<StrokePick> => {
            const { entry, textures } = await api.resolveBlock(p.name);
            let mirror: { entry: PaletteEntry; textures: string[] } | null = null;
            if (wantMirror) {
              const mprops = (transformProps(entry.properties, { kind: 'mirror', axis: sym }) ?? {}) as Record<string, string>;
              const same = JSON.stringify(mprops) === JSON.stringify(entry.properties ?? {});
              mirror = same ? { entry, textures: [] } : await api.resolveBlock(entry.name, mprops);
            }
            return { entry, textures, mirror };
          }),
        );
        stroke = { pattern, picks };
      } catch {
        stroke = null; // an unknown block in the pattern — the stroke paints nothing
      }
    },
    strokePaint: (cell) => {
      const doc = activeDocument(documentsStore.getState());
      if (!doc?.structure) return;
      const s = get();
      const d = editData(doc.structure);
      let result: OpResult | null;
      let extra: string[] = [];

      if (s.tool === 'void') {
        result = setVoidCell(d, cell, s.voidKind);
      } else if (!stroke) {
        return; // brush block still resolving
      } else {
        // The pattern picks this cell's block deterministically (one-entry = the plain brush).
        const pick = stroke.picks[pickPatternIndex(stroke.pattern, cell[0], cell[1], cell[2])];
        if (s.paintMode === 'recolor') {
          result = recolorCell(d, cell, pick.entry);
          extra = pick.textures;
        } else {
          // Brush: add the block (+ its mirror under live symmetry) in one cell edit.
          const placements = [{ cell, entry: pick.entry }];
          if (pick.mirror && s.symmetry !== 'none') {
            const mc = mirrorCell(cell, s.symmetry, doc.structure.size);
            if (cellKey(mc) !== cellKey(cell)) placements.push({ cell: mc, entry: pick.mirror.entry });
          }
          result = placeCells(d, placements);
          extra = pick.mirror ? [...pick.textures, ...pick.mirror.textures] : pick.textures;
        }
      }
      if (!result) return;
      applyResult(result, extra, !strokeSnapped);
      strokeSnapped = true;
    },
    strokeEnd: () => {
      stroke = null;
      strokeSnapped = false;
    },
    fillAt: async (cell) => {
      const doc = activeDocument(documentsStore.getState());
      if (!doc?.structure) return;
      const pattern = parsePattern(get().paintBlock);
      if (!pattern) return;
      const resolved = await Promise.all(pattern.map((p) => api.resolveBlock(p.name)));
      const cur = activeDocument(documentsStore.getState());
      if (!cur?.structure) return;
      // The flooded region matches the clicked block's exact state (the bucket's classic
      // rule); each region cell then takes its own pattern pick.
      const region = floodRegion(editData(cur.structure), cell, 'state');
      const result = repaintCells(editData(cur.structure), region, (c) =>
        resolved[pickPatternIndex(pattern, c[0], c[1], c[2])].entry,
      );
      if (result) commit(result, resolved.flatMap((r) => r.textures));
    },
    fillVoid: () => editActive((d, sel) => (sel.length ? fillVoidBox(d, sel, get().voidKind) : null)),
    retheme: async (mapping) => {
      const doc = activeDocument(documentsStore.getState());
      if (!doc?.structure) return;
      const struct = doc.structure;
      // Only real swaps: a mapping to the same name or from an air entry is a no-op.
      const swaps = Object.entries(mapping)
        .map(([idx, name]) => ({ idx: Number(idx), name }))
        .filter(({ idx, name }) => {
          const src = struct.palette[idx];
          return !!src && !src.air && !!name && src.name !== name;
        });
      if (!swaps.length) return;
      // Resolve each target WITH the source entry's blockstate properties — that's the
      // whole trick: spruce_stairs inherits facing/half/shape from the oak_stairs it replaces.
      const resolved = await Promise.all(
        swaps.map(({ idx, name }) => api.resolveBlock(name, (struct.palette[idx].properties ?? {}) as Record<string, string>)),
      );
      const cur = activeDocument(documentsStore.getState());
      if (!cur?.structure || cur.structure.palette !== struct.palette) return; // edited mid-resolve — bail
      const m = new Map(swaps.map((s, i) => [s.idx, resolved[i].entry]));
      const result = rethemeBlocks(editData(cur.structure), m);
      if (result) commit(result, resolved.flatMap((r) => r.textures));
    },
    remove: () => {
      const doc = activeDocument(documentsStore.getState());
      if (!doc?.structure || !get().selection.length) return;
      const sym = get().symmetry;
      let sel = get().selection;
      if (sym !== 'none') {
        const size = doc.structure.size;
        sel = [...new Set([...sel, ...sel.map((k) => cellKey(mirrorCell(parseCell(k), sym, size)))])];
      }
      commit(deleteSelection(editData(doc.structure), sel));
    },
    replace: async () => {
      const doc = activeDocument(documentsStore.getState());
      if (!doc?.structure || !get().selection.length) return;
      const { entry, textures } = await api.resolveBlock(get().replaceBlock);
      const cur = activeDocument(documentsStore.getState());
      if (!cur?.structure) return;
      commit(replaceSelection(editData(cur.structure), get().selection, entry), textures);
    },
    stairs: async () => {
      const anchor = get().anchor;
      const doc = activeDocument(documentsStore.getState());
      if (!doc?.structure || !anchor) return;
      const h = HORIZONTALS[get().stairsDir];
      const { entry, textures } = await api.resolveBlock(get().stairsBlock, { facing: h.facing, half: 'bottom', shape: 'straight' });
      const cur = activeDocument(documentsStore.getState());
      if (!cur?.structure) return;
      commit(buildStairs(editData(cur.structure), parseCell(anchor), h.step as Cell, get().stairsSteps, entry), textures);
    },

    undo: () => {
      const { past } = get();
      if (!past.length) return;
      const doc = activeDocument(documentsStore.getState());
      if (!doc?.structure) return;
      const future = [...get().future, snapshot(doc.structure)];
      restore(past[past.length - 1]);
      set({ past: past.slice(0, -1), future, selection: [], dirty: true });
    },
    redo: () => {
      const { future } = get();
      if (!future.length) return;
      const doc = activeDocument(documentsStore.getState());
      if (!doc?.structure) return;
      const past = [...get().past, snapshot(doc.structure)];
      restore(future[future.length - 1]);
      set({ future: future.slice(0, -1), past, selection: [], dirty: true });
    },

    save: async () => {
      const doc = activeDocument(documentsStore.getState());
      if (!doc?.structure || get().saving) return;
      set({ saving: true });
      const slug = doc.title && doc.title !== 'Untitled' ? doc.title : undefined;
      const res = await api.saveVersion({
        sessionId: doc.sessionId,
        // Inherit block-entity NBT / entities / DataVersion from the CURRENT base
        // version (the promoted one, else the latest) — what the edit started from.
        sourcePath: currentBasePath(doc),
        size: doc.structure.size,
        palette: doc.structure.palette.map((p) => ({ name: p.name, properties: p.properties })),
        // `nbtPos` (the origin cell of a block's block-entity NBT) rides along so a
        // MOVED chest/jigsaw/data-marker re-attaches its NBT on the main side, and
        // `dataMeta` carries an edited data-marker string into that NBT.
        blocks: doc.structure.blocks.map((b) => ({
          state: b.state,
          pos: b.pos,
          ...(b.nbtPos ? { nbtPos: b.nbtPos } : {}),
          ...(b.dataMeta != null ? { dataMeta: b.dataMeta } : {}),
        })),
        slug,
      });
      set({ saving: false });
      if (res.ok && res.version != null && res.path) {
        await commitManualVersion(doc.id, res.version, res.path, res.libraryPath ?? null);
        set({ dirty: false, past: [], future: [], selection: [], anchor: null });
      } else {
        store.getState().setNotice({ text: `Save failed: ${res.error ?? 'unknown error'}`, warn: true });
      }
    },
  };
});
