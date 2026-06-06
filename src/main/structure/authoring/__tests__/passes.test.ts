import { describe, expect, it } from 'vitest';
import { computeEnvelope, connectBlocks, fillInteriorAir, fixDoors } from '../passes';
import { findFlights, topCeilingY } from '../passes/flights';
import type { AuthoringBlock, AuthoringPaletteEntry } from '../types';

const ctx = (
  size: [number, number, number] = [16, 16, 16],
  grade?: number,
): { size: [number, number, number]; grade?: number } => ({ size, grade });

// A sealed solid box [0..W-1]×[0..H-1]×[0..D-1] (perimeter faces only, `stoneIdx`),
// so the interior is hidden from the exterior flood-fill — interior cells are NOT
// shell, exactly like the rooms inside a real house. Carve tests run inside one.
function sealed(W: number, H: number, D: number, stoneIdx: number): AuthoringBlock[] {
  const out: AuthoringBlock[] = [];
  for (let x = 0; x < W; x++) for (let y = 0; y < H; y++) for (let z = 0; z < D; z++) {
    if (x === 0 || x === W - 1 || y === 0 || y === H - 1 || z === 0 || z === D - 1) {
      out.push({ state: stoneIdx, pos: [x, y, z] });
    }
  }
  return out;
}
describe('connectBlocks', () => {
  it('leaves an isolated pane with every side false', () => {
    const palette: AuthoringPaletteEntry[] = [{ Name: 'minecraft:glass_pane' }];
    const blocks: AuthoringBlock[] = [{ state: 0, pos: [5, 0, 5] }];
    const r = connectBlocks(blocks, palette, ctx());
    const p = r.palette[r.blocks[0].state].Properties ?? {};
    expect([p.north, p.south, p.east, p.west]).toEqual(['false', 'false', 'false', 'false']);
  });

  it('connects two adjacent panes along their shared axis', () => {
    const palette: AuthoringPaletteEntry[] = [{ Name: 'minecraft:glass_pane' }];
    const blocks: AuthoringBlock[] = [{ state: 0, pos: [5, 0, 5] }, { state: 0, pos: [5, 0, 6] }];
    const r = connectBlocks(blocks, palette, ctx());
    const a = r.palette[r.blocks[0].state].Properties ?? {}; // [5,0,5] — neighbour to the south
    expect(a.south).toBe('true');
    expect(a.north).toBe('false');
  });

  it('is a no-op when no connecting families are present', () => {
    const palette: AuthoringPaletteEntry[] = [{ Name: 'minecraft:stone' }];
    const blocks: AuthoringBlock[] = [{ state: 0, pos: [0, 0, 0] }];
    const r = connectBlocks(blocks, palette, ctx());
    expect(r.palette).toBe(palette);
  });
});

describe('findFlights: a gable roof of stairs is not a climbing flight', () => {
  // 0 = east stairs, 1 = west stairs, 2 = stone (floor/wall), 3 = planks (upper floor).
  const palette: AuthoringPaletteEntry[] = [
    { Name: 'minecraft:oak_stairs', Properties: { facing: 'east', half: 'bottom' } },
    { Name: 'minecraft:oak_stairs', Properties: { facing: 'west', half: 'bottom' } },
    { Name: 'minecraft:stone' },
    { Name: 'minecraft:oak_planks' },
  ];
  // A two-storey shell (full floor planes at y=0 and y=5, perimeter walls y=1..4) with
  // a gable roof built FROM stairs above the top floor — two opposing runs climbing to
  // a ridge. Exactly the shape that used to be mistaken for staircases (and got its
  // headroom gouged / spawned an attic ladder).
  const W = 7, D = 7;
  function shell(): AuthoringBlock[] {
    const out: AuthoringBlock[] = [];
    for (let x = 0; x < W; x++) for (let z = 0; z < D; z++) {
      out.push({ state: 2, pos: [x, 0, z] }, { state: 3, pos: [x, 5, z] });
    }
    for (let y = 1; y <= 4; y++) for (let x = 0; x < W; x++) for (let z = 0; z < D; z++) {
      if (x === 0 || x === W - 1 || z === 0 || z === D - 1) out.push({ state: 2, pos: [x, y, z] });
    }
    for (let z = 0; z < D; z++) {
      out.push({ state: 0, pos: [0, 6, z] }, { state: 0, pos: [1, 7, z] }, { state: 0, pos: [2, 8, z] });
      out.push({ state: 1, pos: [6, 6, z] }, { state: 1, pos: [5, 7, z] }, { state: 1, pos: [4, 8, z] });
    }
    return out;
  }

  it('detects the ceiling plane at the top floor, below the roof', () => {
    expect(topCeilingY(shell(), palette)).toBe(5);
  });

  it('treats none of the roof slopes as a flight', () => {
    expect(findFlights(shell(), palette)).toHaveLength(0);
  });

  it('still detects a real interior staircase that tops out below the ceiling', () => {
    const blocks = shell().concat([
      { state: 0, pos: [2, 1, 3] }, { state: 0, pos: [3, 2, 3] }, { state: 0, pos: [4, 3, 3] },
    ]);
    const flights = findFlights(blocks, palette);
    expect(flights).toHaveLength(1);
    expect(flights[0].chain[0].pos).toEqual([2, 1, 3]);
  });
});

