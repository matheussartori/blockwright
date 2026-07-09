// Helpers over prismarine-nbt's TAG-TYPED tree ({ type, value } nodes) — the form the world
// WRITE path works in. The write rule is "patch, don't re-serialize": we decode a chunk's NBT
// tree, surgically replace only the tags we own, and re-encode the SAME tree — so every tag we
// don't understand (mod data, ticks, `structures`) survives byte-for-byte. That's only possible
// on the tag-typed tree; `nbt.simplify` (what the READ path uses) throws the types away.

import * as nbt from 'prismarine-nbt';

export interface Tag {
  type: string;
  value: unknown;
}

export type Compound = Record<string, Tag>;

/** The compound's key→tag record, or null when the tag isn't a compound. */
export function compoundOf(tag: Tag | undefined): Compound | null {
  if (!tag || tag.type !== 'compound' || typeof tag.value !== 'object' || tag.value === null) return null;
  return tag.value as Compound;
}

/** Items of a list-of-compounds tag (`[]` for an empty/`end` list or a non-list). */
export function compoundItems(tag: Tag | undefined): Compound[] {
  if (!tag || tag.type !== 'list') return [];
  const inner = tag.value as { type?: string; value?: unknown } | null;
  if (!inner || inner.type !== 'compound' || !Array.isArray(inner.value)) return [];
  return inner.value as Compound[];
}

/** Numeric value of a byte/short/int/float/double tag; a `long` `[hi,lo]` pair is folded to a
 *  JS number (safe for every value the chunk headers use). Null for non-numeric tags. */
export function numberOf(tag: Tag | undefined): number | null {
  if (!tag) return null;
  if (tag.type === 'long' && Array.isArray(tag.value)) {
    const [hi, lo] = tag.value as [number, number];
    return hi * 0x100000000 + (lo >>> 0);
  }
  return typeof tag.value === 'number' ? tag.value : null;
}

export function stringOf(tag: Tag | undefined): string | null {
  return tag && tag.type === 'string' && typeof tag.value === 'string' ? tag.value : null;
}

// ── builders (prismarine-nbt raw node shapes) ────────────────────────────────────────
export const byteTag = (v: number): Tag => ({ type: 'byte', value: v | 0 });
export const intTag = (v: number): Tag => ({ type: 'int', value: Math.trunc(v) });
export const stringTag = (v: string): Tag => ({ type: 'string', value: v });
export const compoundTag = (value: Compound): Tag => ({ type: 'compound', value });

/** List of compounds; an empty list is written with element type `end`, matching vanilla. */
export function compoundListTag(items: Compound[]): Tag {
  return {
    type: 'list',
    value: items.length ? { type: 'compound', value: items } : { type: 'end', value: [] },
  };
}

/** LongArray from prismarine's `[hi, lo]` signed-int32 pairs. */
export const longArrayTag = (pairs: [number, number][]): Tag => ({ type: 'longArray', value: pairs });

/** IntArray tag (chunk `Position`, entity `UUID`). */
export const intArrayTag = (values: number[]): Tag => ({ type: 'intArray', value: values.map((v) => v | 0) });

/** List of doubles (entity `Pos`/`Motion` — the game requires the EXACT element type). */
export const doubleListTag = (values: number[]): Tag => ({ type: 'list', value: { type: 'double', value: values } });

/** List of floats (entity `Rotation` — `getList(…, FLOAT)` drops a double-typed list). */
export const floatListTag = (values: number[]): Tag => ({ type: 'list', value: { type: 'float', value: values } });

/** LongArray value → `[hi, lo]` pairs (`[]` for absent/non-longArray). */
export function longArrayPairs(tag: Tag | undefined): [number, number][] {
  if (!tag || tag.type !== 'longArray' || !Array.isArray(tag.value)) return [];
  return tag.value as [number, number][];
}

/** Deep-copy a tag node (used to duplicate a biome palette into a freshly created section —
 *  sharing nodes between sections would alias later mutations). */
export function cloneTag(tag: Tag): Tag {
  return structuredClone(tag);
}

/** Re-encode a (patched) tag-typed root back to uncompressed big-endian NBT bytes — the inverse
 *  of `RegionFile.readChunkParsed`. Same tree in, same bytes out for everything untouched. */
export function encodeTagRoot(root: Tag): Buffer {
  // A hand-built root may lack the (empty) root name a parsed one carries.
  const named = { name: '', ...root };
  return nbt.writeUncompressed(named as unknown as nbt.NBT, 'big');
}
