import { describe, expect, it } from 'vitest';
import { fixChimney } from '../passes';
import type { AuthoringBlock, AuthoringPaletteEntry } from '../types';

const ctx = { size: [16, 16, 16] as [number, number, number] };
const has = (blocks: AuthoringBlock[], state: number, x: number, y: number, z: number): boolean =>
  blocks.some((b) => b.state === state && b.pos[0] === x && b.pos[1] === y && b.pos[2] === z);

describe('fixChimney: one complete chimney (house finalizer)', () => {
  // 0=air, 1=cobblestone (flue), 2=campfire (cap).
  const palette: AuthoringPaletteEntry[] = [
    { Name: 'minecraft:air' }, { Name: 'minecraft:cobblestone' }, { Name: 'minecraft:campfire' },
  ];

  function scene(): AuthoringBlock[] {
    const blocks: AuthoringBlock[] = [{ state: 1, pos: [0, 0, 0] }, { state: 1, pos: [0, 10, 0] }]; // y-extent 0..10
    for (let y = 2; y <= 6; y++) blocks.push({ state: 1, pos: [5, y, 5] }); // chimney A column
    blocks.push({ state: 2, pos: [5, 8, 5] });                              // cap A, gap at y7
    blocks.push({ state: 1, pos: [2, 6, 2] });                             // chimney B stub
    blocks.push({ state: 2, pos: [2, 7, 2] });                             // cap B (extra)
    blocks.push({ state: 2, pos: [8, 8, 8] });                            // floating cap (no column)
    return blocks;
  }

  it('fills the flue gap under the kept cap, drops the extra and the floating cap', () => {
    const r = fixChimney(scene(), palette, ctx);
    expect(has(r.blocks, 1, 5, 7, 5)).toBe(true);   // gap filled → continuous flue
    expect(has(r.blocks, 2, 5, 8, 5)).toBe(true);   // kept chimney cap stays
    expect(has(r.blocks, 2, 2, 7, 2)).toBe(false);  // extra chimney removed
    expect(has(r.blocks, 2, 8, 8, 8)).toBe(false);  // floating cap removed
    expect(r.fixes?.length).toBeGreaterThanOrEqual(3);
  });

  it('leaves a build with no chimney cap untouched (low hearth campfire is not a cap)', () => {
    const blocks: AuthoringBlock[] = [{ state: 1, pos: [0, 0, 0] }, { state: 1, pos: [0, 10, 0] }, { state: 2, pos: [3, 1, 3] }];
    const r = fixChimney(blocks, palette, ctx);
    expect(r.blocks).toBe(blocks); // no-op (same reference)
  });
});
