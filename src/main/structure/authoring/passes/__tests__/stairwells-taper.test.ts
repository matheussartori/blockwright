// Regression for the user's "a torre vai se afinando conforme cresce no eixo Y — nem escada
// pra fora, nem escada dentro da parede. nunca." A TAPERING tower (each storey stepped inward
// from the one below) used to let the stairwell solver place a connector against the WIDE base
// footprint — which at a higher, stepped-in storey is OUTSIDE the wall (a stair dangling in
// open air) or buried INSIDE the thick stepped wall. The connector must stay in the column
// COMMON to every storey (the intersection footprint), so it is interior at EVERY level.
import { describe, expect, it } from 'vitest';
import { rebuildStairwells } from '../../passes';
import type { Vec3 } from '../../geometry';
import type { AuthoringBlock, AuthoringPaletteEntry } from '../../types';

// 0=air 1=stone(wall) 2=planks(floor) 3=oak_stairs(east)
const palette: AuthoringPaletteEntry[] = [
  { Name: 'minecraft:air' },
  { Name: 'minecraft:stone' },
  { Name: 'minecraft:oak_planks' },
  { Name: 'minecraft:oak_stairs', Properties: { facing: 'east', half: 'bottom', shape: 'straight' } },
];
const isStairOrLadder = (e?: AuthoringPaletteEntry): boolean => {
  const n = e?.Name ?? '';
  return n.endsWith('_stairs') || n.endsWith(':ladder');
};

/** A square tower that STEPS INWARD as it rises: storey f (0-based) has an inset of
 *  `baseInset + f` per side, walls between floors and a full floor slab at each storey Y.
 *  Centred in a `box`, so the base is wide and the crown narrow. */
function taperTower(opts: { box: number; baseHalf: number; floorYs: number[]; baseInset?: number }) {
  const { box, baseHalf, floorYs, baseInset = 0 } = opts;
  const c = Math.floor(box / 2);
  const blocks: AuthoringBlock[] = [];
  const lockCells: { pos: Vec3; entry: AuthoringPaletteEntry }[] = [];
  const put = (state: number, pos: Vec3, lock = false): void => {
    blocks.push({ state, pos });
    if (lock) lockCells.push({ pos, entry: palette[state] });
  };
  const rectFor = (f: number) => {
    const m = baseInset + f;
    return { x0: c - baseHalf + m, x1: c + baseHalf - m, z0: c - baseHalf + m, z1: c + baseHalf - m };
  };
  for (let f = 0; f < floorYs.length; f++) {
    const r = rectFor(f);
    const yLo = floorYs[f];
    const yHi = (f + 1 < floorYs.length ? floorYs[f + 1] : yLo + 6) - 1;
    // Floor slab (full footprint of this tier).
    for (let x = r.x0; x <= r.x1; x++) for (let z = r.z0; z <= r.z1; z++) put(2, [x, yLo, z], true);
    // Perimeter walls for the tier band.
    for (let y = yLo + 1; y <= yHi; y++) for (let x = r.x0; x <= r.x1; x++) for (let z = r.z0; z <= r.z1; z++) {
      if (x === r.x0 || x === r.x1 || z === r.z0 || z === r.z1) put(1, [x, y, z], true);
    }
  }
  const top = floorYs[floorYs.length - 1] + 6;
  const ctx = { size: [box, top + 4, box] as Vec3, grade: floorYs[0], floorPlanes: floorYs, lockCells };
  return { blocks, ctx, rectFor, topRect: rectFor(floorYs.length - 1) };
}

describe('rebuildStairwells — a tapering tower', () => {
  it('keeps every stair/ladder cell inside the NARROWEST (crown) storey, never out a stepped wall', () => {
    // A 41-wide tower tapering 1 cell/side per storey over 5 storeys: base 21 wide, crown 13.
    const { blocks, ctx, topRect } = taperTower({
      box: 41, baseHalf: 10, baseInset: 0, floorYs: [4, 12, 20, 28, 36],
    });
    // The model's bogus stair hugging the WIDE base wall (which is OUTSIDE the upper storeys).
    for (let i = 0; i <= 6; i++) blocks.push({ state: 3, pos: [topRect.x0 - 4 + i, 5 + i, ctx.grade + 2] });

    const r = rebuildStairwells(blocks, palette, ctx);
    const climbs = r.blocks.filter((b) => isStairOrLadder(r.palette[b.state]));
    expect(climbs.length).toBeGreaterThan(0); // a connector WAS built
    // Every climb cell must sit strictly inside the crown footprint — that column exists at
    // EVERY storey, so the stair is interior all the way up (never outside, never in a wall).
    for (const b of climbs) {
      const [x, , z] = b.pos;
      expect(
        x > topRect.x0 && x < topRect.x1 && z > topRect.z0 && z < topRect.z1,
        `climb at ${x},${z} fell outside the crown footprint [${topRect.x0}..${topRect.x1}]×[${topRect.z0}..${topRect.z1}]`,
      ).toBe(true);
    }
  });
});
