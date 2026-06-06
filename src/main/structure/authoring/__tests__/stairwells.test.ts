import { describe, expect, it } from 'vitest';
import { rebuildStairwells } from '../passes';
import { posKey } from '../geometry';
import type { AuthoringBlock, AuthoringPaletteEntry } from '../types';

const ctx = { size: [16, 16, 16] as [number, number, number] };

// Palette: 0=air, 1=stone (walls), 2=planks (floors), 3=oak stairs (east).
const palette: AuthoringPaletteEntry[] = [
  { Name: 'minecraft:air' },
  { Name: 'minecraft:stone' },
  { Name: 'minecraft:oak_planks' },
  { Name: 'minecraft:oak_stairs', Properties: { facing: 'east', half: 'bottom' } },
];

/** A multi-storey shell: full floor PLANES (planks) at each y in `floorYs`, a perimeter
 *  wall (stone) on every y from the lowest to the highest floor. The floors span the
 *  whole W×D footprint so floor-plane detection picks them up; the top floor has a
 *  storey beneath it so its interior cells aren't read as exterior shell. */
function storeyShell(W: number, D: number, floorYs: number[]): AuthoringBlock[] {
  const out: AuthoringBlock[] = [];
  const top = Math.max(...floorYs);
  for (const fy of floorYs) {
    for (let x = 0; x < W; x++) for (let z = 0; z < D; z++) out.push({ state: 2, pos: [x, fy, z] });
  }
  for (let y = 0; y <= top; y++) {
    for (let x = 0; x < W; x++) for (let z = 0; z < D; z++) {
      if ((x === 0 || x === W - 1 || z === 0 || z === D - 1) && !floorYs.includes(y)) out.push({ state: 1, pos: [x, y, z] });
    }
  }
  return out;
}

const at = (r: { blocks: AuthoringBlock[]; palette: AuthoringPaletteEntry[] }, x: number, y: number, z: number) => {
  const b = r.blocks.find((bl) => posKey(...bl.pos) === posKey(x, y, z));
  return b ? r.palette[b.state] : undefined;
};
const isStair = (e?: AuthoringPaletteEntry): boolean => (e?.Name ?? '').endsWith('_stairs');

describe('rebuildStairwells', () => {
  it('rebuilds a flight missing its top step into a full run that reaches the upper floor', () => {
    // Floors at y=0, y=5, y=10 (storey height 5). A flight in the 0→5 gap climbing +x
    // but stopping one step short of the upper floor (top tread at y=4, not y=5).
    const blocks = storeyShell(9, 7, [0, 5, 10]);
    blocks.push(
      { state: 3, pos: [2, 1, 3] }, { state: 3, pos: [3, 2, 3] },
      { state: 3, pos: [4, 3, 3] }, { state: 3, pos: [5, 4, 3] },
    );
    const r = rebuildStairwells(blocks, palette, ctx);
    // The full clean run: bottom step at y=1 up to the TOP step at y=5 (lands on floor 5).
    expect(isStair(at(r, 2, 1, 3))).toBe(true);
    expect(isStair(at(r, 6, 5, 3))).toBe(true); // the previously-missing top step
    // The upper floor was opened over the run (a stairwell hole, not a solid ceiling).
    expect(at(r, 5, 5, 3)?.Name).not.toBe('minecraft:oak_planks');
    expect(r.fixes?.join(' ')).toMatch(/staircase/);
  });

  it('converts a flight with no room for a straight run into a wall ladder', () => {
    // A shallow interior (x=1..3): a full 5-step run (storey height 5) would drive its
    // top tread into the far wall, so the straight stair can't fit — it falls back to a
    // ladder hung on the x=0 wall behind the bottom step.
    const blocks = storeyShell(5, 7, [0, 5, 10]);
    blocks.push(
      { state: 3, pos: [1, 1, 3] }, { state: 3, pos: [2, 2, 3] }, { state: 3, pos: [3, 3, 3] },
    );
    const r = rebuildStairwells(blocks, palette, ctx);
    const climb = [1, 2, 3, 4, 5].map((y) => at(r, 1, y, 3)?.Name);
    expect(climb.filter((n) => n === 'minecraft:ladder').length).toBeGreaterThanOrEqual(3);
    expect(r.fixes?.join(' ')).toMatch(/ladder/);
  });

  it('clears furniture from the headroom + step-off walkway so nothing blocks the climb', () => {
    // A flight 0→5 climbing +x at z=3 in a roomy interior. The model dumped a bookshelf
    // (state 4) in the 3rd headroom cell over a tread and in the step-off walkway — both
    // must be cleared so the player's head doesn't hit and the path off the stair is open.
    const pal: AuthoringPaletteEntry[] = [...palette, { Name: 'minecraft:bookshelf' }];
    const blocks = storeyShell(11, 7, [0, 5, 10]);
    blocks.push(
      { state: 3, pos: [2, 1, 3] }, { state: 3, pos: [3, 2, 3] },
      { state: 3, pos: [4, 3, 3] }, { state: 3, pos: [5, 4, 3] },
      { state: 4, pos: [4, 6, 3] }, // 3rd headroom cell over the tread at (4,3,3)
      { state: 4, pos: [8, 6, 3] }, // 2nd step-off walkway cell past the top arrival
    );
    const r = rebuildStairwells(blocks, pal, ctx);
    expect(at(r, 4, 6, 3)?.Name).not.toBe('minecraft:bookshelf'); // head-bonk block cleared
    expect(at(r, 8, 6, 3)?.Name).not.toBe('minecraft:bookshelf'); // approach walkway cleared
  });

  it('leaves a single-storey build (one floor plane) untouched', () => {
    const blocks: AuthoringBlock[] = [
      ...storeyShell(9, 7, [0]),
      { state: 3, pos: [3, 1, 3] }, { state: 3, pos: [4, 2, 3] }, // a lone decorative stair
    ];
    const r = rebuildStairwells(blocks, palette, ctx);
    expect(r.blocks).toBe(blocks); // no-op (same reference)
  });

  it('ignores a roof slope built from stairs (it tops out above the ceiling)', () => {
    // Two floors + a gable roof of stairs above the top floor: the roof must not be
    // mistaken for a flight and rebuilt.
    const blocks = storeyShell(9, 7, [0, 6]);
    for (let z = 0; z < 7; z++) {
      blocks.push({ state: 3, pos: [0, 7, z] }, { state: 3, pos: [1, 8, z] }, { state: 3, pos: [2, 9, z] });
    }
    const r = rebuildStairwells(blocks, palette, ctx);
    // No hint inside a storey → nothing rebuilt; the roof stairs are still there.
    expect(isStair(at(r, 1, 8, 3))).toBe(true);
    expect(r.blocks).toBe(blocks);
  });
});
