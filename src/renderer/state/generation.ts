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
import type { GenerateImage } from '@/shared/types';

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

/** Persistent chat key: the file path for a saved `.nbt`, else the session id. */
function chatKey(doc: Document): string {
  return doc.filePath ?? doc.sessionId;
}

/** Persist a document's current chat + session info so it survives restarts. */
function persist(docId: string): void {
  const doc = documentsStore.getState().documents.find((d) => d.id === docId);
  if (!doc) return;
  void api.chatHistorySave(chatKey(doc), {
    sessionId: doc.sessionId,
    sdkSessionId: doc.sdkSessionId,
    version: doc.version,
    messages: doc.chat,
    baselinePath: doc.baselinePath,
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
  const rec = await api.chatHistoryGet(chatKey(doc));
  if (rec && rec.messages.length > 0) {
    // Adopt the persisted session so a follow-up resumes the same conversation,
    // and surface its compiled versions (read from disk) in the Versions panel.
    // For a file-backed doc, prepend the untouched original as the "v0" baseline.
    const versions = await api.aiListVersions(rec.sessionId);
    const baseline = rec.baselinePath ?? doc.filePath;
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
      hydrated: true,
    });
    await api.aiPrimeSession(rec.sessionId, rec.sdkSessionId, rec.version);
  } else {
    docs.patchDoc(docId, { hydrated: true });
  }
}

/** Run a generation/edit for `docId` from `prompt` + staged image data URLs.
 *  Writes all results onto the document by id (not "active"), so it completes
 *  correctly even after the user switches tabs. */
export async function runGeneration(
  docId: string,
  prompt: string,
  imageUrls: string[],
): Promise<void> {
  const docs = documentsStore.getState();
  const doc = docs.documents.find((d) => d.id === docId);
  if (!doc || doc.busy) return;

  // Reference images can't ride a string prompt; split the data-URL prefix so
  // main forwards just the base64 payload + media type to the model.
  const images: GenerateImage[] = imageUrls.map((url) => {
    const [head, data] = url.split(',');
    return { mediaType: head.slice(5, head.indexOf(';')), data };
  });
  const promptText = prompt || 'Build a Minecraft structure based on the reference image(s).';

  docs.appendChat(docId, { role: 'user', text: prompt, images: imageUrls.length ? imageUrls : undefined });
  docs.patchDoc(docId, { busy: true, startedAt: Date.now(), progress: null });
  persist(docId);

  // Seed the model with the structure this tab already has open so a first
  // "change X" edits it rather than building anew (main ignores its own outputs).
  const basePath = doc.path ?? undefined;
  try {
    const result = await api.aiGenerate(doc.sessionId, promptText, images, basePath);
    if (result.ok) {
      docs.appendChat(docId, {
        role: 'assistant',
        text: result.summary || 'Structure generated.',
        meta: {
          version: result.version,
          size: result.size,
          blockCount: result.blockCount,
          tookMs: doc.startedAt ? Date.now() - doc.startedAt : undefined,
        },
      });
      docs.patchDoc(docId, { sdkSessionId: result.sdkSessionId, version: result.version });
      // Record the final version (live renders already recorded intermediate ones)
      // and always show the latest. First version frames the build; later versions
      // keep the camera so the user sees exactly what changed.
      recordVersion(docId, result.version, result.path);
      await docLoader?.(docId, result.path, { preserveCamera: result.version > 1, recent: false });
    } else if (result.canceled) {
      docs.appendChat(docId, { role: 'assistant', text: 'Canceled.' });
    } else {
      docs.appendChat(docId, { role: 'assistant', text: result.error, error: true });
    }
  } catch (err) {
    docs.appendChat(docId, { role: 'assistant', text: String(err), error: true });
  } finally {
    documentsStore.getState().patchDoc(docId, { busy: false, progress: null, startedAt: null });
    persist(docId);
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
  });
  // For a file-backed doc the chat key (its path) is unchanged, so overwrite its
  // record empty; an Untitled doc's key just moves to the new session id.
  void api.chatHistorySave(doc.filePath ?? sessionId, {
    sessionId,
    sdkSessionId: null,
    version: 0,
    messages: [],
    baselinePath: null,
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
  });
}
