import { describe, expect, it } from 'vitest';
import { fixCirculation } from '../passes';
import { posKey } from '../geometry';
import type { AuthoringBlock, AuthoringPaletteEntry } from '../types';

const ctx = { size: [16, 16, 16] as [number, number, number] };

// 0 = stone (ground floor + walls), 1 = oak planks (upper floor), 2 = ladder (north),
// 3 = oak stairs (east), 4 = bricks (chimney).
const palette: AuthoringPaletteEntry[] = [
  { Name: 'minecraft:stone' },
  { Name: 'minecraft:oak_planks' },
  { Name: 'minecraft:ladder', Properties: { facing: 'north' } },
  { Name: 'minecraft:oak_stairs', Properties: { facing: 'east', half: 'bottom' } },
  { Name: 'minecraft:bricks' },
];
const STONE = 0, PLANK = 1, LADDER = 2, STAIR = 3, BRICK = 4;

/** A two-storey shell: full floor planes at y=0 (stone) and y=5 (planks), perimeter
 *  walls y=1..4 — so the floor-plane detector finds y=0 and y=5. */
function shell(): AuthoringBlock[] {
  const out: AuthoringBlock[] = [];
  const W = 7, D = 7;
  for (let x = 0; x < W; x++) for (let z = 0; z < D; z++) {
    out.push({ state: STONE, pos: [x, 0, z] }, { state: PLANK, pos: [x, 5, z] });
  }
  for (let y = 1; y <= 4; y++) for (let x = 0; x < W; x++) for (let z = 0; z < D; z++) {
    if (x === 0 || x === W - 1 || z === 0 || z === D - 1) out.push({ state: STONE, pos: [x, y, z] });
  }
  return out;
}
const has = (r: { blocks: AuthoringBlock[] }, x: number, y: number, z: number): boolean =>
  r.blocks.some((b) => posKey(...b.pos) === posKey(x, y, z));
const nameAt = (r: { blocks: AuthoringBlock[]; palette: AuthoringPaletteEntry[] }, x: number, y: number, z: number): string | undefined => {
  const b = r.blocks.find((bl) => posKey(...bl.pos) === posKey(x, y, z));
  return b ? r.palette[b.state].Name : undefined;
};

describe('fixCirculation: drop broken ladders', () => {
  it('keeps a real ladder run (>=2 rungs, solid base, below the ceiling)', () => {
    const blocks = shell().concat([
      { state: LADDER, pos: [3, 1, 3] }, { state: LADDER, pos: [3, 2, 3] },
      { state: LADDER, pos: [3, 3, 3] }, { state: LADDER, pos: [3, 4, 3] },
    ]);
    const r = fixCirculation(blocks, palette, ctx);
    expect(has(r, 3, 1, 3)).toBe(true);
    expect(has(r, 3, 4, 3)).toBe(true);
  });

  it('drops a lone 1-rung ladder stub', () => {
    const blocks = shell().concat([{ state: LADDER, pos: [3, 2, 3] }]);
    const r = fixCirculation(blocks, palette, ctx);
    expect(has(r, 3, 2, 3)).toBe(false);
    expect(r.fixes?.join(' ')).toMatch(/non-functional ladder/);
  });

  it('drops a ladder run floating over air (no solid base to step onto)', () => {
    // Base rung at y=2 with empty interior below (y=1 is open room, not floor).
    const blocks = shell().concat([{ state: LADDER, pos: [3, 2, 3] }, { state: LADDER, pos: [3, 3, 3] }]);
    const r = fixCirculation(blocks, palette, ctx);
    expect(has(r, 3, 2, 3)).toBe(false);
    expect(has(r, 3, 3, 3)).toBe(false);
  });

  it('drops a ladder stranded above the ceiling plane (roof void)', () => {
    // Base at y=6 sits on the y=5 planks (solid) but the whole run is above the ceiling.
    const blocks = shell().concat([{ state: LADDER, pos: [3, 6, 3] }, { state: LADDER, pos: [3, 7, 3] }]);
    const r = fixCirculation(blocks, palette, ctx);
    expect(has(r, 3, 6, 3)).toBe(false);
    expect(has(r, 3, 7, 3)).toBe(false);
  });
});

describe('fixCirculation: cap orphan floor holes', () => {
  it('caps a 1×1 hole ringed by the floor material with no shaft below', () => {
    // Remove one planks cell from the upper floor → a hole at (3,5,3).
    const blocks = shell().filter((b) => posKey(...b.pos) !== posKey(3, 5, 3));
    const r = fixCirculation(blocks, palette, ctx);
    expect(nameAt(r, 3, 5, 3)).toBe('minecraft:oak_planks');
    expect(r.fixes?.join(' ')).toMatch(/orphan floor hole/);
  });

  it('preserves a floor hole that a ladder shaft climbs through', () => {
    const blocks = shell()
      .filter((b) => posKey(...b.pos) !== posKey(3, 5, 3)) // the shaft exit at the floor
      // a real ladder rising from the lower floor (base on the y=0 stone) up to the exit
      .concat([
        { state: LADDER, pos: [3, 1, 3] }, { state: LADDER, pos: [3, 2, 3] },
        { state: LADDER, pos: [3, 3, 3] }, { state: LADDER, pos: [3, 4, 3] },
      ]);
    const r = fixCirculation(blocks, palette, ctx);
    expect(has(r, 3, 1, 3)).toBe(true);  // the ladder is kept (functional)
    expect(has(r, 3, 5, 3)).toBe(false); // left open — you climb out here
  });

  it('preserves a floor hole that a stair shaft climbs through', () => {
    const blocks = shell()
      .filter((b) => posKey(...b.pos) !== posKey(3, 5, 3))
      .concat([{ state: STAIR, pos: [2, 3, 3] }, { state: STAIR, pos: [3, 4, 3] }]);
    const r = fixCirculation(blocks, palette, ctx);
    expect(has(r, 3, 5, 3)).toBe(false);
  });

  it('does NOT cap a brick chimney flue threading the floor', () => {
    // A 1×1 flue at (3,5,3) ringed by bricks (≠ the plank floor) — must stay open.
    const blocks = shell()
      .filter((b) => posKey(...b.pos) !== posKey(3, 5, 3))
      .concat([
        { state: BRICK, pos: [4, 5, 3] }, { state: BRICK, pos: [2, 5, 3] },
        { state: BRICK, pos: [3, 5, 4] }, { state: BRICK, pos: [3, 5, 2] },
      ]);
    const r = fixCirculation(blocks, palette, ctx);
    expect(has(r, 3, 5, 3)).toBe(false); // flue left open
  });
});
