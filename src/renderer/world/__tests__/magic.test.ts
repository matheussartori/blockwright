import { describe, expect, it } from 'vitest';
import type { BlockState } from '../blend';
import { worldMagicRegion } from '../magic';

/** A finite block map keyed "x,y,z"; everything else reads as null (unknown chunk). */
function world(blocks: Record<string, BlockState | 'air'>): (x: number, y: number, z: number) => BlockState | null {
  return (x, y, z) => {
    const v = blocks[`${x},${y},${z}`];
    if (!v) return null;
    return v === 'air' ? { name: 'minecraft:air' } : v;
  };
}

const STONE: BlockState = { name: 'minecraft:stone' };
const STONE_X: BlockState = { name: 'minecraft:stone', properties: { variant: 'x' } };
const BRICKS: BlockState = { name: 'minecraft:stone_bricks' };
const DIRT: BlockState = { name: 'minecraft:dirt' };

describe('worldMagicRegion', () => {
  const blocks = {
    '0,0,0': STONE,
    '1,0,0': STONE_X,
    '2,0,0': BRICKS,
    '3,0,0': DIRT,
    '0,1,0': 'air' as const,
    '5,0,0': STONE, // disconnected
  };

  it('state mode stops at a property change', () => {
    const r = worldMagicRegion([0, 0, 0], world(blocks), 'state')!;
    expect(r.cells).toEqual([[0, 0, 0]]);
    expect(r.block).toBe('minecraft:stone');
    expect(r.truncated).toBe(false);
  });

  it('block mode crosses properties; family mode crosses variants', () => {
    expect(worldMagicRegion([0, 0, 0], world(blocks), 'block')!.cells).toHaveLength(2);
    expect(worldMagicRegion([0, 0, 0], world(blocks), 'family')!.cells).toHaveLength(3);
  });

  it('stops at unknown (unloaded) cells and never reaches disconnected blocks', () => {
    const r = worldMagicRegion([0, 0, 0], world(blocks), 'family')!;
    expect(r.cells.some(([x]) => x === 5)).toBe(false);
  });

  it('returns null on air or unknown starts', () => {
    expect(worldMagicRegion([0, 1, 0], world(blocks), 'state')).toBeNull();
    expect(worldMagicRegion([9, 9, 9], world(blocks), 'state')).toBeNull();
  });

  it('caps and flags truncation', () => {
    const line: Record<string, BlockState> = {};
    for (let x = 0; x < 10; x++) line[`${x},0,0`] = STONE;
    const r = worldMagicRegion([0, 0, 0], world(line), 'state', 4)!;
    expect(r.cells).toHaveLength(4);
    expect(r.truncated).toBe(true);
  });
});
