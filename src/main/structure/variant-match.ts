// Pure blockstate-variant matching, split out so it can be unit-tested without
// pulling in the content pack (which imports electron). Maps a block's properties
// to the best `variants` entry of its blockstate JSON.

/** Score how well a variant key like "facing=east,open=false" fits the block
 *  properties. Returns the number of matched pairs, or -1 if any *present*
 *  property conflicts. Properties absent from `props` (e.g. an NBT palette that
 *  omitted `open`) neither match nor disqualify — so a barrel saved with only
 *  `facing` still resolves to the best variant instead of falling back to a flat
 *  color. The highest non-negative score wins, which prefers the most specific
 *  match and keeps source order (first variant) on ties. */
export function variantScore(key: string, props: Record<string, string>): number {
  if (key === '') return 0;
  let score = 0;
  for (const pair of key.split(',')) {
    const [k, v] = pair.split('=');
    if (!(k in props)) continue;
    if (props[k] !== v) return -1;
    score++;
  }
  return score;
}

/** Pick the variant whose key best fits the block properties (see variantScore). */
export function bestVariant<T>(
  variants: Record<string, T>,
  props: Record<string, string>,
): T | undefined {
  let best: T | undefined;
  let bestScore = -1;
  for (const [key, value] of Object.entries(variants)) {
    const score = variantScore(key, props);
    if (score > bestScore) {
      bestScore = score;
      best = value;
    }
  }
  return best;
}
