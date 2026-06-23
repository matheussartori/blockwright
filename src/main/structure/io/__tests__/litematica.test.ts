import { describe, it, expect } from 'vitest';
import { blockStateString, type RawStructure } from '../schematic';
import { bitsForPalette, decodeLitematic, encodeLitematic, packBlockStates, unpackBlockStates } from '../litematica';

describe('bitsForPalette', () => {
  it('is max(2, ceil(log2(n)))', () => {
    expect(bitsForPalette(1)).toBe(2);
    expect(bitsForPalette(2)).toBe(2);
    expect(bitsForPalette(4)).toBe(2);
    expect(bitsForPalette(5)).toBe(3);
    expect(bitsForPalette(16)).toBe(4);
    expect(bitsForPalette(17)).toBe(5);
  });
});

describe('bit array (spanning)', () => {
  it('round-trips ids across long boundaries at odd bit widths', () => {
    const bits = 5; // 5 doesn't divide 64 → entries span longs
    const ids = Array.from({ length: 50 }, (_, i) => i % 32); // 0..31 fit in 5 bits
    const longs = packBlockStates(ids, bits);
    expect(unpackBlockStates(longs, bits, ids.length)).toEqual(ids);
  });
  it('round-trips at 2 bits and a non-multiple count', () => {
    const ids = [0, 3, 1, 2, 3, 0, 1];
    const longs = packBlockStates(ids, 2);
    expect(unpackBlockStates(longs, 2, ids.length)).toEqual(ids);
  });
});

describe('encodeLitematic → decodeLitematic round-trip', () => {
  const src: RawStructure = {
    size: [4, 2, 3],
    palette: [{ Name: 'minecraft:stone' }, { Name: 'minecraft:oak_stairs', Properties: { facing: 'north' } }],
    blocks: [
      { state: 0, pos: [0, 0, 0] },
      { state: 0, pos: [3, 1, 2] },
      { state: 1, pos: [2, 0, 1] },
    ],
  };

  it('preserves size, placed blocks and their states through a real .litematic buffer', async () => {
    const out = await decodeLitematic(encodeLitematic(src, 1_700_000_000_000));
    expect(out.size).toEqual([4, 2, 3]);
    const placed = new Map(out.blocks.map((b) => [b.pos.join(','), blockStateString(out.palette[b.state])]));
    expect(placed.get('0,0,0')).toBe('minecraft:stone');
    expect(placed.get('3,1,2')).toBe('minecraft:stone');
    expect(placed.get('2,0,1')).toBe('minecraft:oak_stairs[facing=north]');
    expect(out.blocks).toHaveLength(3);
  });

  it('preserves block-entity data (a chest with contents)', async () => {
    const withChest: RawStructure = {
      size: [2, 1, 1],
      palette: [{ Name: 'minecraft:chest', Properties: { facing: 'south' } }],
      blocks: [{ state: 0, pos: [1, 0, 0] }],
      blockEntities: [{ pos: [1, 0, 0], id: 'minecraft:chest', nbt: { Items: [{ Slot: 2, id: 'minecraft:emerald', Count: 3 }] } }],
    };
    const out = await decodeLitematic(encodeLitematic(withChest, 1_700_000_000_000));
    expect(out.blockEntities).toHaveLength(1);
    const be = out.blockEntities![0];
    expect(be.pos).toEqual([1, 0, 0]);
    expect(be.id).toBe('minecraft:chest');
    expect((be.nbt.Items as { id: string }[])[0].id).toBe('minecraft:emerald');
  });
});
