import { describe, expect, it } from 'vitest';
import { fixPlacement } from '../passes';
import type { AuthoringBlock, AuthoringPaletteEntry } from '../types';

const ctx = { size: [16, 16, 16] as [number, number, number] };
const run = (palette: AuthoringPaletteEntry[], blocks: AuthoringBlock[]) => fixPlacement(blocks, palette, ctx);
const nameOf = (r: ReturnType<typeof fixPlacement>, b: AuthoringBlock): string => r.palette[b.state].Name;

describe('fixPlacement — lanterns', () => {
  it('keeps a floor lantern resting on a block', () => {
    const r = run(
      [{ Name: 'minecraft:stone' }, { Name: 'minecraft:lantern' }],
      [{ state: 0, pos: [0, 0, 0] }, { state: 1, pos: [0, 1, 0] }],
    );
    expect(r.blocks.length).toBe(2);
    expect(r.fixes ?? []).toHaveLength(0);
  });

  it('hangs a floating lantern that has a block above it', () => {
    const r = run(
      [{ Name: 'minecraft:lantern' }, { Name: 'minecraft:stone' }],
      [{ state: 0, pos: [0, 1, 0] }, { state: 1, pos: [0, 2, 0] }],
    );
    const lantern = r.blocks.find((b) => nameOf(r, b) === 'minecraft:lantern')!;
    expect(r.palette[lantern.state].Properties?.hanging).toBe('true');
    expect((r.fixes ?? []).join(' ')).toMatch(/hung/);
  });

  it('drops a hanging lantern with nothing above onto the block below', () => {
    const r = run(
      [{ Name: 'minecraft:stone' }, { Name: 'minecraft:lantern', Properties: { hanging: 'true' } }],
      [{ state: 0, pos: [0, 0, 0] }, { state: 1, pos: [0, 1, 0] }],
    );
    const lantern = r.blocks.find((b) => nameOf(r, b) === 'minecraft:lantern')!;
    expect(r.palette[lantern.state].Properties?.hanging).toBe('false');
    expect((r.fixes ?? []).join(' ')).toMatch(/re-seated/);
  });

  it('removes a lantern floating with no support at all', () => {
    const r = run([{ Name: 'minecraft:lantern' }], [{ state: 0, pos: [5, 5, 5] }]);
    expect(r.blocks.length).toBe(0);
    expect((r.fixes ?? []).join(' ')).toMatch(/removed .*lantern/);
  });
});

describe('fixPlacement — torches, candles, ground blocks', () => {
  it('removes a floor torch with nothing beneath it', () => {
    const r = run([{ Name: 'minecraft:torch' }], [{ state: 0, pos: [5, 5, 5] }]);
    expect(r.blocks.length).toBe(0);
  });

  it('keeps a floor torch on a solid block', () => {
    const r = run(
      [{ Name: 'minecraft:stone' }, { Name: 'minecraft:torch' }],
      [{ state: 0, pos: [0, 0, 0] }, { state: 1, pos: [0, 1, 0] }],
    );
    expect(r.blocks.length).toBe(2);
  });

  it('removes a candle stacked on another candle but keeps the seated one', () => {
    const r = run(
      [{ Name: 'minecraft:stone' }, { Name: 'minecraft:candle' }],
      [{ state: 0, pos: [0, 0, 0] }, { state: 1, pos: [0, 1, 0] }, { state: 1, pos: [0, 2, 0] }],
    );
    const candles = r.blocks.filter((b) => nameOf(r, b) === 'minecraft:candle');
    expect(candles.length).toBe(1);
    expect(candles[0].pos).toEqual([0, 1, 0]);
  });

  it('removes a floating carpet but keeps one on the floor', () => {
    const r = run(
      [{ Name: 'minecraft:stone' }, { Name: 'minecraft:white_carpet' }],
      [{ state: 0, pos: [0, 0, 0] }, { state: 1, pos: [0, 1, 0] }, { state: 1, pos: [5, 5, 5] }],
    );
    const carpets = r.blocks.filter((b) => nameOf(r, b) === 'minecraft:white_carpet');
    expect(carpets.length).toBe(1);
    expect(carpets[0].pos).toEqual([0, 1, 0]);
  });

  it('removes a floor torch sitting on glass (glass is not solid support)', () => {
    const r = run(
      [{ Name: 'minecraft:glass' }, { Name: 'minecraft:torch' }],
      [{ state: 0, pos: [0, 0, 0] }, { state: 1, pos: [0, 1, 0] }],
    );
    expect(r.blocks.filter((b) => nameOf(r, b) === 'minecraft:torch')).toHaveLength(0);
  });
});

describe('fixPlacement — wall fixtures (auto-fix)', () => {
  it('keeps a wall torch backed by a solid block', () => {
    // facing south → backing sits to the north (z-1).
    const r = run(
      [{ Name: 'minecraft:wall_torch', Properties: { facing: 'south' } }, { Name: 'minecraft:stone' }],
      [{ state: 0, pos: [5, 5, 5] }, { state: 1, pos: [5, 5, 4] }],
    );
    expect(r.blocks.length).toBe(2);
    expect(r.fixes ?? []).toHaveLength(0);
  });

  it('removes a wall torch floating in open air', () => {
    const r = run(
      [{ Name: 'minecraft:wall_torch', Properties: { facing: 'south' } }],
      [{ state: 0, pos: [5, 5, 5] }],
    );
    expect(r.blocks.length).toBe(0);
    expect((r.fixes ?? []).join(' ')).toMatch(/wall fixture/);
  });

  it('removes a wall torch stuck to glass with no solid neighbour', () => {
    // facing west → backing is to the east (x+1) = a glass pane.
    const r = run(
      [{ Name: 'minecraft:wall_torch', Properties: { facing: 'west' } }, { Name: 'minecraft:glass_pane' }],
      [{ state: 0, pos: [5, 5, 5] }, { state: 1, pos: [6, 5, 5] }],
    );
    expect(r.blocks.filter((b) => nameOf(r, b) === 'minecraft:wall_torch')).toHaveLength(0);
  });

  it('re-anchors a wall torch from glass onto an adjacent solid wall', () => {
    // backing east is glass (invalid); a solid wall sits to the west → the torch
    // should re-anchor to face east (away from the west wall).
    const r = run(
      [
        { Name: 'minecraft:wall_torch', Properties: { facing: 'west' } },
        { Name: 'minecraft:glass_pane' },
        { Name: 'minecraft:stone' },
      ],
      [{ state: 0, pos: [5, 5, 5] }, { state: 1, pos: [6, 5, 5] }, { state: 2, pos: [4, 5, 5] }],
    );
    const torch = r.blocks.find((b) => nameOf(r, b) === 'minecraft:wall_torch');
    expect(torch).toBeDefined();
    expect(r.palette[torch!.state].Properties?.facing).toBe('east');
    expect((r.fixes ?? []).join(' ')).toMatch(/re-anchored/);
  });

  it('removes a wall sign with no backing (signs are not re-anchored)', () => {
    // facing south needs a block to the north; the only solid is to the side.
    const r = run(
      [{ Name: 'minecraft:oak_wall_sign', Properties: { facing: 'south' } }, { Name: 'minecraft:stone' }],
      [{ state: 0, pos: [5, 5, 5] }, { state: 1, pos: [4, 5, 5] }],
    );
    expect(r.blocks.filter((b) => nameOf(r, b) === 'minecraft:oak_wall_sign')).toHaveLength(0);
  });
});
