// Per-tab AI generation, driven outside React so a build keeps running (and
// keeps updating its tab's chat/progress) when the user switches tabs. Each
// document has its own AI session id, so generations in different tabs run
// independently and simultaneously. This module owns the async flow; the chat
// panel (NewStructurePanel) is just a view over the active document's state.
//
// Chat history is persisted per NBT (keyed by file path, or the session id for
// an Untitled build) via the main-process store, so reopening a file restores
// its conversation and the SDK session can resume.
import { api } from '../api';
import { documentsStore, docBySession, type Document } from './documents';
import type { GenerateImage, BuildSelection, BuildBrief } from '@/shared/types';
import { basename, dirname } from '../ui/path';
import { buildFloorPlan, normalizeFloor } from '../generation/floors';

export { buildFloorPlan, normalizeFloor };

/** Load a generated/opened `.nbt` into a document — and the on-screen viewer if
 *  it's the active tab. Provided by App, which owns the viewers.
 *  `working` (default true) updates the doc's working path (the edit base for the
 *  next AI turn); pass false to *preview* a version in the viewer without changing
 *  what the next edit builds on. */
export type DocLoader = (
  docId: string,
  path: string,
  opts?: { preserveCamera?: boolean; recent?: boolean; working?: boolean },
) => Promise<void>;

let docLoader: DocLoader | null = null;
export function setDocLoader(fn: DocLoader): void {
  docLoader = fn;
}

/** Open a saved `.nbt` as a document/tab and render it — same path as File ▸ Open.
 *  Provided by App (which owns the document flow); used by the chat build card's
 *  "Open" action to load a finished build's library file into the viewer. */
let fileOpener: ((path: string) => void) | null = null;
export function setFileOpener(fn: (path: string) => void): void {
  fileOpener = fn;
}
export function openLibraryFile(path: string): void {
  fileOpener?.(path);
}

/** Persistent chat key: the file path for a saved `.nbt`, else the session id. */
function chatKey(doc: Document): string {
  return doc.filePath ?? doc.sessionId;
}

/** AI-generated versions live on disk at `<generatedRoot>/<sessionId>/vN.nbt`, so
 *  the parent directory name IS the session id. If the user reopens such a temp
 *  version file directly (e.g. dragging it in), recover that session id from the
 *  path so its chat/version history can be restored. Returns null for any path
 *  that doesn't look like a generated version file. The recovered id is only
 *  trusted once a stored chat record is found for it (in hydrateDoc). */
function recoverGeneratedSession(filePath: string): string | null {
  if (!/^v\d+\.nbt$/i.test(basename(filePath))) return null;
  const sessionDir = dirname(filePath);
  const root = basename(dirname(sessionDir));
  if (root !== 'generated' && root !== '.generated') return null;
  return basename(sessionDir) || null;
}

/** Persist a document's current chat + session info so it survives restarts. */
export function persistDoc(docId: string): void {
  const doc = documentsStore.getState().documents.find((d) => d.id === docId);
  if (!doc) return;
  void api.chatHistorySave(chatKey(doc), {
    sessionId: doc.sessionId,
    sdkSessionId: doc.sdkSessionId,
    version: doc.version,
    messages: doc.chat,
    baselinePath: doc.baselinePath,
    floors: doc.floors,
  });
}

/** Record a compiled version on the document (deduped by number) and mark it as
 *  the one being shown — so the viewer always follows the latest build as it's
 *  emitted. Called for every version the generator renders (live + final). */