describe('computeEnvelope', () => {
  it('marks outer faces as shell and a sealed interior block as not-shell', () => {
    const palette: AuthoringPaletteEntry[] = [{ Name: 'minecraft:stone' }];
    const blocks: AuthoringBlock[] = [...sealed(5, 5, 5, 0), { state: 0, pos: [2, 2, 2] }];
    const env = computeEnvelope(blocks, palette);
    expect(env.isShell(0, 2, 2)).toBe(true);  // an outer wall face
    expect(env.isShell(2, 4, 2)).toBe(true);  // the roof
    expect(env.isShell(2, 2, 2)).toBe(false); // sealed interior block
  });

  it('treats a fully exposed lone block as shell', () => {
    const env = computeEnvelope([{ state: 0, pos: [5, 5, 5] }], [{ Name: 'minecraft:stone' }]);
    expect(env.isShell(5, 5, 5)).toBe(true);
  });
});

describe('fixDoors', () => {
  // A north-facing two-leaf door running east-west: leaves at x=5 (west) and x=6 (east).
  const doorLower = (facing: string, hinge: string): AuthoringPaletteEntry =>
    ({ Name: 'minecraft:oak_door', Properties: { facing, half: 'lower', hinge } });
  const doorUpper = (facing: string, hinge: string): AuthoringPaletteEntry =>
    ({ Name: 'minecraft:oak_door', Properties: { facing, half: 'upper', hinge } });

  it('mirrors a double door so hinges sit on the outer jambs', () => {
    // Both leaves authored with the SAME (wrong) hinge — the common model mistake.
    const palette: AuthoringPaletteEntry[] = [doorLower('north', 'right'), doorUpper('north', 'right')];
    const blocks: AuthoringBlock[] = [
      { state: 0, pos: [5, 1, 5] }, { state: 1, pos: [5, 2, 5] }, // west leaf
      { state: 0, pos: [6, 1, 5] }, { state: 1, pos: [6, 2, 5] }, // east leaf
    ];
    const r = fixDoors(blocks, palette, ctx());
    const hingeAt = (x: number, y: number): unknown =>
      r.palette[r.blocks.find((b) => b.pos[0] === x && b.pos[1] === y)!.state].Properties?.hinge;
    expect(hingeAt(5, 1)).toBe('left');  // west leaf hinged on the west (outer) jamb
    expect(hingeAt(6, 1)).toBe('right'); // east leaf hinged on the east (outer) jamb
    expect(hingeAt(5, 2)).toBe('left');  // upper halves follow their lower leaf
    expect(hingeAt(6, 2)).toBe('right');
    expect(r.fixes?.join(' ')).toMatch(/double-door/);
  });

  it('leaves a single door untouched', () => {
    const palette: AuthoringPaletteEntry[] = [doorLower('north', 'right')];
    const blocks: AuthoringBlock[] = [{ state: 0, pos: [5, 1, 5] }];
    const r = fixDoors(blocks, palette, ctx());
    expect(r.palette[r.blocks[0].state].Properties?.hinge).toBe('right');
    expect(r.fixes).toBeUndefined();
  });
});

