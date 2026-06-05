import { describe, expect, it } from 'vitest';
import { carveStairwells, computeEnvelope, connectBlocks, fillInteriorAir, fixDoors } from '../passes';
import type { AuthoringBlock, AuthoringPaletteEntry } from '../types';

const ctx = (size: [number, number, number] = [16, 16, 16]): { size: [number, number, number] } => ({ size });

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
const keysOf = (blocks: AuthoringBlock[]): string[] =>
  blocks.map((b) => `${b.pos[0]},${b.pos[1]},${b.pos[2]}`);

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

describe('carveStairwells', () => {
  // index 0 = stairs facing east, index 1 = stone shell/obstruction.
  const palette: AuthoringPaletteEntry[] = [
    { Name: 'minecraft:oak_stairs', Properties: { facing: 'east', half: 'bottom' } },
    { Name: 'minecraft:stone' },
  ];

  it('clears solid headroom above an interior climbing flight', () => {
    const blocks: AuthoringBlock[] = [
      ...sealed(7, 7, 7, 1),
      { state: 0, pos: [2, 1, 3] }, { state: 0, pos: [3, 2, 3] }, // flight climbing +x
      { state: 1, pos: [2, 2, 3] }, { state: 1, pos: [2, 3, 3] }, // interior ceiling jammed above the tread
    ];
    const keys = keysOf(carveStairwells(blocks, palette, ctx()).blocks);
    expect(keys).not.toContain('2,2,3'); // headroom cleared
    expect(keys).not.toContain('2,3,3');
    expect(keys).toContain('2,1,3');     // the stairs themselves are untouched
    expect(keys).toContain('3,2,3');
  });

  it('keeps a block above a lone decorative stair', () => {
    const blocks: AuthoringBlock[] = [{ state: 0, pos: [3, 1, 3] }, { state: 1, pos: [3, 2, 3] }];
    const r = carveStairwells(blocks, palette, ctx());
    expect(r.blocks.length).toBe(2);
  });

  it('clears an interior landing in front of the bottom step', () => {
    const blocks: AuthoringBlock[] = [
      ...sealed(7, 7, 7, 1),
      { state: 0, pos: [3, 1, 3] }, { state: 0, pos: [4, 2, 3] }, // flight climbing +x
      { state: 1, pos: [2, 1, 3] }, { state: 1, pos: [2, 2, 3] }, // interior partition jammed behind the bottom step
    ];
    const keys = keysOf(carveStairwells(blocks, palette, ctx()).blocks);
    expect(keys).not.toContain('2,1,3'); // landing body cleared
    expect(keys).not.toContain('2,2,3'); // landing head cleared
    expect(keys).toContain('3,1,3');     // the stairs themselves are untouched
  });

  it('refuses to carve the exterior shell (roof / outer wall) and warns instead', () => {
    // A flight that climbs into the top face: its headroom cell IS the roof.
    const blocks: AuthoringBlock[] = [
      ...sealed(7, 7, 7, 1),
      { state: 0, pos: [3, 4, 3] }, { state: 0, pos: [4, 5, 3] }, // flight reaching the ceiling
    ];
    const r = carveStairwells(blocks, palette, ctx());
    const keys = keysOf(r.blocks);
    expect(keys).toContain('3,6,3'); // the roof above the tread is left intact
    expect(keys).toContain('4,6,3');
    expect(r.warnings?.join(' ')).toMatch(/exterior shell/);
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
});