export function recordVersion(docId: string, version: number, path: string): void {
  const docs = documentsStore.getState();
  const doc = docs.documents.find((d) => d.id === docId);
  if (!doc) return;
  const entries = [...doc.versions.filter((v) => v.version !== version), { version, path }];
  // For a file-backed doc (an EDIT of an existing .nbt, not a from-scratch
  // creation) keep the original as a baseline "v0" the user can flip back to.
  // That baseline is the untouched on-disk file by default, or — after "Clear
  // versions" flattened the build — the iterated build it pinned (baselinePath).
  // Untitled (created) docs have no original, so they get none.
  const baseline = doc.baselinePath ?? doc.filePath;
  if (baseline && !entries.some((v) => v.version === 0)) {
    entries.push({ version: 0, path: baseline });
  }
  const versions = entries.sort((a, b) => a.version - b.version);
  docs.patchDoc(docId, { versions, viewingVersion: version });
}

/** Preview a version in the viewer for visualization only — loads `vN.nbt` into
 *  the active viewer (and the doc's structure, so the inspector matches) WITHOUT
 *  touching the working path, so the next AI edit still builds on the latest. */
export async function viewVersion(docId: string, version: number): Promise<void> {
  const doc = documentsStore.getState().documents.find((d) => d.id === docId);
  if (!doc) return;
  const entry = doc.versions.find((v) => v.version === version);
  if (!entry) return;
  documentsStore.getState().patchDoc(docId, { viewingVersion: version });
  await docLoader?.(docId, entry.path, { preserveCamera: true, recent: false, working: false });
}

let progressBound = false;
/** Bind the single global progress listener once; routes each update to the
 *  document running that session (so a background tab updates its own spinner). */
export function bindGenerationProgress(): void {
  if (progressBound) return;
  progressBound = true;
  api.onAiProgress((p) => {
    const doc = docBySession(p.sessionId);
    if (doc) documentsStore.getState().patchDoc(doc.id, { progress: p });
  });
}

/** Restore a document's persisted chat history (and prime the SDK session for
 *  resume). Safe to call repeatedly — it only hydrates once per doc. */
export async function hydrateDoc(docId: string): Promise<void> {
  const docs = documentsStore.getState();
  const doc = docs.documents.find((d) => d.id === docId);
  if (!doc || doc.hydrated) return;
  let rec = await api.chatHistoryGet(chatKey(doc));
  // The doc was opened as a file but its history is keyed by the original session
  // id. Reopening a generated temp version directly (its parent dir = the session
  // id) lands here with `filePath` set and no record under that path; recover the
  // session and adopt it so chat/versions come back. Drop the temp `filePath` so
  // the doc behaves as the original Untitled session (chat keyed by session id,
  // edits continue the same conversation, no on-disk "v0" baseline).
  let dropFilePath = false;
  if ((!rec || rec.messages.length === 0) && doc.filePath) {
    const sid = recoverGeneratedSession(doc.filePath);
    const recovered = sid ? await api.chatHistoryGet(sid) : null;
    if (recovered && recovered.messages.length > 0) {
      rec = recovered;
      dropFilePath = true;
    }
  }
  if (rec && rec.messages.length > 0) {
    // Adopt the persisted session so a follow-up resumes the same conversation,
    // and surface its compiled versions (read from disk) in the Versions panel.
    // For a file-backed doc, prepend the untouched original as the "v0" baseline.
    const versions = await api.aiListVersions(rec.sessionId);
    const baseline = rec.baselinePath ?? (dropFilePath ? null : doc.filePath);
    if (baseline && versions.length > 0 && !versions.some((v) => v.version === 0)) {
      versions.unshift({ version: 0, path: baseline });
    }
    docs.patchDoc(docId, {
      sessionId: rec.sessionId,
      sdkSessionId: rec.sdkSessionId,
      version: rec.version,
      versions,
      viewingVersion: null,
      chat: rec.messages,
      baselinePath: rec.baselinePath ?? null,
      floors: (rec.floors ?? []).map(normalizeFloor),
      hydrated: true,
      ...(dropFilePath ? { filePath: null } : {}),
    });
    await api.aiPrimeSession(rec.sessionId, rec.sdkSessionId, rec.version);
  } else {
    docs.patchDoc(docId, { hydrated: true });
  }
}

