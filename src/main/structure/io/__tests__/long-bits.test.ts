import { describe, expect, it } from 'vitest';
import {
  bitsForBlockStates,
  bitsForPalette,
  bigToPairs,
  packNonSpanning,
  pairsToBig,
  unpackNonSpanning,
} from '../long-bits';

describe('bitsForPalette / bitsForBlockStates', () => {
  it('floors at 2 by default (Litematica / biomes)', () => {
    expect(bitsForPalette(1)).toBe(2);
    expect(bitsForPalette(4)).toBe(2);
    expect(bitsForPalette(5)).toBe(3);
    expect(bitsForPalette(16)).toBe(4);
    expect(bitsForPalette(17)).toBe(5);
  });

  it('floors at 4 for Anvil block states', () => {
    expect(bitsForBlockStates(1)).toBe(4);
    expect(bitsForBlockStates(16)).toBe(4);
    expect(bitsForBlockStates(17)).toBe(5);
    expect(bitsForBlockStates(256)).toBe(8);
    expect(bitsForBlockStates(257)).toBe(9);
  });
});

describe('non-spanning long array', () => {
  it('packs entries without crossing long boundaries (bits=4, 16/long)', () => {
    // [1, 2, 3] at 4 bits each in one long: 1 | 2<<4 | 3<<8 = 0x321.
    const longs = packNonSpanning([1, 2, 3], 4);
    expect(longs).toHaveLength(1);
    expect(longs[0]).toBe(0x321n);
    const out = unpackNonSpanning(longs, 4, 3);
    expect([...out]).toEqual([1, 2, 3]);
  });

  it('starts a new long every floor(64/bits) entries (bits=5 → 12/long)', () => {
    const ids = Array.from({ length: 25 }, (_, i) => i % 32);
    const longs = packNonSpanning(ids, 5);
    expect(longs).toHaveLength(Math.ceil(25 / 12)); // 3 longs
    expect([...unpackNonSpanning(longs, 5, 25)]).toEqual(ids);
  });

  it('round-trips a full 4096-cell section at various bit widths', () => {
    for (const bits of [4, 5, 8, 9, 12]) {
      const max = (1 << bits) - 1;
      const ids = Array.from({ length: 4096 }, (_, i) => (i * 7) % (max + 1));
      const out = unpackNonSpanning(packNonSpanning(ids, bits), bits, 4096);
      expect([...out]).toEqual(ids);
    }
  });

  it('survives the prismarine-nbt [hi,lo] signed-int32 pair bridge', () => {
    const ids = Array.from({ length: 100 }, (_, i) => (i * 13) % 256);
    const longs = packNonSpanning(ids, 8);
    const roundTripped = pairsToBig(bigToPairs(longs));
    expect([...unpackNonSpanning(roundTripped, 8, 100)]).toEqual(ids);
  });
});
