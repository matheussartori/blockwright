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
import {
  buildStairs,
  deleteSelection,
  extrudeSelection,
  HORIZONTALS,
  moveSelection,
  parseCell,
  replaceSelection,
  selectBox,
  type Axis,
  type Cell,
  type EditData,
  type Horizontal,
  type OpResult,
} from '../editor/ops';

export type Tool = 'select' | 'move' | 'extrude' | 'stairs' | 'replace' | 'delete';

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
  stairsBlock: string;
  stairsDir: Horizontal;
  stairsSteps: number;
  extrudeCount: number;
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
  setStairsBlock: (id: string) => void;
  setStairsDir: (dir: Horizontal) => void;
  setStairsSteps: (n: number) => void;
  setExtrudeCount: (n: number) => void;
  move: (delta: Cell) => void;
  extrude: (axis: Axis, dir: 1 | -1) => void;
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

  return {
    active: false,
    tool: 'select',
    selection: [],
    anchor: null,
    replaceBlock: 'minecraft:stone',
    stairsBlock: 'minecraft:oak_stairs',
    stairsDir: 'east',
    stairsSteps: 4,
    extrudeCount: 3,
    dirty: false,
    saving: false,
    past: [],
    future: [],

    setActive: (active) => set(active ? { active } : { active, selection: [], anchor: null }),
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
    setStairsBlock: (stairsBlock) => set({ stairsBlock }),
    setStairsDir: (stairsDir) => set({ stairsDir }),
    setStairsSteps: (stairsSteps) => set({ stairsSteps: Math.max(1, Math.min(64, stairsSteps)) }),
    setExtrudeCount: (extrudeCount) => set({ extrudeCount: Math.max(1, Math.min(64, extrudeCount)) }),

    move: (delta) => {
      const doc = activeDocument(documentsStore.getState());
      if (!doc?.structure || !get().selection.length) return;
      commit(moveSelection(editData(doc.structure), get().selection, delta));
    },
    extrude: (axis, dir) => {
      const doc = activeDocument(documentsStore.getState());
      if (!doc?.structure || !get().selection.length) return;
      commit(extrudeSelection(editData(doc.structure), get().selection, axis, dir * get().extrudeCount));
    },
    remove: () => {
      const doc = activeDocument(documentsStore.getState());
      if (!doc?.structure || !get().selection.length) return;
      commit(deleteSelection(editData(doc.structure), get().selection));
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
