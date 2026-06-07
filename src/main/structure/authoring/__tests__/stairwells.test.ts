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

  it('opens 3 blocks of headroom over the run so a climber never bumps their head', () => {
    // Floors at y=0,5,10. A flight climbing +x at z=3 in the 0→5 gap. The stairwell
    // opening must clear THREE blocks above each tread where the run pierces the upper
    // floor (the in-game "bate a cabeça" fix), not just two — so the floor cell two above
    // a lower tread is carved out.
    const blocks = storeyShell(9, 7, [0, 5, 10]);
    blocks.push(
      { state: 3, pos: [2, 1, 3] }, { state: 3, pos: [3, 2, 3] },
      { state: 3, pos: [4, 3, 3] }, { state: 3, pos: [5, 4, 3] },
    );
    const r = rebuildStairwells(blocks, palette, ctx);
    // The tread at y=2 (x=3): the cell 3 above is the upper floor (y=5) — it must be
    // opened, not left as a solid plank ceiling the player walks into.
    expect(at(r, 3, 3, 3)).toBeUndefined();              // +1 air
    expect(at(r, 3, 4, 3)).toBeUndefined();              // +2 air
    expect(at(r, 3, 5, 3)?.Name).not.toBe('minecraft:oak_planks'); // +3 opened (was floor)
  });

  it('never breaks a STRUCTURE block to fit a stair — a wall in the path forces a ladder', () => {
    // A flight 0→5 climbing +x at z=3, but a stone PILLAR (state 1, structural) blocks the
    // headroom over a middle tread. Every straight-run direction from that column runs into
    // a wall or the pillar, so a clean stair can't fit. The pass must NOT gouge the wall to
    // make room (the recurring "stairs destroying the structure" defect) — it falls back to
    // a continuous ladder, and the blocking wall survives untouched.
    const blocks = storeyShell(9, 7, [0, 5, 10]);
    blocks.push(
      { state: 3, pos: [2, 1, 3] }, { state: 3, pos: [3, 2, 3] },
      { state: 3, pos: [4, 3, 3] }, { state: 3, pos: [5, 4, 3] },
      { state: 1, pos: [4, 4, 3] }, // a wall in the headroom over the tread at (4,3,3)
    );
    const r = rebuildStairwells(blocks, palette, ctx);
    expect(at(r, 4, 4, 3)?.Name).toBe('minecraft:stone'); // the wall was never carved
    expect(r.blocks.some((b) => r.palette[b.state]?.Name === 'minecraft:ladder')).toBe(true);
    expect(r.fixes?.join(' ')).toMatch(/ladder/);
  });

  it('floors over the orphan hole left where an abandoned climb (and its floor opening) was stripped', () => {
    // The model placed TWO climbs for the SAME 0→5 gap — flight A at z=3 and flight B at
    // z=5 — and cut a floor opening over each. The rebuild consolidates to ONE clean flight
    // (A) and strips B; B's old floor opening then survives as a "buraco misterioso" beside
    // the real stairwell. After the rebuild that orphan opening must be floored back, while
    // the kept stairwell's opening stays open.
    const blocks = storeyShell(9, 7, [0, 5, 10]).filter(
      (b) => posKey(...b.pos) !== posKey(4, 5, 5) && posKey(...b.pos) !== posKey(5, 5, 5),
    );
    blocks.push(
      { state: 3, pos: [2, 1, 3] }, { state: 3, pos: [3, 2, 3] }, // flight A (kept)
      { state: 3, pos: [4, 3, 3] }, { state: 3, pos: [5, 4, 3] },
      { state: 3, pos: [2, 1, 5] }, { state: 3, pos: [3, 2, 5] }, // flight B (abandoned)
      { state: 3, pos: [4, 3, 5] }, { state: 3, pos: [5, 4, 5] },
    );
    const r = rebuildStairwells(blocks, palette, ctx);
    // B's orphan opening (over the stripped flight, not part of the rebuilt stair) is floored.
    expect(at(r, 4, 5, 5)?.Name).toBe('minecraft:oak_planks');
    expect(at(r, 5, 5, 5)?.Name).toBe('minecraft:oak_planks');
    expect(r.fixes?.join(' ')).toMatch(/orphan stairwell-remnant/);
    // The kept stairwell's opening over flight A stays OPEN (not re-floored).
    expect(at(r, 5, 5, 3)?.Name).not.toBe('minecraft:oak_planks');
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
