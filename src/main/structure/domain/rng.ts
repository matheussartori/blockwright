// Deterministic RNG so any procedural variety (decay, footprint shapes) is stable
// across re-renders of the same build — re-running the compiler gives identical
// geometry, which keeps the visual review loop honest.

/** Small, fast seeded PRNG → a function returning floats in [0, 1). */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Hash three integers into a 32-bit seed (e.g. a box origin → a stable seed). */
export const seed3 = (x: number, y: number, z: number): number =>
  ((x * 73856093) ^ (y * 19349663) ^ (z * 83492791)) >>> 0;
