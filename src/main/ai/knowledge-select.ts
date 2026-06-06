// Which knowledge guides to include for a given build. Core guides (everything NOT
// under `nbt/modules/`) always ride along; a MODULE guide is included only when its
// module is selected in the composer Details, or — as a fallback — when the free-text
// prompt's keywords match a module that declares them.
//
// Kept free of Electron/fs imports so it's unit-testable in isolation. The actual file
// reading lives in knowledge.ts; the selection→guide-path mapping lives in the domain
// (each module declares its own `knowledge` path + optional `keywords`).
import { promptGuides, selectedGuides, type ModuleSelection } from '../structure/domain';

export type { ModuleSelection } from '../structure/domain';

/** Is `relPath` (relative to the knowledge dir, e.g. `nbt/modules/structure/house.md`)
 *  a module guide rather than a core guide? */
export function isModuleGuide(relPath: string): boolean {
  return relPath.includes('/modules/');
}

/** The set of module guide paths to include for a build: the explicitly selected
 *  modules' guides, plus any pulled in by keyword from the free-text prompt. Pure. */
export function includedModuleGuides(prompt: string, selection?: ModuleSelection): Set<string> {
  const set = new Set<string>();
  if (selection) for (const g of selectedGuides(selection)) set.add(normalize(g));
  for (const g of promptGuides(prompt)) set.add(normalize(g));
  return set;
}

/** Normalize a declared guide path to compare against discovered file paths
 *  (forward slashes, no leading `./`). */
function normalize(p: string): string {
  return p.replace(/\\/g, '/').replace(/^\.\//, '');
}
