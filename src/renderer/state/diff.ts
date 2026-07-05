// The compare flow (non-React, shared by the File menu handler and the Versions panel):
// load the OTHER structure over IPC, diff it against the ACTIVE doc's live structure, and
// publish the result into the app store — the viewer overlay + DiffPanel follow from there.
// Nothing here mutates the doc or the viewer directly; a comparison is pure view state.
import { api } from '../api';
import { diffStructures } from '../diff/diff';
import { activeDocument, documentsStore } from './documents';
import { store } from './store';
import { basename } from '../ui/path';

/**
 * Compare the active doc's structure with the file at `path` and open the diff view.
 *
 * @param path Absolute path of the structure to compare against (.nbt/.schem/.litematic).
 * @param label Display name for the compared side (defaults to the file's basename).
 * @returns true when the diff opened; false when there was no active structure or the
 *   file failed to load (a status-bar notice is raised instead of throwing).
 */
export async function compareActiveWith(path: string, label?: string): Promise<boolean> {
  const doc = activeDocument(documentsStore.getState());
  if (!doc?.structure) return false;
  try {
    const other = await api.loadStructure(path);
    // The comparison reads: what would turn the OTHER (base) into the CURRENT build?
    // added = in the current build only, removed = in the other only.
    const result = diffStructures(other, doc.structure);
    store.getState().setDiff({ otherName: label ?? basename(path), otherPath: path, docId: doc.id, result });
    return true;
  } catch (e) {
    store.getState().setNotice({ text: e instanceof Error ? e.message : String(e), warn: true });
    return false;
  }
}

/** Close the diff view (drops the overlay + panel). */
export function closeDiff(): void {
  store.getState().setDiff(null);
}
