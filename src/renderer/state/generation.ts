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
import { documentsStore, docBySession } from './documents';
import type { GenerateImage, BuildSelection, BuildBrief } from '@/shared/types';
import { basename, dirname } from '../ui/path';
import { buildFloorPlan, normalizeFloor } from '../generation/floors';
import { loadDoc } from './doc-loader';
import { chatKey, persistDoc } from './persist';
import { recordVersion, currentBasePath } from './versions';

export { buildFloorPlan, normalizeFloor };

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
    // A `generated` doc's `filePath` is its own latest build (the adopted library
    // file), so it gets no v0 baseline — only a real opened file does.
    const baseline = rec.generated ? rec.baselinePath : (rec.baselinePath ?? (dropFilePath ? null : doc.filePath));
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
      generated: rec.generated ?? false,
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

  // Seed the model with the CURRENT version this tab is based on (a promoted older
  // version, else the latest) so a first "change X" edits that build; main detects a
  // promoted-older base as a rebase and branches from it. Falls back to the working
  // path for a fresh file/Untitled build with no compiled versions yet.
  const basePath = currentBasePath(doc) ?? undefined;
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
        fixes: result.fixes.length ? result.fixes : undefined,
      };
      docs.appendChat(docId, {
        role: 'assistant',
        text: result.summary || 'Structure generated.',
        build: resultBuild,
        // The card carries version/size/blocks now; meta keeps just the run cost.
        meta: stats(result),
      });
      // The fresh build is the new base — clear any "Current" pin so it follows latest.
      docs.patchDoc(docId, { sdkSessionId: result.sdkSessionId, version: result.version, currentVersion: null });
      // Record the final version (live renders already recorded intermediate ones)
      // and always show the latest. First version frames the build; later versions
      // keep the camera so the user sees exactly what changed.
      recordVersion(docId, result.version, result.path);
      // A from-scratch build ADOPTS its saved library file: the tab stops being
      // "Untitled" and becomes the project — named after the library file and keyed
      // by its path — so closing it and reopening that `.nbt` (with its sibling
      // generation.log + versions/) restores this whole conversation. We only adopt
      // once (when there's no filePath yet); an edit of an opened file is untouched.
      if (!doc.filePath && result.libraryPath) {
        docs.patchDoc(docId, {
          filePath: result.libraryPath,
          title: basename(result.libraryPath),
          generated: true,
        });
        // It's a real saved project now — surface it in Open Recent / the welcome list.
        api.addRecent(result.libraryPath);
      }
      await loadDoc(docId, result.path, { preserveCamera: result.version > 1, recent: false });
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

