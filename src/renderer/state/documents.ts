// Multi-document (tabbed) state. Each open `.nbt` — a real file or an AI
// "Untitled" scratch build — is one Document with its OWN structure, loading
// flag, AI session, chat history and in-flight generation state. This is what
// makes tabs work: the renderer used to hold a single `structure` in store.ts;
// now that lives per-document here, and the on-screen viewer follows the active
// doc. Generation state lives on the document (not in the chat component) so a
// build keeps running — and keeps its progress/chat — when you switch tabs.
//
// Like the other renderer stores this is a framework-agnostic Zustand vanilla
// store, consumed in components via the `useDocuments` / `useActiveDoc` hooks.
import { createStore } from 'zustand/vanilla';
import type { StructureData, GenerateProgress, ChatMessage, VersionInfo, FloorDef, WorldMeta } from '@/shared/types';
import { basename } from '../ui/path';

/** One message in a document's AI chat transcript. Same shape the composer shows
 *  and the persisted chat history (main/chat-history.ts) stores. */
export type DocChatMessage = ChatMessage;

export interface Document {
  /** What this tab holds: a single structure (the default), or a streamed Minecraft WORLD (the
   *  world viewer — view-only fly-through; no AI/edit/versions apply). */
  kind: 'structure' | 'world';
  /** For a world doc: the opened world's meta (root/name/dims/spawn/…); null for a structure doc. */
  worldMeta: WorldMeta | null;
  /** Stable tab id (distinct from the AI session id). */
  id: string;
  /** AI generation session id; also the chat-history key for Untitled docs. */
  sessionId: string;
  /** Tab label: the file basename, or "Untitled" for a fresh scratch build. */
  title: string;
  /** The user's real `.nbt` on disk, or null for an Untitled (generate-only) doc.
   *  Used as the persistent chat-history key. */
  filePath: string | null;
  /** Last-rendered `.nbt` — a real file OR a temp generated `vN.nbt`. Seeds the
   *  next edit (basePath) and is what the viewer shows. */
  path: string | null;
  structure: StructureData | null;
  loading: boolean;
  /** True while a generation is in flight for this doc's session. */
  busy: boolean;
  progress: GenerateProgress | null;
  /** Wall-clock start of the in-flight generation, for the elapsed timer. */
  startedAt: number | null;
  chat: DocChatMessage[];
  /** SDK conversation id of the last generation (persisted for resume), or null. */
  sdkSessionId: string | null;
  /** Latest emitted version number in this session (0 before any build). */
  version: number;
  /** Every compiled version of this session's build (`vN.nbt`), ascending — the
   *  Versions panel lists these so the user can flip between earlier builds for
   *  viewing. Empty for a file-backed doc with no generation history. */
  versions: VersionInfo[];
  /** Which version is currently shown in the viewer, or null when showing the
   *  working/latest structure. Set only while the user is previewing an earlier
   *  build (editing always continues from the latest). */
  viewingVersion: number | null;
  /** The "Current" version — the base every export, manual save and AI edit builds
   *  on (the user promotes one via "Set as Current" in the Versions panel). null
   *  means "follow the latest", and any new commit resets it to null. Distinct from
   *  `viewingVersion`, which is purely what's on screen. */
  currentVersion: number | null;
  /** Overrides `filePath` as the "Original" baseline of the version chain. Set by
   *  "Clear versions", which flattens the build you've iterated to into a fresh
   *  starting point: the current `.nbt` (not the untouched on-disk file) becomes
   *  the v0 the next edit builds on. null = use `filePath` (the default). */
  baselinePath: string | null;
  /** Named vertical levels the user defined for this build (the "floor plan"):
   *  folded into every AI prompt as context, and previewable as a plane in the
   *  viewer. Persisted with the chat history; empty by default. */
  floors: FloorDef[];
  /** True once persisted chat history (if any) has been loaded for this doc. */
  hydrated: boolean;
  /** True for a from-scratch AI build that has ADOPTED its saved library `.nbt` as
   *  `filePath` (so the tab is the project, named after it, and reopening that file
   *  restores this conversation). Unlike a real opened file, its `filePath` is the
   *  generated output itself — not an "Original" — so the version chain gets no v0. */
  generated: boolean;
}

export interface DocumentsState {
  documents: Document[];
  /** Id of the focused tab, or null when none are open (welcome screen). */
  activeId: string | null;

