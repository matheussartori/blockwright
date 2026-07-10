// Percentage paint patterns — the WorldEdit-community "50%stone,30%andesite,20%gravel"
// blending technique as a first-class block field value (v2.3 §1.1). Pure: parsing and
// the per-cell weighted pick live here (no store, no IO) so both editors — the structure
// editor's brush/fill and the world editor's brush/fill — share exactly the same
// semantics, unit-tested in __tests__/pattern.test.ts.
//
// Syntax: comma-separated entries, each `block_id` or `NN% block_id` (the % weights are
// free-form positive numbers — they need not sum to 100; entries without a weight share
// the average of the weighted ones, so "50% stone, andesite" reads naturally). A single
// plain id is the degenerate one-entry pattern, so every caller can parse unconditionally.
//
// The pick is DETERMINISTIC per cell: a hash of the cell coords chooses the entry, so
// re-painting the same cell with the same pattern is idempotent, undo/redo re-composites
// identically, and a fill never "reshuffles" on re-mesh.

/** One block of a pattern with its normalized weight (> 0; weights sum to 1). */
export interface PatternEntry {
  name: string;
  weight: number;
}

/** Prefix a bare block name with the vanilla namespace (`stone` → `minecraft:stone`). */
function qualify(name: string): string {
  return name.includes(':') ? name : `minecraft:${name}`;
}

/**
 * Parse a pattern string into weighted entries.
 *
 * @param input A block id, or comma-separated `NN% block_id` entries.
 * @returns Normalized entries (weights sum to 1), or null when the input is empty or
 *   malformed (an entry with no block id, a zero/negative weight).
 */
export function parsePattern(input: string): PatternEntry[] | null {
  const parts = input.split(',').map((p) => p.trim()).filter(Boolean);
  if (!parts.length) return null;
  const raw: { name: string; weight: number | null }[] = [];
  for (const part of parts) {
    const m = /^(?:(\d+(?:\.\d+)?)\s*%\s*)?([a-z0-9_:]+)$/i.exec(part);
    if (!m) return null;
    const weight = m[1] != null ? Number(m[1]) : null;
    if (weight !== null && !(weight > 0)) return null;
    raw.push({ name: qualify(m[2].toLowerCase()), weight });
  }
  // Unweighted entries share the average explicit weight (or 1 when none is explicit).
  const explicit = raw.filter((r) => r.weight !== null).map((r) => r.weight!);
  const fallback = explicit.length ? explicit.reduce((a, b) => a + b, 0) / explicit.length : 1;
  const total = raw.reduce((sum, r) => sum + (r.weight ?? fallback), 0);
  return raw.map((r) => ({ name: r.name, weight: (r.weight ?? fallback) / total }));
}

/** Whether an input is a MULTI-block pattern (a plain single id isn't). */
export function isPattern(input: string): boolean {
  const entries = parsePattern(input);
  return !!entries && entries.length > 1;
}

/** A 2^32 avalanche mix of three cell coords (+ an optional seed) → [0, 1). Deterministic —
 *  the same cell always lands in the same pattern bucket. */
export function cellHash01(x: number, y: number, z: number, seed = 0): number {
  let h = (seed ^ 0x9e3779b9) >>> 0;
  for (const v of [x, y, z]) {
    h = (h ^ ((v | 0) * 0x85ebca6b)) >>> 0;
    h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35) >>> 0;
    h = (h ^ (h >>> 16)) >>> 0;
  }
  return h / 0x100000000;
}

/**
 * Pick the pattern entry for a cell (deterministic weighted choice).
 *
 * @param entries Parsed pattern entries (weights sum to 1).
 * @param x - Cell X (world or structure-local — any consistent space works).
 * @param y - Cell Y.
 * @param z - Cell Z.
 * @returns The index into `entries` chosen for this cell.
 */
export function pickPatternIndex(entries: PatternEntry[], x: number, y: number, z: number): number {
  if (entries.length === 1) return 0;
  const r = cellHash01(x, y, z);
  let acc = 0;
  for (let i = 0; i < entries.length; i++) {
    acc += entries[i].weight;
    if (r < acc) return i;
  }
  return entries.length - 1;
}
