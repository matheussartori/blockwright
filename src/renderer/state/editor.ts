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
import { documentsStore, activeDocument } from './documents';
import { commitManualVersion } from './generation';
import { transformProps } from '@/shared/structure/orientation';
import {
  buildStairs,
  cellKey,
  deleteSelection,
  extrudeSelection,
  HORIZONTALS,
  internEntry,
  mirrorCell,
  moveSelection,
  parseCell,
  placeBlock,
  planTransform,
  replaceSelection,
  selectBox,
  type Axis,
  type Cell,
  type EditData,
  type Horizontal,
  type OpResult,
  type PropXform,
} from '../editor/ops';

/** The live-symmetry plane: none, or a mirror across the structure's centre on X or Z. */
export type Symmetry = 'none' | 'x' | 'z';

export type Tool = 'select' | 'move' | 'extrude' | 'transform' | 'stairs' | 'place' | 'replace' | 'delete';

/** How a pick combines with the current selection (decided by modifier keys). */
export type PickMode = 'single' | 'add' | 'box';

/** A point-in-time snapshot for undo/redo (the parts an op can change). */
interface Snapshot {
  blocks: StructureData['blocks'];
  palette: StructureData['palette'];
  textures: string[];
}

const UNDO_CAP = 60;

export interface EditorState {
  active: boolean;
  tool: Tool;
  /** Selected cell keys ("x,y,z"), the set every op acts on. */
  selection: string[];
  /** The last single-clicked cell — the box-select origin and the stairs start. */
  anchor: string | null;
  /** Tool parameters. */
  replaceBlock: string;
  placeBlock: string;
  stairsBlock: string;
  stairsDir: Horizontal;
  stairsSteps: number;
  extrudeCount: number;
  /** Cells between extrude copies — 1 = a contiguous run, >1 = a repeating array. */
  extrudeStep: number;
  /** Eyedropper active — the next click samples a block's type into `replaceBlock`. */
  eyedropper: boolean;
  /** Live symmetry: mirror Place + Delete across the structure's centre (off / X / Z). */
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
  setPlaceBlock: (id: string) => void;
  setStairsBlock: (id: string) => void;
  setStairsDir: (dir: Horizontal) => void;
  setStairsSteps: (n: number) => void;
  setExtrudeCount: (n: number) => void;
  setExtrudeStep: (n: number) => void;
  setEyedropper: (on: boolean) => void;
  setSymmetry: (s: Symmetry) => void;
  /** Set `replaceBlock` from the block at a cell (the eyedropper). */
  sample: (cell: Cell) => void;
  move: (delta: Cell) => void;
  extrude: (axis: Axis, dir: 1 | -1) => void;
  transform: (xform: PropXform) => Promise<void>;
  placeAt: (cell: Cell) => Promise<void>;
  remove: () => void;
  replace: () => Promise<void>;
  stairs: () => Promise<void>;
  undo: () => void;
  redo: () => void;
  save: () => Promise<void>;
}

const editData = (s: StructureData): EditData => ({ size: s.size, palette: s.palette, blocks: s.blocks });
const snapshot = (s: StructureData): Snapshot => ({ blocks: s.blocks, palette: s.palette, textures: s.textures });
const nonAir = (r: OpResult): number => r.blocks.filter((b) => !r.palette[b.state]?.air).length;

