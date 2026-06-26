// The VERSION CHAIN of a document: the compiled `vN.nbt` builds the AI loop + the block editor
// produce, the "Current" pointer (the base every export, manual save and AI edit builds on),
// and the preview/promote/delete ops over them. One module so the Versions panel, the
// exporters, the editor and the generation loop share the same version logic — instead of it
// being tangled into the run orchestration.
import { api } from '../api';
import { documentsStore, type Document } from './documents';
import type { VersionInfo } from '@/shared/types';
import { basename } from '../ui/path';
import { loadDoc } from './doc-loader';
import { persistDoc } from './persist';

/** Record a compiled version on the document (deduped by number) and mark it as the one being
 *  shown — so the viewer always follows the latest build as it's emitted. Called for every
 *  version the generator renders (live + final). */
export function recordVersion(docId: string, version: number, path: string): void {
  const docs = documentsStore.getState();
  const doc = docs.documents.find((d) => d.id === docId);
  if (!doc) return;
  // Stamp created/modified so the dates show in the Versions panel for THIS session's builds
  // too (not only after a reopen, when listVersions stats them off disk). Keep the original
  // creation time when a later emit of the same run re-records this version.
  const now = Date.now();
  const prior = doc.versions.find((v) => v.version === version);
  const entry: VersionInfo = { version, path, createdAt: prior?.createdAt ?? now, modifiedAt: now };
  const entries = [...doc.versions.filter((v) => v.version !== version), entry];
  // For a file-backed doc (an EDIT of an existing .nbt, not a from-scratch creation) keep the
  // original as a baseline "v0" the user can flip back to. That baseline is the untouched
  // on-disk file by default, or — after "Clear versions" flattened the build — the iterated
  // build it pinned (baselinePath). Untitled (created) docs have no original, so they get none
  // — and a `generated` doc's `filePath` IS its own latest build (the adopted library file),
  // not an original, so it gets none either.
  const baseline = doc.generated ? doc.baselinePath : (doc.baselinePath ?? doc.filePath);
  if (baseline && !entries.some((v) => v.version === 0)) {
    entries.push({ version: 0, path: baseline });
  }
  const versions = entries.sort((a, b) => a.version - b.version);
  docs.patchDoc(docId, { versions, viewingVersion: version });
}

/** The version entry the next export, manual save and AI edit builds on: the promoted
 *  "Current" version, else the latest. Null when the doc has no compiled versions yet (a fresh
 *  file/Untitled build → callers fall back to the working `path`). */
export function currentBaseEntry(doc: Document): VersionInfo | null {
  const target = doc.currentVersion ?? doc.version;
  return doc.versions.find((v) => v.version === target) ?? null;
}

/** The on-disk file the next export/save/AI edit builds on: the Current version's path, else
 *  the doc's working path. The one resolution every base-consuming call site shares. */
export function currentBasePath(doc: Document): string | null {
  return currentBaseEntry(doc)?.path ?? doc.path;
}

/** Promote a version to "Current" — the base every export/save/AI edit builds on — and preview
 *  it in the viewer so the on-screen build matches the promoted base. */
export async function setCurrentVersion(docId: string, version: number): Promise<void> {
  const doc = documentsStore.getState().documents.find((d) => d.id === docId);
  if (!doc) return;
  documentsStore.getState().patchDoc(docId, { currentVersion: version });
  await viewVersion(docId, version);
  persistDoc(docId);
}

/** Preview a version in the viewer for visualization only — loads `vN.nbt` into the active
 *  viewer (and the doc's structure, so the inspector matches) WITHOUT touching the working
 *  path, so the next AI edit still builds on the latest. */
export async function viewVersion(docId: string, version: number): Promise<void> {
  const doc = documentsStore.getState().documents.find((d) => d.id === docId);
  if (!doc) return;
  const entry = doc.versions.find((v) => v.version === version);
  if (!entry) return;
  documentsStore.getState().patchDoc(docId, { viewingVersion: version });
  await loadDoc(docId, entry.path, { preserveCamera: true, recent: false, working: false });
}

/** Delete a compiled version from the document + disk. Refuses the Current version (the live
 *  edit base), the latest/HEAD version (the seed + patch base for the next run), and the
 *  synthetic v0 baseline. If the deleted version was on screen, falls back to the Current base. */
export async function deleteVersionEntry(docId: string, version: number): Promise<void> {
  const before = documentsStore.getState().documents.find((d) => d.id === docId);
  if (!before || before.busy) return;
  const current = before.currentVersion ?? before.version;
  if (version === current || version === before.version || version === 0) return;
  await api.aiDeleteVersion(before.sessionId, version);
  // Re-read AFTER the await so two quick deletes don't each filter a stale snapshot (the second
  // patch would otherwise resurrect the first's removed entry as a dangling row).
  const docs = documentsStore.getState();
  const doc = docs.documents.find((d) => d.id === docId);
  if (!doc) return;
  const versions = doc.versions.filter((v) => v.version !== version);
  const wasViewing = doc.viewingVersion === version;
  docs.patchDoc(docId, { versions, ...(wasViewing ? { viewingVersion: null } : {}) });
  if (wasViewing) {
    // Snap the viewer back to the Current base so it doesn't keep showing a gone build.
    const base = versions.find((v) => v.version === (doc.currentVersion ?? doc.version));
    if (base) await viewVersion(docId, base.version);
  }
  persistDoc(docId);
}

/** Commit a manually-edited build (from the block editor) as a new version: record it, adopt
 *  the saved library file if this was an Untitled doc, then load it as the working latest — the
 *  same finish an AI-emitted version goes through. */
export async function commitManualVersion(
  docId: string,
  version: number,
  scratchPath: string,
  libraryPath: string | null,
): Promise<void> {
  const docs = documentsStore.getState();
  const doc = docs.documents.find((d) => d.id === docId);
  if (!doc) return;
  recordVersion(docId, version, scratchPath);
  // A new commit becomes the base: drop any "Current" pin so it follows the latest.
  docs.patchDoc(docId, { version, viewingVersion: null, currentVersion: null });
  if (!doc.filePath && libraryPath) {
    docs.patchDoc(docId, { filePath: libraryPath, title: basename(libraryPath), generated: true });
    api.addRecent(libraryPath);
  }
  await loadDoc(docId, scratchPath, { preserveCamera: true, recent: false });
  persistDoc(docId);
}
