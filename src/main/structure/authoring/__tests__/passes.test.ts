import { describe, expect, it } from 'vitest';
import { carveStairwells, connectBlocks, fillInteriorAir } from '../passes';
import type { AuthoringBlock, AuthoringPaletteEntry } from '../types';

const ctx = (size: [number, number, number] = [16, 16, 16]): { size: [number, number, number] } => ({ size });

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
  it('clears solid headroom above a real climbing flight', () => {
    const palette: AuthoringPaletteEntry[] = [
      { Name: 'minecraft:oak_stairs', Properties: { facing: 'east', half: 'bottom' } },
      { Name: 'minecraft:stone' },
    ];
    const blocks: AuthoringBlock[] = [
      { state: 0, pos: [0, 0, 0] }, { state: 0, pos: [1, 1, 0] }, // the flight
      { state: 1, pos: [0, 1, 0] }, { state: 1, pos: [0, 2, 0] }, // headroom above the lower tread
    ];
    const r = carveStairwells(blocks, palette, ctx());
    const keys = r.blocks.map((b) => `${b.pos[0]},${b.pos[1]},${b.pos[2]}`);
    expect(keys).not.toContain('0,1,0');
    expect(keys).not.toContain('0,2,0');
    expect(r.blocks.length).toBe(2);
  });

  it('keeps a block above a lone decorative stair', () => {
    const palette: AuthoringPaletteEntry[] = [
      { Name: 'minecraft:oak_stairs', Properties: { facing: 'east', half: 'bottom' } },
      { Name: 'minecraft:stone' },
    ];
    const blocks: AuthoringBlock[] = [{ state: 0, pos: [0, 0, 0] }, { state: 1, pos: [0, 1, 0] }];
    const r = carveStairwells(blocks, palette, ctx());
    expect(r.blocks.length).toBe(2);
  });

  it('clears a standing landing in front of the bottom step', () => {
    const palette: AuthoringPaletteEntry[] = [
      { Name: 'minecraft:oak_stairs', Properties: { facing: 'east', half: 'bottom' } },
      { Name: 'minecraft:stone' },
    ];
    const blocks: AuthoringBlock[] = [
      { state: 0, pos: [1, 0, 0] }, { state: 0, pos: [2, 1, 0] }, // flight climbing +x
      { state: 1, pos: [0, 0, 0] }, { state: 1, pos: [0, 1, 0] }, // wall jammed against the bottom step
    ];
    const r = carveStairwells(blocks, palette, ctx());
    const keys = r.blocks.map((b) => `${b.pos[0]},${b.pos[1]},${b.pos[2]}`);
    expect(keys).not.toContain('0,0,0'); // landing body cleared
    expect(keys).not.toContain('0,1,0'); // landing head cleared
    expect(keys).toContain('1,0,0');     // the stairs themselves are untouched
    expect(keys).toContain('2,1,0');
  });

  it('clears the arrival landing in front of the top step', () => {
    const palette: AuthoringPaletteEntry[] = [
      { Name: 'minecraft:oak_stairs', Properties: { facing: 'east', half: 'bottom' } },
      { Name: 'minecraft:stone' },
    ];
    const blocks: AuthoringBlock[] = [
      { state: 0, pos: [0, 0, 0] }, { state: 0, pos: [1, 1, 0] }, // flight climbing +x, top step at x=1,y=1
      { state: 1, pos: [2, 2, 0] }, { state: 1, pos: [2, 3, 0] }, // wall jammed in front of the top step
    ];
    const r = carveStairwells(blocks, palette, ctx());
    const keys = r.blocks.map((b) => `${b.pos[0]},${b.pos[1]},${b.pos[2]}`);
    expect(keys).not.toContain('2,2,0'); // arrival body cleared
    expect(keys).not.toContain('2,3,0'); // arrival head cleared
    expect(keys).toContain('0,0,0');     // the stairs themselves are untouched
    expect(keys).toContain('1,1,0');
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