export const editorStore = createStore<EditorState>((set, get) => {
  /** Apply an op result to the active doc: snapshot for undo, patch the structure
   *  (merging any new textures), update the selection. */
  const commit = (result: OpResult, extraTextures: string[] = []): void => {
    const doc = activeDocument(documentsStore.getState());
    if (!doc?.structure) return;
    const past = [...get().past, snapshot(doc.structure)].slice(-UNDO_CAP);
    const textures = extraTextures.length
      ? [...new Set([...doc.structure.textures, ...extraTextures])]
      : doc.structure.textures;
    documentsStore.getState().patchDoc(doc.id, {
      structure: { ...doc.structure, blocks: result.blocks, palette: result.palette, textures, blockCount: nonAir(result) },
    });
    set({ selection: result.selection, past, future: [], dirty: true });
  };

  const restore = (snap: Snapshot): void => {
    const doc = activeDocument(documentsStore.getState());
    if (!doc?.structure) return;
    const blockCount = snap.blocks.filter((b) => !snap.palette[b.state]?.air).length;
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
    placeBlock: 'minecraft:stone',
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

    setActive: (active) => set(active ? { active } : { active, selection: [], anchor: null, eyedropper: false }),
    setTool: (tool) => set({ tool }),
    clearSelection: () => set({ selection: [], anchor: null }),

    pick: (cell, mode) => {
      if (!cell) {
        set({ selection: [], anchor: null });
        return;
      }
      const key = `${cell[0]},${cell[1]},${cell[2]}`;
      if (mode === 'add') {
        const has = get().selection.includes(key);
        set({ selection: has ? get().selection.filter((k) => k !== key) : [...get().selection, key], anchor: key });
      } else if (mode === 'box' && get().anchor) {
        const doc = activeDocument(documentsStore.getState());
        if (doc?.structure) set({ selection: selectBox(editData(doc.structure), parseCell(get().anchor!), cell) });
      } else {
        set({ selection: [key], anchor: key });
      }
    },

    setReplaceBlock: (replaceBlock) => set({ replaceBlock }),
    setPlaceBlock: (placeBlock) => set({ placeBlock }),
    setStairsBlock: (stairsBlock) => set({ stairsBlock }),
    setStairsDir: (stairsDir) => set({ stairsDir }),
    setStairsSteps: (stairsSteps) => set({ stairsSteps: Math.max(1, Math.min(64, stairsSteps)) }),
    setExtrudeCount: (extrudeCount) => set({ extrudeCount: Math.max(1, Math.min(64, extrudeCount)) }),
    setExtrudeStep: (extrudeStep) => set({ extrudeStep: Math.max(1, Math.min(16, extrudeStep)) }),
    setEyedropper: (eyedropper) => set({ eyedropper }),
    setSymmetry: (symmetry) => set({ symmetry }),
    sample: (cell) => {
      const doc = activeDocument(documentsStore.getState());
      if (!doc?.structure) {
        set({ eyedropper: false });
        return;
      }
      const block = doc.structure.blocks.find((b) => cellKey(b.pos) === cellKey(cell));
      const entry = block ? doc.structure.palette[block.state] : undefined;
      set(entry && !entry.air ? { replaceBlock: entry.name, eyedropper: false } : { eyedropper: false });
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
      const placed = placements.map((pl) => ({ state: indexByCombo.get(combo(pl.name, pl.props))!, pos: pl.pos }));
      commit({ blocks: [...kept, ...placed], palette, selection: placed.map((p) => cellKey(p.pos)) }, extraTextures);
    },
    placeAt: async (cell) => {
      if (!activeDocument(documentsStore.getState())?.structure) return;
      const { entry, textures } = await api.resolveBlock(get().placeBlock);
      const sym = get().symmetry;
      // Live symmetry: also place the mirror, with its directional blockstate flipped.
      let mirror: { cell: Cell; entry: typeof entry; textures: string[] } | null = null;
      const symDoc = sym !== 'none' ? activeDocument(documentsStore.getState()) : null;
      if (symDoc?.structure && sym !== 'none') {
        const mc = mirrorCell(cell, sym, symDoc.structure.size);
        if (cellKey(mc) !== cellKey(cell)) {
          const mprops = (transformProps(entry.properties, { kind: 'mirror', axis: sym }) ?? {}) as Record<string, string>;
          const same = JSON.stringify(mprops) === JSON.stringify(entry.properties ?? {});
          const m = same ? { entry, textures: [] } : await api.resolveBlock(entry.name, mprops);
          mirror = { cell: mc, entry: m.entry, textures: m.textures };
        }
      }
      const cur = activeDocument(documentsStore.getState());
      if (!cur?.structure) return;
      if (!mirror) {
        commit(placeBlock(editData(cur.structure), cell, entry), textures);
        return;
      }
      // Place both blocks in one edit (one undo step).
      let palette = cur.structure.palette;
      const a = internEntry(palette, entry);
      palette = a.palette;
      const b = internEntry(palette, mirror.entry);
      palette = b.palette;
      const targets = new Set([cellKey(cell), cellKey(mirror.cell)]);
      const kept = cur.structure.blocks.filter((bl) => !targets.has(cellKey(bl.pos)));
      commit(
        {
          blocks: [...kept, { state: a.index, pos: cell }, { state: b.index, pos: mirror.cell }],
          palette,
          selection: [cellKey(cell), cellKey(mirror.cell)],
        },
        [...textures, ...mirror.textures],
      );
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
        sourcePath: doc.path,
        size: doc.structure.size,
        palette: doc.structure.palette.map((p) => ({ name: p.name, properties: p.properties })),
        blocks: doc.structure.blocks.map((b) => ({ state: b.state, pos: b.pos })),
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
