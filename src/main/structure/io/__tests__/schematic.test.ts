import { describe, it, expect } from 'vitest';
import { blockStateString, decodeSchem, encodeSchem, parseBlockState, type RawStructure } from '../schematic';

describe('parseBlockState / blockStateString', () => {
  it('round-trips a stateful block', () => {
    const entry = parseBlockState('minecraft:oak_stairs[facing=east,half=bottom]');
    expect(entry).toEqual({ Name: 'minecraft:oak_stairs', Properties: { facing: 'east', half: 'bottom' } });
    expect(blockStateString(entry)).toBe('minecraft:oak_stairs[facing=east,half=bottom]');
  });
  it('handles a bare block and adds the default namespace', () => {
    expect(parseBlockState('stone')).toEqual({ Name: 'minecraft:stone' });
    expect(blockStateString({ Name: 'minecraft:stone' })).toBe('minecraft:stone');
  });
  it('sorts properties for a stable string', () => {
    expect(blockStateString({ Name: 'minecraft:x', Properties: { z: '1', a: '2' } })).toBe('minecraft:x[a=2,z=1]');
  });
});

describe('encodeSchem → decodeSchem round-trip', () => {
  // A 3×2×3 build: two block types at a few cells (the rest air).
  const src: RawStructure = {
    size: [3, 2, 3],
    palette: [{ Name: 'minecraft:stone' }, { Name: 'minecraft:oak_stairs', Properties: { facing: 'west' } }],
    blocks: [
      { state: 0, pos: [0, 0, 0] },
      { state: 0, pos: [2, 0, 2] },
      { state: 1, pos: [1, 1, 0] },
    ],
  };

  it('preserves size, the placed blocks and their states through a real .schem buffer', async () => {
    const buffer = encodeSchem(src);
    expect(Buffer.isBuffer(buffer)).toBe(true);
    const out = await decodeSchem(buffer);

    expect(out.size).toEqual([3, 2, 3]);
    // Map decoded blocks → "x,y,z" → block-state string, ignoring palette index churn.
    const placed = new Map(out.blocks.map((b) => [b.pos.join(','), blockStateString(out.palette[b.state])]));
    expect(placed.get('0,0,0')).toBe('minecraft:stone');
    expect(placed.get('2,0,2')).toBe('minecraft:stone');
    expect(placed.get('1,1,0')).toBe('minecraft:oak_stairs[facing=west]');
    expect(out.blocks).toHaveLength(3); // air dropped
  });

  it('preserves block-entity data (a chest with contents)', async () => {
    const withChest: RawStructure = {
      size: [1, 1, 1],
      palette: [{ Name: 'minecraft:chest', Properties: { facing: 'north' } }],
      blocks: [{ state: 0, pos: [0, 0, 0] }],
      blockEntities: [{ pos: [0, 0, 0], id: 'minecraft:chest', nbt: { Items: [{ Slot: 0, id: 'minecraft:diamond', Count: 5 }] } }],
    };
    const out = await decodeSchem(encodeSchem(withChest));
    expect(out.blockEntities).toHaveLength(1);
    const be = out.blockEntities![0];
    expect(be.pos).toEqual([0, 0, 0]);
    expect(be.id).toBe('minecraft:chest');
    expect((be.nbt.Items as { id: string }[])[0].id).toBe('minecraft:diamond');
  });
});
