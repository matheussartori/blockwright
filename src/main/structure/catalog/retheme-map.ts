// The one-click decoration re-theme's mapping brain: classify a build's palette into
// semantic ROLES (the user's dictionary annotation first, then the id heuristic) and
// look each role up in the target decoration's role→block map. Pure name→name output —
// the renderer keeps every blockstate property as-is when it swaps (the part naive
// string-replace re-themers break), so this module never touches properties.
import { guessRole } from '../assets/block-dictionary-derive';
import { getDictionary } from '../assets/block-dictionary';
import { getDecoration } from '../domain/decorations';
import { isRole } from '../domain/roles';

/**
 * Map each distinct block name of a build to the target decoration's block for its role.
 *
 * @param blocks Distinct block names in the build (namespaced, e.g. "minecraft:oak_planks").
 * @param decorationId A registered decoration id (cozy/haunted/castle/…).
 * @returns source name → target name, ONLY for blocks that resolve to a role the
 *   decoration maps to a different block. Unmapped blocks are simply left alone.
 */
export function rethemeMap(blocks: string[], decorationId: string): Record<string, string> {
  const deco = getDecoration(decorationId);
  if (!deco) return {};
  const dict = getDictionary();
  const noteRole = (name: string): string | null =>
    dict?.entries.find((e) => e.id === name)?.note?.role ?? null;

  const out: Record<string, string> = {};
  for (const name of blocks) {
    const role = noteRole(name) ?? guessRole(name);
    if (!role || !isRole(role)) continue;
    const target = deco.blocks[role];
    if (target && target !== name) out[name] = target;
  }
  return out;
}
