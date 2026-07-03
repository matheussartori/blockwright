import { describe, expect, it } from 'vitest';
import { extractDataMarkers } from '../data-markers';
import type { RawBlock, RawPaletteEntry } from '../raw';

const palette: RawPaletteEntry[] = [
  { Name: 'minecraft:stone' },
  { Name: 'minecraft:structure_block', Properties: { mode: 'data' } },
  { Name: 'minecraft:structure_block', Properties: { mode: 'save' } },
];

/** A vanilla-shaped data-mode block entity (mode stored uppercase there). */
function dataNbt(metadata: string): Record<string, unknown> {
  return { id: 'minecraft:structure_block', mode: 'DATA', metadata, mirror: 'NONE' };
}

describe('extractDataMarkers', () => {
  it('collects data-mode structure blocks with their metadata strings', () => {
    const blocks: RawBlock[] = [
      { state: 0, pos: [0, 0, 0] },
      { state: 1, pos: [1, 2, 3], nbt: dataNbt('tpb:spawn/watcher_stare') },
      { state: 1, pos: [4, 5, 6], nbt: dataNbt('tpb:trigger/watcher_stare') },
    ];
    expect(extractDataMarkers(palette, blocks)).toEqual([
      { pos: [1, 2, 3], data: 'tpb:spawn/watcher_stare' },
      { pos: [4, 5, 6], data: 'tpb:trigger/watcher_stare' },
    ]);
  });

  it('falls back to the blockstate mode property when the NBT has no mode', () => {
    const blocks: RawBlock[] = [
      { state: 1, pos: [0, 0, 0], nbt: { metadata: 'my:hook' } },
    ];
    expect(extractDataMarkers(palette, blocks)).toEqual([{ pos: [0, 0, 0], data: 'my:hook' }]);
  });

  it('skips non-data modes, empty metadata and other blocks', () => {
    const blocks: RawBlock[] = [
      // A save-mode structure block whose NBT agrees — not a marker.
      { state: 2, pos: [0, 0, 0], nbt: { id: 'minecraft:structure_block', mode: 'SAVE', metadata: '' } },
      // Data mode but nothing to show or copy.
      { state: 1, pos: [1, 0, 0], nbt: dataNbt('') },
      // A chest with a metadata-shaped field is not a structure block.
      { state: 0, pos: [2, 0, 0], nbt: { id: 'minecraft:chest', metadata: 'x' } },
    ];
    expect(extractDataMarkers(palette, blocks)).toEqual([]);
  });
});