  /** Create a blank "Untitled" generate tab and focus it; returns its id. */
  newDoc: () => string;
  /** Focus the tab for `filePath` if open, else create one (loading is the
   *  caller's job). Returns the doc id. */
  openDoc: (filePath: string) => string;
  /** Focus the tab for this world (by root) if open, else create a world doc. Returns the doc id. */
  openWorldDoc: (meta: WorldMeta) => string;
  closeDoc: (id: string) => void;
  setActive: (id: string) => void;
  /** Deselect every tab and return to the Home screen (tabs stay open). */
  goHome: () => void;
  /** Shallow-merge `partial` into the doc with `id` (no-op if it's gone). */
  patchDoc: (id: string, partial: Partial<Document>) => void;
  appendChat: (id: string, msg: DocChatMessage) => void;
  setChat: (id: string, chat: DocChatMessage[]) => void;
  /** Replace a document's floor-plan levels. */
  setFloors: (id: string, floors: FloorDef[]) => void;
}

function freshDoc(over: Partial<Document> = {}): Document {
  return {
    kind: 'structure',
    worldMeta: null,
    id: crypto.randomUUID(),
    sessionId: crypto.randomUUID(),
    title: 'Untitled',
    filePath: null,
    path: null,
    structure: null,
    loading: false,
    busy: false,
    progress: null,
    startedAt: null,
    chat: [],
    sdkSessionId: null,
    version: 0,
    versions: [],
    viewingVersion: null,
    currentVersion: null,
    baselinePath: null,
    floors: [],
    hydrated: false,
    generated: false,
    ...over,
  };
}

export const documentsStore = createStore<DocumentsState>((set, get) => ({
  documents: [],
  activeId: null,

  newDoc: () => {
    const doc = freshDoc();
    set((s) => ({ documents: [...s.documents, doc], activeId: doc.id }));
    return doc.id;
  },

  openDoc: (filePath) => {
    const existing = get().documents.find((d) => d.filePath === filePath);
    if (existing) {
      set({ activeId: existing.id });
      return existing.id;
    }
    const doc = freshDoc({ filePath, title: basename(filePath) });
    set((s) => ({ documents: [...s.documents, doc], activeId: doc.id }));
    return doc.id;
  },

  openWorldDoc: (meta) => {
    const existing = get().documents.find((d) => d.kind === 'world' && d.worldMeta?.root === meta.root);
    if (existing) {
      // Refresh the meta (spawn/player may have moved) and focus it.
      set((s) => ({
        documents: s.documents.map((d) => (d.id === existing.id ? { ...d, worldMeta: meta } : d)),
        activeId: existing.id,
      }));
      return existing.id;
    }
    const doc = freshDoc({ kind: 'world', worldMeta: meta, title: meta.name });
    set((s) => ({ documents: [...s.documents, doc], activeId: doc.id }));
    return doc.id;
  },

  closeDoc: (id) =>
    set((s) => {
      const idx = s.documents.findIndex((d) => d.id === id);
      if (idx === -1) return s;
      const documents = s.documents.filter((d) => d.id !== id);
      let activeId = s.activeId;
      if (activeId === id) {
        // Focus the neighbour to the right, else the left, else nothing.
        const next = documents[idx] ?? documents[idx - 1] ?? null;
        activeId = next ? next.id : null;
      }
      return { documents, activeId };
    }),

  setActive: (id) => set({ activeId: id }),

  goHome: () => set({ activeId: null }),

  patchDoc: (id, partial) =>
    set((s) => ({
      documents: s.documents.map((d) => (d.id === id ? { ...d, ...partial } : d)),
    })),

  appendChat: (id, msg) =>
    set((s) => ({
      documents: s.documents.map((d) => (d.id === id ? { ...d, chat: [...d.chat, msg] } : d)),
    })),

  setChat: (id, chat) =>
    set((s) => ({
      documents: s.documents.map((d) => (d.id === id ? { ...d, chat } : d)),
    })),

  setFloors: (id, floors) =>
    set((s) => ({
      documents: s.documents.map((d) => (d.id === id ? { ...d, floors } : d)),
    })),
}));

/** The currently focused document, or null on the welcome screen. */
export function activeDocument(s: DocumentsState): Document | null {
  return s.documents.find((d) => d.id === s.activeId) ?? null;
}

/** Find the document running a given AI session (for routing progress / renders
 *  to the right tab, even when it's not the active one). */
export function docBySession(sessionId: string): Document | null {
  return documentsStore.getState().documents.find((d) => d.sessionId === sessionId) ?? null;
}
