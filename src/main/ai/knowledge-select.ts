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

// CONDITIONAL CORE guides: core guides (not under `modules/`) that are large AND only
// relevant to some builds, so they're gated on the build's characteristics instead of
// riding along on every prompt. The gate is CONSERVATIVE — it keeps a guide unless the
// build is clearly simple enough not to need it — because dropping a needed guide costs
// quality, while keeping an unneeded one only costs (cached) tokens. Each entry maps a
// guide path to the predicate that decides inclusion.
const CONDITIONAL_CORE: Record<string, (prompt: string, selection?: ModuleSelection) => boolean> = {
  // The multi-room / large / below-grade / multi-wing playbook. Only relevant when the
  // build is non-trivial; a plain single-room cottage doesn't need it.
  'nbt/08-complex-structures.md': isComplexBuild,
};

// Any signal of complexity keeps `08-complex-structures`. Selection signals: a basement,
// two-plus rooms, or an inherently articulated structure (l-shaped). Prompt signals: words
// that imply scale / multiple rooms / below-grade / articulation. Generous on purpose
// (err toward INCLUDING the guide) so a build that turns out complex isn't left without it.
const COMPLEX_PROMPT =
  /\b(basement|cellar|crypt|dungeon|underground|under[- ]?ground|multi[- ]?room|rooms?|floors?|stor(?:ey|y|ies)|levels?|mansion|castle|keep|manor|palace|fortress|sprawl\w*|wings?|tower|complex|large|huge|big|massive|grand)\b/i;

/** Whether a build is "complex" enough to warrant the complex-structures guide. Pure —
 *  inspects only the selection (no size — not in ModuleSelection) and the prompt text. */
export function isComplexBuild(prompt: string, selection?: ModuleSelection): boolean {
  if (selection) {
    if (selection.basement) return true;
    if ((selection.rooms?.length ?? 0) >= 2) return true;
    if (selection.structureType === 'l-shaped') return true;
  }
  return COMPLEX_PROMPT.test(prompt);
}

/** Is `relPath` a conditional core guide (one gated on build characteristics)? */
export function isConditionalCore(relPath: string): boolean {
  return relPath in CONDITIONAL_CORE;
}

/** Whether a core guide should be included for this build: always-on core guides return
 *  true; a conditional core guide runs its predicate. (Module guides are gated separately
 *  via {@link includedModuleGuides}.) */
export function coreGuideIncluded(relPath: string, prompt: string, selection?: ModuleSelection): boolean {
  const gate = CONDITIONAL_CORE[relPath];
  return gate ? gate(prompt, selection) : true;
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
