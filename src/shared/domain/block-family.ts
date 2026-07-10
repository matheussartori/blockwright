// The block FAMILY matcher behind magic select's tolerance (v2.3 §1.1): two ids are
// "family" when they share a base material after stripping finish prefixes (polished_,
// mossy_, waxed_…) and shape suffixes (_stairs, _slab, _wall…) — so one magic pick grabs
// a wall built from stone + stone_bricks + cracked_stone_bricks + stone_brick_stairs.
// Pure and process-agnostic (shared/domain) so a future main-side linter check can use
// the exact same notion of family as the renderer's selection tools.

/** Finish/variant prefixes stripped (repeatedly — `waxed_oxidized_cut_copper` unwinds). */
const FINISH_PREFIXES = [
  'waxed_',
  'exposed_',
  'weathered_',
  'oxidized_',
  'polished_',
  'smooth_',
  'chiseled_',
  'cracked_',
  'mossy_',
  'cobbled_',
  'cut_',
  'stripped_',
  'infested_',
];

/** Shape suffixes stripped (repeatedly — `stone_brick_stairs` unwinds to `stone_brick`
 *  then `stone`, matching `stone_bricks` → `stone`). Order matters: longer suffixes
 *  first so `_fence_gate` wins over `_fence`. */
const SHAPE_SUFFIXES = [
  '_fence_gate',
  '_pressure_plate',
  '_trapdoor',
  '_button',
  '_stairs',
  '_slab',
  '_wall',
  '_fence',
  '_planks',
  '_pillar',
  '_bricks',
  '_brick',
  '_tiles',
  '_tile',
  '_block',
  '_log',
  '_wood',
  '_door',
];

/**
 * The family token of a block id: namespace + finish prefixes + one shape suffix
 * stripped, plural shape tokens singularized. `minecraft:mossy_stone_brick_stairs`,
 * `stone_bricks` and `stone` all reduce to `stone`.
 *
 * @param id A block id, with or without namespace.
 * @returns The lower-cased family token.
 */
export function blockFamily(id: string): string {
  let n = id.toLowerCase().replace(/^[^:]+:/, '');
  let changed = true;
  while (changed) {
    changed = false;
    for (const p of FINISH_PREFIXES) {
      if (n.startsWith(p) && n.length > p.length) {
        n = n.slice(p.length);
        changed = true;
      }
    }
  }
  changed = true;
  while (changed) {
    changed = false;
    for (const s of SHAPE_SUFFIXES) {
      if (n.endsWith(s) && n.length > s.length) {
        n = n.slice(0, -s.length);
        changed = true;
        break;
      }
    }
  }
  return n;
}

/** Whether two block ids belong to the same family (see {@link blockFamily}). */
export function sameFamily(a: string, b: string): boolean {
  return blockFamily(a) === blockFamily(b);
}
