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

  it('never breaks a STRUCTURE block to fit a stair — the climb reroutes around the wall', () => {
    // A flight 0→5 climbing +x at z=3, but a stone PILLAR (state 1, structural) blocks the
    // headroom over a middle tread. The pass must NOT gouge the wall to make room (the
    // recurring "stairs destroying the structure" defect) — it reroutes the connector to a
    // clear column nearby (a clean stair one row over beats a ladder, rule 1), and the
    // blocking wall survives untouched.
    const blocks = storeyShell(9, 7, [0, 5, 10]);
    blocks.push(
      { state: 3, pos: [2, 1, 3] }, { state: 3, pos: [3, 2, 3] },
      { state: 3, pos: [4, 3, 3] }, { state: 3, pos: [5, 4, 3] },
      { state: 1, pos: [4, 4, 3] }, // a wall in the headroom over the tread at (4,3,3)
    );
    const r = rebuildStairwells(blocks, palette, ctx);
    expect(at(r, 4, 4, 3)?.Name).toBe('minecraft:stone'); // the wall was never carved
    // A connector still serves the gap — a rerouted stair or, failing that, a ladder.
    const climbs = r.blocks.filter((b) => {
      const n = r.palette[b.state]?.Name ?? '';
      return n === 'minecraft:ladder' || (n.endsWith('_stairs') && b.pos[1] <= 5);
    });
    expect(climbs.length).toBeGreaterThanOrEqual(5);
    expect(r.fixes?.join(' ')).toMatch(/staircase|ladder/);
  });

  it('never carves a WALL that passes through the upper floor — the stairwell opening only eats true floor', () => {
    // The recurring "stairs destroyed the external wall" defect. A wall column crosses the
    // upper floor plane (y=5) at a cell that lies in the stair's opening path, continuing
    // ABOVE the floor (y=6,7) — so it's a real wall, not floor. The pass must classify it as
    // a wall and refuse to carve it as part of the stairwell opening; it climbs another way.
    const blocks = storeyShell(9, 7, [0, 5, 10])
      // The wall replaces the floor plank where it crosses the plane (one block per cell).
      .filter((b) => posKey(...b.pos) !== posKey(3, 5, 3));
    // A flight climbing +x at z=3 from x=1 (treads at x=1..4, none at x=3,y=5).
    blocks.push(
      { state: 3, pos: [1, 1, 3] }, { state: 3, pos: [2, 2, 3] },
      { state: 3, pos: [3, 3, 3] }, { state: 3, pos: [4, 4, 3] },
    );
    // A wall column AT and ABOVE the upper floor at (3,*,3) — a structural block sitting on
    // the floor plane (y=5) with more solid directly above (y=6,7): a wall, not a floor.
    // It sits in the +x flight's opening path (the cell over the tread at (3,3,3)).
    blocks.push({ state: 1, pos: [3, 5, 3] }, { state: 1, pos: [3, 6, 3] }, { state: 1, pos: [3, 7, 3] });
    const r = rebuildStairwells(blocks, palette, ctx);
    // The wall at the floor-plane level (3,5,3) — and the block above it — survive intact:
    // the opening must reroute (a ladder / another direction), never gouge the wall.
    expect(at(r, 3, 5, 3)?.Name).toBe('minecraft:stone');
    expect(at(r, 3, 6, 3)?.Name).toBe('minecraft:stone');
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

  it('cuts the stairwell opening through a DOUBLE-THICK floor (both slabs are carvable)', () => {
    // The upper floor is two slabs thick (planks at y=5 AND y=6; walk surface y=6).
    // The lower slab must read as carvable FLOOR, not as a protected wall — otherwise
    // no stair or ladder can ever pierce a double floor and the pass bails with the
    // model's broken flight left intact.
    const blocks = storeyShell(11, 7, [0, 5, 6]);
    blocks.push(
      { state: 3, pos: [2, 1, 3] }, { state: 3, pos: [3, 2, 3] },
      { state: 3, pos: [4, 3, 3] }, { state: 3, pos: [5, 4, 3] },
    );
    const r = rebuildStairwells(blocks, palette, ctx);
    expect(r.warnings ?? []).toHaveLength(0);
    expect(r.fixes?.join(' ')).toMatch(/staircase|ladder/);
    // The run reaches the WALK surface (y=6) — the top tread sits on the upper slab level.
    expect(isStair(at(r, 7, 6, 3))).toBe(true);
    // Both slabs were pierced where the run crosses them (no plank left in the shaft).
    expect(at(r, 6, 5, 3)?.Name).not.toBe('minecraft:oak_planks');
    expect(at(r, 6, 6, 3)?.Name).not.toBe('minecraft:oak_planks');
  });

  it('leaves a single-storey build (one floor plane) untouched', () => {
    const blocks: AuthoringBlock[] = [
      ...storeyShell(9, 7, [0]),
      { state: 3, pos: [3, 1, 3] }, { state: 3, pos: [4, 2, 3] }, // a lone decorative stair
    ];
    const r = rebuildStairwells(blocks, palette, ctx);
    expect(r.blocks).toBe(blocks); // no-op (same reference)
  });

  it('warns instead of bailing silently when a real climb exists but storey planes were not recognised', () => {
    // One dominant 16×16 ground slab; a small 5×4 upper deck falls under the 60% plane
    // cut, so detection sees ONE plane — but the model clearly built a storey climb
    // (a 1-wide flight rising 4). The pass must surface the miss, not vanish quietly.
    const blocks: AuthoringBlock[] = [];
    for (let x = 0; x < 16; x++) for (let z = 0; z < 16; z++) blocks.push({ state: 2, pos: [x, 0, z] });
    for (let x = 2; x < 7; x++) for (let z = 2; z < 6; z++) blocks.push({ state: 2, pos: [x, 5, z] });
    blocks.push(
      { state: 3, pos: [8, 1, 3] }, { state: 3, pos: [9, 2, 3] },
      { state: 3, pos: [10, 3, 3] }, { state: 3, pos: [11, 4, 3] }, { state: 3, pos: [12, 5, 3] },
    );
    const r = rebuildStairwells(blocks, palette, ctx);
    expect(r.blocks).toBe(blocks); // geometry untouched
    expect((r.warnings ?? []).join(' ')).toMatch(/floor planes/);
  });

  it('does not warn on a single-storey cottage whose only climb is its stair ROOF', () => {
    // One floor plane + a WIDE bank of parallel same-facing chains rising 4 (a gable
    // slope, not a staircase) — the silent-bail warning must not fire on a roof.
    const blocks: AuthoringBlock[] = [];
    for (let x = 0; x < 9; x++) for (let z = 0; z < 7; z++) blocks.push({ state: 2, pos: [x, 0, z] });
    for (let z = 0; z < 7; z++) {
      for (let i = 0; i < 5; i++) blocks.push({ state: 3, pos: [i, 4 + i, z] });
    }
    const r = rebuildStairwells(blocks, palette, ctx);
    expect(r.warnings).toBeUndefined();
    expect(r.blocks).toBe(blocks);
  });

  it('ignores a roof slope built from stairs (it tops out above the ceiling)', () => {
    // Two floors + a full gable roof of stairs over the top floor: the roof must not be
    // mistaken for a flight and rebuilt — but the storey gap UNDER the gable (an attic
    // with covered standing room) that the model never served still gets a connector
    // ADDED (rule 5: every storey gap gets one).
    const blocks = storeyShell(9, 7, [0, 6]);
    for (let z = 0; z < 7; z++) {
      for (let i = 0; i < 5; i++) {
        blocks.push({ state: 3, pos: [i, 7 + i, z] });
        if (i < 4) blocks.push({ state: 3, pos: [8 - i, 7 + i, z] });
      }
    }
    const r = rebuildStairwells(blocks, palette, ctx);
    // The roof slopes are untouched — never stripped as a flight.
    expect(isStair(at(r, 1, 8, 3))).toBe(true);
    expect(isStair(at(r, 0, 7, 0))).toBe(true);
    expect(isStair(at(r, 7, 8, 6))).toBe(true);
    expect(r.fixes?.join(' ')).toMatch(/added .* missing/);
  });

  it('ADDS a connector for a storey gap the model never attempted (every gap gets one)', () => {
    // Two real storeys (people live above floor y=5 — there is a floor at y=10 over it)
    // and NO climb anywhere: the old pass silently did nothing and the upper floor was
    // unreachable. Now the gap is planned from scratch — a stair if one fits, else a
    // flush wall ladder — and reaches the upper floor.
    const blocks = storeyShell(9, 7, [0, 5, 10]);
    const r = rebuildStairwells(blocks, palette, ctx);
    expect(r.fixes?.join(' ')).toMatch(/added .* missing/);
    const names = r.blocks.map((b) => r.palette[b.state]?.Name ?? '');
    expect(names.some((n) => n === 'minecraft:ladder' || n.endsWith('_stairs'))).toBe(true);
  });

  it('does NOT force a ladder up to a bare ceiling deck (no standing room above it)', () => {
    // One storey under a flat ceiling deck with nothing above it: the topmost "gap" leads
    // nowhere a player could stand, so no connector is forced — a cottage must not grow a
    // ladder to its own roof.
    const blocks = storeyShell(9, 7, [0, 5]);
    const r = rebuildStairwells(blocks, palette, ctx);
    expect(r.blocks).toBe(blocks); // untouched
  });

  it('keeps each storey served when ONE continuous ladder spans several gaps (v6 farmhouse defect)', () => {
    // The real-world failure: the model laid a single wall ladder from the cellar all the
    // way past floor 2 (one run crossing THREE gaps). The old pass attributed the whole
    // run to the bottom gap, rebuilt the cellar connector, and rule 4 then stripped the
    // ENTIRE run — deleting the only climb serving floors 1→2. Each gap must keep a
    // climbable connector after the rebuild.
    const blocks = storeyShell(9, 7, [0, 5, 10, 15])
      // Open the shaft through each upper floor at the ladder column (the model punched it).
      .filter((b) => ![posKey(1, 5, 3), posKey(1, 10, 3), posKey(1, 15, 3)].includes(posKey(...b.pos)));
    const ladder: AuthoringPaletteEntry = { Name: 'minecraft:ladder', Properties: { facing: 'east' } };
    const pal = [...palette, ladder];
    for (let y = 1; y <= 15; y++) blocks.push({ state: 4, pos: [1, y, 3] });
    const r = rebuildStairwells(blocks, pal, ctx);
    // Every storey gap (0→5, 5→10, 10→15) still has a connector rising through it.
    for (const [lo, hi] of [[0, 5], [5, 10], [10, 15]] as const) {
      const served = r.blocks.some((b) => {
        const n = r.palette[b.state]?.Name ?? '';
        const y = b.pos[1];
        return y > lo && y <= hi && (n === 'minecraft:ladder' || n.endsWith('_stairs'));
      });
      expect(served, `gap y=${lo}→${hi} must keep a climb`).toBe(true);
    }
  });
});
