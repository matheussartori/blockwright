// Deterministic string hashes shared across the renderer. TWO named variants (not one
// parameterized function) because each call site's exact numeric output is load-bearing:
// the Block Catalog's fallback swatch hue and the brief's seeded-RNG room assignment
// (guarded by generation/__tests__/brief.test.ts) must not change values.

/** Java-style 31-multiplier hash (unsigned 32-bit) — drives the catalog's fallback swatch hue. */
export function hashString31(str: string): number {
  let h = 0;
  for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) >>> 0;
  return h;
}

/** FNV-1a 32-bit hash — the brief's string→seed for its tiny seeded PRNG. */
export function hashFnv1a(str: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}
