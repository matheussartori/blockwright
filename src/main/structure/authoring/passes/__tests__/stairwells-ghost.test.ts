import { describe, it, expect } from 'vitest';
import { rebuildStairwells } from '../stairwells';
import { posKey } from '../../geometry';
import type { AuthoringBlock, AuthoringPaletteEntry } from '../../types';

// "One stair per storey" — a single tall storey (planes at y=0 and y=12) carrying TWO
// climbing flights: a full-height one the pass treats as the gap's climb, and a SHORT
// partial one that falls below the per-gap hint threshold (so the per-gap strip misses it)
// — the "stair that goes up but leads nowhere" the user keeps finding. The ghost sweep must
// remove the partial flight so the storey is left with a single clean climb.
const W = 13, D = 13;
const PLANES = [0, 12];

const STONE = 1, STAIR = 2;

function shell(blocks: AuthoringBlock[]): void {
  for (const y of PLANES) for (let x = 0; x < W; x++) for (let z = 0; z < D; z++) blocks.push({ state: STONE, pos: [x, y, z] });
  for (let y = 1; y < 12; y++) for (let x = 0; x < W; x++) for (let z = 0; z < D; z++) {
    if (x === 0 || x === W - 1 || z === 0 || z === D - 1) blocks.push({ state: STONE, pos: [x, y, z] });
  }
}

function scene(): { blocks: AuthoringBlock[]; palette: AuthoringPaletteEntry[] } {
  const palette: AuthoringPaletteEntry[] = [
    { Name: 'minecraft:air' },
    { Name: 'minecraft:stone_bricks' },
    { Name: 'minecraft:stone_brick_stairs', Properties: { facing: 'east', half: 'bottom', shape: 'straight' } },
  ];
  const blocks: AuthoringBlock[] = [];
  shell(blocks);
  // Flight A (the real climb): a tall east-ascending run at z=3, rising y=1..10.
  for (let i = 0; i <= 9; i++) blocks.push({ state: STAIR, pos: [1 + i, 1 + i, 3] });
  // Flight B (the GHOST): a short east-ascending run at z=9, rising only y=1..4 — under the
  // per-gap hint bar for this tall storey, so the per-gap strip never collected it.
  for (let i = 0; i <= 3; i++) blocks.push({ state: STAIR, pos: [1 + i, 1 + i, 9] });
  return { blocks, palette };
}

describe('rebuildStairwells — ghost-stair sweep (one climb per storey)', () => {
  it('removes the second, partial flight and reports the fix', () => {
    const { blocks, palette } = scene();
    const out = rebuildStairwells(blocks, palette, { size: [W, 16, D], floorPlanes: PLANES });
    const isStair = (s: number) => (out.palette[s]?.Name ?? '').includes('_stairs');
    const stairAt = (x: number, y: number, z: number) =>
      out.blocks.some((b) => posKey(...b.pos) === posKey(x, y, z) && isStair(b.state));
    // The ghost flight at z=9 is gone.
    for (let i = 0; i <= 3; i++) expect(stairAt(1 + i, 1 + i, 9), `ghost tread ${i}`).toBe(false);
    // No climbing stair remains in the z=9 ghost column at all.
    const ghostStairs = out.blocks.filter((b) => b.pos[2] === 9 && isStair(b.state));
    expect(ghostStairs.length).toBe(0);
    expect((out.fixes ?? []).some((f) => /ghost/.test(f))).toBe(true);
  });

  it('keeps a lone, single climb untouched by the sweep (no false positive)', () => {
    const { palette } = scene();
    const blocks: AuthoringBlock[] = [];
    shell(blocks);
    // Just one flight — the pass rebuilds it, but never reports a ghost removal.
    for (let i = 0; i <= 9; i++) blocks.push({ state: STAIR, pos: [1 + i, 1 + i, 3] });
    const out = rebuildStairwells(blocks, palette, { size: [W, 16, D], floorPlanes: PLANES });
    expect((out.fixes ?? []).some((f) => /ghost/.test(f))).toBe(false);
  });
});