describe('fillInteriorAir', () => {
  it('air-fills the vertical gap inside an occupied column', () => {
    const palette: AuthoringPaletteEntry[] = [{ Name: 'minecraft:stone' }];
    const blocks: AuthoringBlock[] = [{ state: 0, pos: [0, 0, 0] }, { state: 0, pos: [0, 3, 0] }];
    const r = fillInteriorAir(blocks, palette, ctx());
    const airIdx = r.palette.findIndex((p) => p.Name === 'minecraft:air');
    const air = r.blocks.filter((b) => b.state === airIdx);
    expect(air.map((b) => b.pos[1]).sort()).toEqual([1, 2]);
  });

  it('does not fill a single-block column', () => {
    const palette: AuthoringPaletteEntry[] = [{ Name: 'minecraft:stone' }];
    const blocks: AuthoringBlock[] = [{ state: 0, pos: [0, 0, 0] }];
    const r = fillInteriorAir(blocks, palette, ctx());
    const airIdx = r.palette.findIndex((p) => p.Name === 'minecraft:air');
    expect(r.blocks.filter((b) => b.state === airIdx).length).toBe(0);
  });

  // With a grade level (from the build's labelled storeys), an exterior column's gap
  // is split: cells below grade (the trench around the basement) stay OMITTED
  // (= structure_void), cells at/above grade (the recessed facade / balcony) → air.
  it('omits an exterior below-grade pocket but airs the part at/above grade', () => {
    const palette: AuthoringPaletteEntry[] = [{ Name: 'minecraft:stone' }];
    const blocks: AuthoringBlock[] = [
      { state: 0, pos: [0, 0, 0] }, // column floor
      { state: 0, pos: [0, 8, 0] }, // column cap → gap is y=1..7
    ];
    const r = fillInteriorAir(blocks, palette, ctx([16, 16, 16], 4));
    const airIdx = r.palette.findIndex((p) => p.Name === 'minecraft:air');
    const air = r.blocks
      .filter((b) => b.state === airIdx && b.pos[0] === 0 && b.pos[2] === 0)
      .map((b) => b.pos[1])
      .sort((a, b) => a - b);
    expect(air).toEqual([4, 5, 6, 7]); // below grade (1..3) omitted, at/above grade aired
  });

  // A sealed (interior) gap clears to air regardless of grade — basement rooms must
  // be hollow even though they sit below the ground floor.
  it('fills a sealed interior gap even when it lies below grade', () => {
    const palette: AuthoringPaletteEntry[] = [{ Name: 'minecraft:stone' }];
    const blocks = sealed(5, 5, 5, 0); // interior column (2,*,2) gap y=1..3
    const r = fillInteriorAir(blocks, palette, ctx([16, 16, 16], 9)); // grade above the box
    const airIdx = r.palette.findIndex((p) => p.Name === 'minecraft:air');
    const air = r.blocks
      .filter((b) => b.state === airIdx && b.pos[0] === 2 && b.pos[2] === 2)
      .map((b) => b.pos[1])
      .sort((a, b) => a - b);
    expect(air).toEqual([1, 2, 3]); // interior fills despite being below grade (9)
  });

  // No grade declared (no floors) → nothing is treated as below grade, so even an
  // exterior pocket fills with air (the behaviour before floor marking existed).
  it('fills an exterior pocket when no grade is given', () => {
    const palette: AuthoringPaletteEntry[] = [{ Name: 'minecraft:stone' }];
    const blocks: AuthoringBlock[] = [{ state: 0, pos: [0, 0, 0] }, { state: 0, pos: [0, 3, 0] }];
    const r = fillInteriorAir(blocks, palette, ctx()); // grade undefined
    const airIdx = r.palette.findIndex((p) => p.Name === 'minecraft:air');
    const air = r.blocks.filter((b) => b.state === airIdx).map((b) => b.pos[1]).sort();
    expect(air).toEqual([1, 2]);
  });
});
