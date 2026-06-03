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
 *  it's the active tab. Provided by App, which owns the viewers. */
export type DocLoader = (
  docId: string,
  path: string,
  opts?: { preserveCamera?: boolean; recent?: boolean },
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
  });
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
    // Adopt the persisted session so a follow-up resumes the same conversation.
    docs.patchDoc(docId, {
      sessionId: rec.sessionId,
      sdkSessionId: rec.sdkSessionId,
      version: rec.version,
      chat: rec.messages,
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
      // First version frames the build; later versions keep the camera so the
      // user sees exactly what changed.
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
  docs.patchDoc(docId, { sessionId, sdkSessionId: null, version: 0, chat: [] });
  // For a file-backed doc the chat key (its path) is unchanged, so overwrite its
  // record empty; an Untitled doc's key just moves to the new session id.
  void api.chatHistorySave(doc.filePath ?? sessionId, {
    sessionId,
    sdkSessionId: null,
    version: 0,
    messages: [],
  });
}
