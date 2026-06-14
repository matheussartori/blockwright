// Regression: a house INSET in a big surroundings yard. The yard's lawn fills the whole
// box at grade, so the raw block bounds are the YARD — and the stairwell solver used to
// plan a derived staircase out on the lawn / a graveyard tree (the user's "escada no
// exterior" defect). The connector must stay inside the HOUSE footprint, and a cluttered
// interior must still get exactly one clean climb (a forced wall ladder) rather than be
// abandoned to the model's broken, doubled geometry.
import { describe, expect, it } from 'vitest';
import { rebuildStairwells } from '../../passes';
import { posKey } from '../../geometry';
import type { Vec3 } from '../../geometry';
import type { AuthoringBlock, AuthoringPaletteEntry } from '../../types';
import type { ShellLockCell } from '../types';

// 0=air 1=stone(wall) 2=planks(floor) 3=oak_stairs(east) 4=grass(yard) 5=bookshelf(furniture)
const palette: AuthoringPaletteEntry[] = [
  { Name: 'minecraft:air' },
  { Name: 'minecraft:stone' },
  { Name: 'minecraft:oak_planks' },
  { Name: 'minecraft:oak_stairs', Properties: { facing: 'east', half: 'bottom', shape: 'straight' } },
  { Name: 'minecraft:grass_block' },
  { Name: 'minecraft:bookshelf' },
];
const isStairOrLadder = (e?: AuthoringPaletteEntry): boolean => {
  const n = e?.Name ?? '';
  return n.endsWith('_stairs') || n.endsWith(':ladder');
};

/** Build an inset house (perimeter stone walls + full planks floors at `floorYs`) centred
 *  in a `box`-sized yard whose lawn (grass) fills the rest of the grade plane. Returns the
 *  blocks plus the shell lock cells (walls + floors), the ctx the compiler would thread, and
 *  the house bounds. `furnishYs` fills the interior with full-block furniture (a packed room). */
function yardHouse(opts: {
  box: number; hx0: number; hx1: number; hz0: number; hz1: number; floorYs: number[]; furnishYs?: number[];
}) {
  const { box, hx0, hx1, hz0, hz1, floorYs, furnishYs = [] } = opts;
  const grade = floorYs[0];
  const top = floorYs[floorYs.length - 1];
  const blocks: AuthoringBlock[] = [];
  const lockCells: ShellLockCell[] = [];
  const put = (state: number, pos: Vec3, lock = false): void => {
    blocks.push({ state, pos });
    if (lock) lockCells.push({ pos, entry: palette[state] });
  };
  const inHouse = (x: number, z: number): boolean => x >= hx0 && x <= hx1 && z >= hz0 && z <= hz1;
  // Yard lawn: grass over the whole box at grade, except under the house.
  for (let x = 0; x < box; x++) for (let z = 0; z < box; z++) if (!inHouse(x, z)) put(4, [x, grade, z]);
  // House floors (full footprint planks) + perimeter walls (stone) between floors.
  for (const fy of floorYs) for (let x = hx0; x <= hx1; x++) for (let z = hz0; z <= hz1; z++) put(2, [x, fy, z], true);
  for (let y = grade; y <= top; y++) {
    if (floorYs.includes(y)) continue;
    for (let x = hx0; x <= hx1; x++) for (let z = hz0; z <= hz1; z++) {
      if (x === hx0 || x === hx1 || z === hz0 || z === hz1) put(1, [x, y, z], true);
    }
  }
  for (const fy of furnishYs) for (let x = hx0 + 1; x < hx1; x++) for (let z = hz0 + 1; z < hz1; z++) put(5, [x, fy, z]);
  const ctx = { size: [box, top + 8, box] as Vec3, grade, floorPlanes: floorYs, lockCells };
  return { blocks, ctx, hx0, hx1, hz0, hz1 };
}

describe('rebuildStairwells — house inset in a surroundings yard', () => {
  it('never plans a connector out on the yard (stays inside the house footprint)', () => {
    const { blocks, ctx, hx0, hx1, hz0, hz1 } = yardHouse({
      box: 40, hx0: 14, hx1: 25, hz0: 14, hz1: 25, floorYs: [2, 9, 16],
    });
    // The model's bogus exterior stair: a flight climbing out on the lawn (x4..10, z5).
    for (let i = 0; i <= 6; i++) blocks.push({ state: 3, pos: [4 + i, 3 + i, 5] });

    const r = rebuildStairwells(blocks, palette, ctx);

    const climbs = r.blocks.filter((b) => isStairOrLadder(r.palette[b.state]));
    expect(climbs.length).toBeGreaterThan(0); // it DID build a connector
    for (const b of climbs) {
      const [x, , z] = b.pos;
      // every stair/ladder cell strictly inside the house walls — never out on the yard
      expect(x > hx0 && x < hx1 && z > hz0 && z < hz1, `climb at ${x},${z} escaped the house`).toBe(true);
    }
    // the bogus lawn flight (x4..10, z5) is gone
    for (let i = 0; i <= 6; i++) {
      const b = r.blocks.find((bl) => posKey(...bl.pos) === posKey(4 + i, 3 + i, 5));
      expect(b && isStairOrLadder(r.palette[b.state])).toBeFalsy();
    }
  });

  it('forces a single clean wall ladder when the interior is packed with furniture', () => {
    // A tight house (4×4 interior) whose middle gap is filled floor-to-ceiling with full-block
    // furniture — no 45° stair fits and a normal ladder is blocked, so only a forced ladder
    // (carving the non-locked clutter against a locked wall) can connect it.
    const { blocks, ctx, hx0, hx1, hz0, hz1 } = yardHouse({
      box: 30, hx0: 12, hx1: 17, hz0: 12, hz1: 17, floorYs: [2, 10, 18], furnishYs: [4, 5, 6, 7, 8, 9],
    });

    const r = rebuildStairwells(blocks, palette, ctx);

    expect(r.warnings ?? []).toEqual([]); // the gap was NOT abandoned
    const ladders = r.blocks.filter((b) => (r.palette[b.state]?.Name ?? '').endsWith(':ladder'));
    expect(ladders.length).toBeGreaterThan(0);
    // one column, inside the house
    const cols = new Set(ladders.map((b) => `${b.pos[0]},${b.pos[2]}`));
    expect(cols.size).toBe(1);
    for (const b of ladders) {
      const [x, , z] = b.pos;
      expect(x > hx0 && x < hx1 && z > hz0 && z < hz1).toBe(true);
    }
  });
});
