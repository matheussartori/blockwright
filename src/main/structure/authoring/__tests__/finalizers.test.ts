import { describe, expect, it } from 'vitest';
import { fixChimney, insetStairs } from '../passes';
import { posKey } from '../geometry';
import type { AuthoringBlock, AuthoringPaletteEntry } from '../types';

const ctx = { size: [16, 16, 16] as [number, number, number] };
const has = (blocks: AuthoringBlock[], state: number, x: number, y: number, z: number): boolean =>
  blocks.some((b) => b.state === state && b.pos[0] === x && b.pos[1] === y && b.pos[2] === z);

/** A sealed solid box perimeter (so computeEnvelope marks the faces as shell, the
 *  interior as carvable) — same trick the carve-stairwells tests use. */
function sealed(W: number, H: number, D: number, idx: number): AuthoringBlock[] {
  const out: AuthoringBlock[] = [];
  for (let x = 0; x < W; x++) for (let y = 0; y < H; y++) for (let z = 0; z < D; z++) {
    if (x === 0 || x === W - 1 || y === 0 || y === H - 1 || z === 0 || z === D - 1) out.push({ state: idx, pos: [x, y, z] });
  }
  return out;
}

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

describe('insetStairs: keep a flight off the wall (multi-storey finalizer)', () => {
  const stair: AuthoringPaletteEntry = { Name: 'minecraft:oak_stairs', Properties: { facing: 'east', half: 'bottom' } };
  const palette: AuthoringPaletteEntry[] = [{ Name: 'minecraft:air' }, { Name: 'minecraft:cobblestone' }, stair];

  it('shifts a flight pressed against the wall one cell into the open interior', () => {
    const blocks = sealed(8, 8, 8, 1);
    // A 3-step flight at z=1, flush against the z=0 wall, ascending +x.
    blocks.push({ state: 2, pos: [2, 1, 1] }, { state: 2, pos: [3, 2, 1] }, { state: 2, pos: [4, 3, 1] });
    const r = insetStairs(blocks, palette, ctx);
    // Moved to z=2 (one block off the wall), cleared from z=1.
    expect(has(r.blocks, 2, 2, 1, 2)).toBe(true);
    expect(has(r.blocks, 2, 4, 3, 2)).toBe(true);
    expect(r.blocks.some((b) => posKey(...b.pos) === posKey(2, 1, 1))).toBe(false);
    expect(r.fixes?.length).toBeGreaterThanOrEqual(1);
  });

  it('warns (does not break the build) when the flight cannot be inset safely', () => {
    const blocks = sealed(8, 8, 8, 1);
    blocks.push({ state: 2, pos: [2, 1, 1] }, { state: 2, pos: [3, 2, 1] }, { state: 2, pos: [4, 3, 1] });
    // Block the only open side so the inset is unsafe.
    blocks.push({ state: 1, pos: [2, 1, 2] }, { state: 1, pos: [3, 2, 2] }, { state: 1, pos: [4, 3, 2] });
    const r = insetStairs(blocks, palette, ctx);
    expect(has(r.blocks, 2, 2, 1, 1)).toBe(true); // flight left where it was
    expect(r.warnings?.length).toBeGreaterThanOrEqual(1);
  });
});
