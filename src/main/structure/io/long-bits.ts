// Bit-packed long-array helpers shared by every codec that stores block indices in a `LongArray`
// NBT tag. Minecraft has TWO packings and both live here so neither codec owns the contract:
//   • SPANNING (pre-1.16 / Litematica) — entries cross 64-bit long boundaries.
//   • NON-SPANNING (Anvil 1.16+) — each long packs floor(64/bits) whole entries; the top bits are
//     wasted padding, so an entry never straddles two longs.
// 64-bit math needs BigInt; prismarine-nbt stores each long as a signed-int32 `[high, low]` pair.

export const U64 = (1n << 64n) - 1n;

/** Bits per palette index: `max(floor, ceil(log2(paletteSize)))`. Litematica/biomes floor at 2;
 *  Anvil block states floor at 4 (`bitsForBlockStates`). */
export function bitsForPalette(paletteSize: number, floor = 2): number {
  return Math.max(floor, 32 - Math.clz32(Math.max(1, paletteSize - 1)));
}

/** Anvil block-state bits: `max(4, ceil(log2(paletteSize)))`. */
export const bitsForBlockStates = (paletteSize: number): number => bitsForPalette(paletteSize, 4);

// ── prismarine-nbt long ↔ unsigned BigInt ────────────────────────────────────────────
export const pairsToBig = (pairs: [number, number][]): bigint[] =>
  pairs.map(([hi, lo]) => ((BigInt(hi >>> 0) << 32n) | BigInt(lo >>> 0)) & U64);

export const bigToPairs = (longs: bigint[]): [number, number][] =>
  longs.map((u) => [Number((u >> 32n) & 0xffffffffn) | 0, Number(u & 0xffffffffn) | 0]);

// ── SPANNING (Litematica / pre-1.16) ─────────────────────────────────────────────────

/** Read entry `index` from the packed longs (entries may span two longs). */
export function getSpanning(longs: bigint[], bits: number, index: number): number {
  const mask = (1n << BigInt(bits)) - 1n;
  const startOffset = index * bits;
  const startArr = Math.floor(startOffset / 64);
  const endArr = Math.floor(((index + 1) * bits - 1) / 64);
  const startBit = BigInt(startOffset % 64);
  const lo = longs[startArr] ?? 0n;
  if (startArr === endArr) return Number((lo >> startBit) & mask);
  const endOffset = BigInt(64 - (startOffset % 64));
  return Number((((lo >> startBit) | ((longs[endArr] ?? 0n) << endOffset)) & mask));
}

/** Write `value` at entry `index` into the packed longs (spanning scheme). */
export function setSpanning(longs: bigint[], bits: number, index: number, value: number): void {
  const mask = (1n << BigInt(bits)) - 1n;
  const v = BigInt(value) & mask;
  const startOffset = index * bits;
  const startArr = Math.floor(startOffset / 64);
  const endArr = Math.floor(((index + 1) * bits - 1) / 64);
  const startBit = BigInt(startOffset % 64);
  longs[startArr] = (((longs[startArr] ?? 0n) & (U64 ^ ((mask << startBit) & U64))) | ((v << startBit) & U64)) & U64;
  if (startArr !== endArr) {
    const endOffset = 64 - (startOffset % 64);
    const j1 = BigInt(bits - endOffset);
    longs[endArr] = ((((longs[endArr] ?? 0n) >> j1) << j1) | (v >> BigInt(endOffset))) & U64;
  }
}

/** Pack `ids` (count entries of `bits` each) into the long array (spanning scheme). */
export function packSpanning(ids: number[], bits: number): bigint[] {
  const longs = new Array<bigint>(Math.max(0, Math.ceil((ids.length * bits) / 64))).fill(0n);
  for (let i = 0; i < ids.length; i++) setSpanning(longs, bits, i, ids[i]);
  return longs;
}

/** Unpack `count` entries of `bits` each from the long array (spanning scheme). */
export function unpackSpanning(longs: bigint[], bits: number, count: number): number[] {
  const ids = new Array<number>(count);
  for (let i = 0; i < count; i++) ids[i] = getSpanning(longs, bits, i);
  return ids;
}

// ── NON-SPANNING (Anvil 1.16+) ───────────────────────────────────────────────────────

/** Pack `ids` into a non-spanning long array (`floor(64/bits)` whole entries per long). Inverse of
 *  `unpackNonSpanning` — used to build test fixtures / re-encode. */
export function packNonSpanning(ids: ArrayLike<number>, bits: number): bigint[] {
  if (bits <= 0) return [];
  const perLong = Math.floor(64 / bits);
  const longs = new Array<bigint>(Math.ceil(ids.length / perLong)).fill(0n);
  for (let i = 0; i < ids.length; i++) {
    const offset = BigInt((i % perLong) * bits);
    longs[Math.floor(i / perLong)] |= (BigInt(ids[i]) << offset) & U64;
  }
  return longs;
}

/** Unpack `count` entries of `bits` each from the long array (non-spanning: no cross-long
 *  straddle — each long holds `floor(64/bits)` whole entries). Fills a `Uint16Array` (palette
 *  indices fit in 16 bits for any real chunk). */
export function unpackNonSpanning(longs: bigint[], bits: number, count: number): Uint16Array {
  const out = new Uint16Array(count);
  if (bits <= 0) return out;
  const mask = (1n << BigInt(bits)) - 1n;
  const perLong = Math.floor(64 / bits);
  for (let i = 0; i < count; i++) {
    const long = longs[Math.floor(i / perLong)] ?? 0n;
    const offset = BigInt((i % perLong) * bits);
    out[i] = Number((long >> offset) & mask);
  }
  return out;
}