/** Inputs to a generation/edit turn. The AI prompt is kept SEPARATE from what the chat
 *  shows: `aiPrompt` (the user's words + the composer's plain-language brief) goes to the
 *  model, while the chat renders only `userText` plus a presentable `build` card — so the
 *  long "[Build details]" block never appears as a wall of text in the transcript. */
export interface GenerationInput {
  /** Full prompt sent to the model: the user's words plus the composer brief (if any). */
  aiPrompt: string;
  /** The user's raw words, shown in the chat bubble (may be '' for a details-only build). */
  userText: string;
  /** Structured build details for the chat card (omitted when nothing was picked). */
  build?: BuildBrief;
  /** Staged reference image data URLs. */
  imageUrls: string[];
  /** The structured module selection (drives knowledge-guide loading). */
  selection?: BuildSelection;
}

/**
 * Run a generation/edit for a document. Writes all results onto the document BY ID (not
 * "active"), so it completes correctly even after the user switches tabs.
 *
 * @param docId - The document whose AI session this turn runs against.
 * @param input - The turn inputs (see {@link GenerationInput}): the model prompt kept
 *   separate from the chat text + build card, plus staged images and the module selection.
 * @returns Resolves when the turn finishes (success, cancel, or error) and the result has
 *   been appended to the document's chat — it never rejects (errors land in the transcript).
 */
export async function runGeneration(docId: string, input: GenerationInput): Promise<void> {
  const docs = documentsStore.getState();
  const doc = docs.documents.find((d) => d.id === docId);
  if (!doc || doc.busy) return;

  const { aiPrompt, userText, build, imageUrls, selection } = input;
  // Reference images can't ride a string prompt; split the data-URL prefix so
  // main forwards just the base64 payload + media type to the model.
  const images: GenerateImage[] = imageUrls.map((url) => {
    const [head, data] = url.split(',');
    return { mediaType: head.slice(5, head.indexOf(';')), data };
  });
  // The user's floor plan rides along as context on every turn (so a follow-up
  // like "redo the basement" knows which y range that is), but it stays out of
  // the visible transcript — only the user's words + the build card are shown.
  const promptText =
    (aiPrompt || 'Build a Minecraft structure based on the reference image(s).') +
    buildFloorPlan(doc.floors);

  // Track the start locally: patchDoc replaces the doc object immutably, so the
  // `doc` captured above keeps its old startedAt — read the elapsed time from this.
  const startedAt = Date.now();
  docs.appendChat(docId, {
    role: 'user',
    text: userText,
    images: imageUrls.length ? imageUrls : undefined,
    build,
  });
  docs.patchDoc(docId, { busy: true, startedAt, progress: null });
  persistDoc(docId);

  // The run's cost footer (time + tokens), attached to the assistant message on
  // every outcome — success, cancel, or error — so it's never omitted.
  const stats = (r: { tokensIn?: number; tokensOut?: number }) => ({
    tookMs: Date.now() - startedAt,
    tokensIn: r.tokensIn,
    tokensOut: r.tokensOut,
  });

  // Seed the model with the structure this tab already has open so a first
  // "change X" edits it rather than building anew (main ignores its own outputs).
  const basePath = doc.path ?? undefined;
  try {
    // The user's Floor plan rides along structured (not just as prompt text): main
    // uses it to locate the ground-floor level for the air-fill, overriding the
    // storeys the model declared. Normalize so legacy {y} records carry from/to.
    const floors = doc.floors.map(normalizeFloor);
    const result = await api.aiGenerate(doc.sessionId, promptText, images, selection, basePath, floors);
    if (result.ok) {
      // The COMPLETE build card: the user's request (the picked module summary, if
      // any) plus the finished result (version/size/blocks) and the saved library
      // file for the Open/Reveal actions. Shown even for a plain prompt (no Details).
      const resultBuild: BuildBrief = {
        ...(build ?? {}),
        prompt: userText || undefined,
        version: result.version,
        size: result.size,
        blockCount: result.blockCount,
        libraryPath: result.libraryPath ?? undefined,
      };
      docs.appendChat(docId, {
        role: 'assistant',
        text: result.summary || 'Structure generated.',
        build: resultBuild,
        // The card carries version/size/blocks now; meta keeps just the run cost.
        meta: stats(result),
      });
      docs.patchDoc(docId, { sdkSessionId: result.sdkSessionId, version: result.version });
      // Record the final version (live renders already recorded intermediate ones)
      // and always show the latest. First version frames the build; later versions
      // keep the camera so the user sees exactly what changed.
      recordVersion(docId, result.version, result.path);
      await docLoader?.(docId, result.path, { preserveCamera: result.version > 1, recent: false });
    } else if (result.canceled) {
      docs.appendChat(docId, { role: 'assistant', text: 'Canceled.', meta: stats(result) });
    } else {
      docs.appendChat(docId, { role: 'assistant', text: result.error, error: true, meta: stats(result) });
    }
  } catch (err) {
    docs.appendChat(docId, { role: 'assistant', text: String(err), error: true, meta: { tookMs: Date.now() - startedAt } });
  } finally {
    documentsStore.getState().patchDoc(docId, { busy: false, progress: null, startedAt: null });
    persistDoc(docId);
  }
}

