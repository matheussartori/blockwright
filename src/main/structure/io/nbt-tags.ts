// Shared NBT tag-builder helpers + a palette interner, used by the `.schem` and `.litematic`
// encoders. prismarine-nbt writes from `{type, value}` nodes; these were copy-pasted verbatim
// into both codecs, so they live here once. (The `.nbt` compiler in authoring/nbt-encode.ts
// keeps its own set, coupled to its inferTag/typed-encode path.)
import { AIR, blockStateString, type RawPaletteEntry } from './raw';

export type Tag = { type: string; value: unknown };

export const int = (v: number): Tag => ({ type: 'int', value: Math.trunc(v) });
export const str = (v: string): Tag => ({ type: 'string', value: v });
export const short = (v: number): Tag => ({ type: 'short', value: Math.trunc(v) });
export const intArray = (v: number[]): Tag => ({ type: 'intArray', value: v.map(Math.trunc) });
export const byteArray = (v: number[]): Tag => ({ type: 'byteArray', value: v });
export const longArray = (pairs: [number, number][]): Tag => ({ type: 'longArray', value: pairs });
export const compound = (value: Record<string, Tag>): Tag => ({ type: 'compound', value });
export const xyz = (x: number, y: number, z: number): Tag => compound({ x: int(x), y: int(y), z: int(z) });
export const emptyList = (): Tag => ({ type: 'list', value: { type: 'end', value: [] } });

/** A `long` tag from a ms timestamp, split to the `[high, low]` signed-int32 pair
 *  prismarine-nbt stores longs as. */
export const longFromMs = (ms: number): Tag => ({
  type: 'long',
  value: [Math.floor(ms / 0x100000000) | 0, ms % 0x100000000 | 0],
});

/** A `list` of compounds (an empty `end` list when there are none — what the formats expect). */
export function compoundList(items: Record<string, Tag>[]): Tag {
  return { type: 'list', value: items.length ? { type: 'compound', value: items } : { type: 'end', value: [] } };
}

/** A find-or-append palette interner: `intern(entry)` returns its index, deduping by the
 *  canonical block-state string. `seedAir` reserves index 0 for air (what both encoders want). */
export function createPaletteInterner(seedAir = false): {
  intern: (entry: RawPaletteEntry) => number;
  entries: RawPaletteEntry[];
} {
  const idByState = new Map<string, number>();
  const entries: RawPaletteEntry[] = [];
  const intern = (entry: RawPaletteEntry): number => {
    const key = blockStateString(entry);
    let id = idByState.get(key);
    if (id === undefined) {
      id = entries.length;
      idByState.set(key, id);
      entries.push(entry);
    }
    return id;
  };
  if (seedAir) intern({ Name: AIR });
  return { intern, entries };
}
