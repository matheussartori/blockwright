import { describe, expect, it } from 'vitest';
import { stairsToLadder } from '../passes';
import { posKey } from '../geometry';
import type { AuthoringBlock, AuthoringPaletteEntry } from '../types';

const ctx = { size: [16, 16, 16] as [number, number, number] };

/** A sealed solid box perimeter (so computeEnvelope marks the faces as shell, the
 *  interior as carvable) — same trick the other pass tests use. */
function sealed(W: number, H: number, D: number, idx: number): AuthoringBlock[] {
  const out: AuthoringBlock[] = [];
  for (let x = 0; x < W; x++) for (let y = 0; y < H; y++) for (let z = 0; z < D; z++) {
    if (x === 0 || x === W - 1 || y === 0 || y === H - 1 || z === 0 || z === D - 1) out.push({ state: idx, pos: [x, y, z] });
  }
  return out;
}

/** The block (with its palette entry resolved) sitting at a cell, or undefined. */
function entryAt(r: { blocks: AuthoringBlock[]; palette: AuthoringPaletteEntry[] }, x: number, y: number, z: number) {
  const b = r.blocks.find((bl) => posKey(...bl.pos) === posKey(x, y, z));
  return b ? r.palette[b.state] : undefined;
}
const hasStairAt = (r: { blocks: AuthoringBlock[]; palette: AuthoringPaletteEntry[] }, x: number, y: number, z: number): boolean =>
  (entryAt(r, x, y, z)?.Name ?? '').endsWith('_stairs');

describe('stairsToLadder: convert an unfixable cramped flight to a wall ladder', () => {
  // 1 = stone shell, 2 = oak stairs (facing set per scene).
  const stone: AuthoringPaletteEntry = { Name: 'minecraft:stone' };

  it('converts a flight boxed against the shell on both flanks into a flush ladder', () => {
    // Interior is a single column wide (x=1) between two outer walls (x=0, x=2): a flight
    // climbing +z at x=1 is walled on both flanks — insetStairs can't move it.
    const stairS: AuthoringPaletteEntry = { Name: 'minecraft:oak_stairs', Properties: { facing: 'south', half: 'bottom' } };
    const palette: AuthoringPaletteEntry[] = [{ Name: 'minecraft:air' }, stone, stairS];
    const blocks = sealed(3, 8, 8, 1);
    blocks.push({ state: 2, pos: [1, 1, 1] }, { state: 2, pos: [1, 2, 2] }, { state: 2, pos: [1, 3, 3] });

    const r = stairsToLadder(blocks, palette, ctx);
    // The flight is gone…
    expect(hasStairAt(r, 1, 1, 1)).toBe(false);
    expect(hasStairAt(r, 1, 3, 3)).toBe(false);
    // …replaced by a ladder column in the bottom step's cell, leaning away from a wall.
    const bottom = entryAt(r, 1, 1, 1);
    expect(bottom?.Name).toBe('minecraft:ladder');
    // It hangs on the z=0 wall behind the bottom step (the first solid wall found), facing +z.
    expect(bottom?.Properties?.facing).toBe('south');
    expect(entryAt(r, 1, 2, 1)?.Name).toBe('minecraft:ladder');
    expect(entryAt(r, 1, 3, 1)?.Name).toBe('minecraft:ladder');
    expect(r.fixes?.join(' ')).toMatch(/wall ladder/);
  });

  it('converts a flight whose headroom runs into the roof but has a wall to hang on', () => {
    // Flight climbing +x flush against the z=0 wall, reaching the roof — carveStairwells
    // couldn't open its headroom without punching the roof, so it becomes a ladder.
    const stairE: AuthoringPaletteEntry = { Name: 'minecraft:oak_stairs', Properties: { facing: 'east', half: 'bottom' } };
    const palette: AuthoringPaletteEntry[] = [{ Name: 'minecraft:air' }, stone, stairE];
    const blocks = sealed(7, 7, 7, 1); // roof at y=6
    blocks.push(
      { state: 2, pos: [2, 1, 1] }, { state: 2, pos: [3, 2, 1] },
      { state: 2, pos: [4, 3, 1] }, { state: 2, pos: [5, 4, 1] }, // top tread headroom at y=6 = roof
    );
    const r = stairsToLadder(blocks, palette, ctx);
    expect(hasStairAt(r, 2, 1, 1)).toBe(false);
    const bottom = entryAt(r, 2, 1, 1);
    expect(bottom?.Name).toBe('minecraft:ladder');
    expect(bottom?.Properties?.facing).toBe('south'); // hangs on the z=0 wall, faces +z
    expect(entryAt(r, 2, 4, 1)?.Name).toBe('minecraft:ladder');
  });

  it('leaves a well-placed flight with clearance untouched (no false conversion)', () => {
    // A flight in the open middle of a roomy box: off both walls, headroom clear.
    const stairE: AuthoringPaletteEntry = { Name: 'minecraft:oak_stairs', Properties: { facing: 'east', half: 'bottom' } };
    const palette: AuthoringPaletteEntry[] = [{ Name: 'minecraft:air' }, stone, stairE];
    const blocks = sealed(9, 9, 9, 1);
    blocks.push({ state: 2, pos: [3, 1, 4] }, { state: 2, pos: [4, 2, 4] }, { state: 2, pos: [5, 3, 4] });
    const r = stairsToLadder(blocks, palette, ctx);
    expect(r.blocks).toBe(blocks); // untouched (same reference)
    expect(hasStairAt(r, 3, 1, 4)).toBe(true);
  });
});