/** Cancel the in-flight generation for a document's session. */
export function cancelGeneration(docId: string): void {
  const doc = documentsStore.getState().documents.find((d) => d.id === docId);
  if (doc) void api.aiCancel(doc.sessionId);
}

/** Clear a document's chat + start a fresh AI session (the "New" button). */
export function resetDocChat(docId: string): void {
  const docs = documentsStore.getState();
  const doc = docs.documents.find((d) => d.id === docId);
  if (!doc) return;
  void api.aiResetSession(doc.sessionId);
  const sessionId = crypto.randomUUID();
  docs.patchDoc(docId, {
    sessionId,
    sdkSessionId: null,
    version: 0,
    versions: [],
    viewingVersion: null,
    chat: [],
    baselinePath: null, // back to the on-disk file as the source
    floors: [], // a fresh build starts with no floor plan
  });
  // For a file-backed doc the chat key (its path) is unchanged, so overwrite its
  // record empty; an Untitled doc's key just moves to the new session id.
  void api.chatHistorySave(doc.filePath ?? sessionId, {
    sessionId,
    sdkSessionId: null,
    version: 0,
    messages: [],
    baselinePath: null,
    floors: [],
  });
}

/** Clear a document's version history + chat and adopt the CURRENT build as a
 *  fresh "original". Unlike "New" (resetDocChat), which keeps the untouched
 *  on-disk file as the source, this pins the build you've iterated to
 *  (`doc.path`) as the new baseline: it starts a fresh AI session, empties the
 *  chat and versions list, and leaves that build in the viewer so the next edit
 *  builds on it from a clean slate. */
export function clearVersioning(docId: string): void {
  const docs = documentsStore.getState();
  const doc = docs.documents.find((d) => d.id === docId);
  if (!doc) return;
  void api.aiResetSession(doc.sessionId);
  const sessionId = crypto.randomUUID();
  // The current build becomes the new baseline. For a file-backed doc that means
  // the edited build supersedes the on-disk file as the "Original" the version
  // chain hangs off; fall back to the prior baseline / file if nothing is loaded.
  const baselinePath = doc.path ?? doc.baselinePath ?? doc.filePath;
  docs.patchDoc(docId, {
    sessionId,
    sdkSessionId: null,
    version: 0,
    versions: [],
    viewingVersion: null,
    chat: [],
    baselinePath,
  });
  void api.chatHistorySave(doc.filePath ?? sessionId, {
    sessionId,
    sdkSessionId: null,
    version: 0,
    messages: [],
    baselinePath,
    floors: doc.floors, // the build is kept, so keep its floor plan
  });
}
