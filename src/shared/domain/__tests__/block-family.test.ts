import { describe, expect, it } from 'vitest';
import { blockFamily, sameFamily } from '../block-family';

describe('blockFamily', () => {
  it('strips the namespace and shape suffixes', () => {
    expect(blockFamily('minecraft:oak_planks')).toBe('oak');
    expect(blockFamily('oak_stairs')).toBe('oak');
    expect(blockFamily('minecraft:oak_slab')).toBe('oak');
  });

  it('unwinds finish prefixes repeatedly', () => {
    expect(blockFamily('minecraft:waxed_oxidized_cut_copper')).toBe('copper');
    expect(blockFamily('polished_andesite_stairs')).toBe('andesite');
  });

  it('unwinds stacked shape tokens so brick variants meet their base', () => {
    expect(blockFamily('stone_bricks')).toBe('stone');
    expect(blockFamily('mossy_stone_brick_stairs')).toBe('stone');
    expect(blockFamily('deepslate_tiles')).toBe('deepslate');
    expect(blockFamily('cobbled_deepslate_wall')).toBe('deepslate');
  });

  it('never strips a token down to nothing', () => {
    expect(blockFamily('minecraft:bricks')).toBe('bricks');
    expect(blockFamily('minecraft:smooth_stone')).toBe('stone');
    expect(blockFamily('minecraft:stripped_oak_log')).toBe('oak');
  });

  it('keeps distinct materials distinct', () => {
    expect(sameFamily('minecraft:stone', 'minecraft:cobblestone')).toBe(false);
    expect(sameFamily('minecraft:oak_planks', 'minecraft:spruce_planks')).toBe(false);
  });

  it('sameFamily groups a mixed wall', () => {
    expect(sameFamily('minecraft:stone', 'minecraft:cracked_stone_bricks')).toBe(true);
    expect(sameFamily('minecraft:stone_brick_stairs', 'minecraft:stone_bricks')).toBe(true);
  });
});
