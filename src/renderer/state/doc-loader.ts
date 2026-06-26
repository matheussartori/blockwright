// The single bridge that loads a `.nbt` into a document (and the on-screen viewer when it's
// the active tab). App registers it once via `setDocLoader` because App owns the Three.js
// viewers; the generation loop and the version-chain ops then load builds through `loadDoc`,
// so neither has to depend on the other (or reach into React) to put a build on screen.

/** Load options: `working` (default true) updates the doc's working path — the edit base for
 *  the next AI turn; pass false to PREVIEW a version in the viewer without changing it. */
export interface DocLoadOpts {
  preserveCamera?: boolean;
  recent?: boolean;
  working?: boolean;
}

/** Loads a generated/opened `.nbt` into a document — and the viewer if it's the active tab. */
export type DocLoader = (docId: string, path: string, opts?: DocLoadOpts) => Promise<void>;

let docLoader: DocLoader | null = null;

/** Register the loader (App, once). */
export function setDocLoader(fn: DocLoader): void {
  docLoader = fn;
}

/** Load `path` into the document, or a resolved no-op when no loader is registered yet. */
export function loadDoc(docId: string, path: string, opts?: DocLoadOpts): Promise<void> {
  return docLoader ? docLoader(docId, path, opts) : Promise.resolve();
}
