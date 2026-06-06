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

  it('removes a wall torch buried in a wall (solid on front and back, no open side)', () => {
    // facing east into stone, stone behind too, and stone on both perpendicular sides
    // → it replaced a wall block (a hole); no open face to re-anchor to → removed.
    const r = run(
      [{ Name: 'minecraft:wall_torch', Properties: { facing: 'east' } }, { Name: 'minecraft:stone' }],
      [
        { state: 0, pos: [5, 5, 5] },
        { state: 1, pos: [6, 5, 5] }, { state: 1, pos: [4, 5, 5] },
        { state: 1, pos: [5, 5, 6] }, { state: 1, pos: [5, 5, 4] },
      ],
    );
    expect(r.blocks.filter((b) => nameOf(r, b) === 'minecraft:wall_torch')).toHaveLength(0);
  });

  it('re-anchors a torch facing into a wall toward an open side', () => {
    // facing east is blocked (stone in front); but south is open with a solid north
    // wall behind → re-anchor to face south.
    const r = run(
      [{ Name: 'minecraft:wall_torch', Properties: { facing: 'east' } }, { Name: 'minecraft:stone' }],
      [{ state: 0, pos: [5, 5, 5] }, { state: 1, pos: [6, 5, 5] }, { state: 1, pos: [5, 5, 4] }],
    );
    const torch = r.blocks.find((b) => nameOf(r, b) === 'minecraft:wall_torch');
    expect(torch).toBeDefined();
    expect(r.palette[torch!.state].Properties?.facing).toBe('south');
  });

  it('removes a wall sign with no backing (signs are not re-anchored)', () => {
    // facing south needs a block to the north; the only solid is to the side.
    const r = run(
      [{ Name: 'minecraft:oak_wall_sign', Properties: { facing: 'south' } }, { Name: 'minecraft:stone' }],
      [{ state: 0, pos: [5, 5, 5] }, { state: 1, pos: [4, 5, 5] }],
    );
    expect(r.blocks.filter((b) => nameOf(r, b) === 'minecraft:oak_wall_sign')).toHaveLength(0);
  });

  it('keeps a ladder column intact where it threads a floor (front cell is the floor)', () => {
    // A multi-storey ladder shaft: ladders facing south (backing wall to the north at
    // z-1). At the floor line (y=2) the cell IN FRONT (z+1) is the floor surface, so the
    // "must face open space" test fails for that single rung — but it continues a column,
    // so it must NOT be removed (removing it fragments the shaft and breaks the climb).
    // Regression for the "ladders to nowhere / unreachable upper floors" bug.
    const pal: AuthoringPaletteEntry[] = [
      { Name: 'minecraft:ladder', Properties: { facing: 'south' } }, // 0
      { Name: 'minecraft:stone' }, // 1 — backing wall + floor
    ];
    const blocks: AuthoringBlock[] = [];
    for (let y = 0; y <= 4; y++) blocks.push({ state: 1, pos: [5, y, 0] });   // backing wall (north)
    for (let y = 0; y <= 4; y++) blocks.push({ state: 0, pos: [5, y, 1] });   // ladder column
    // a floor plane at y=2 in front of the ladder (z>=2) so the rung at (5,2,1) "faces" floor
    for (let z = 2; z <= 4; z++) blocks.push({ state: 1, pos: [5, 2, z] });
    const r = run(pal, blocks);
    const ladderYs = r.blocks
      .filter((b) => nameOf(r, b) === 'minecraft:ladder')
      .map((b) => b.pos[1])
      .sort((a, c) => a - c);
    expect(ladderYs).toEqual([0, 1, 2, 3, 4]);
    expect((r.fixes ?? []).join(' ')).not.toMatch(/wall fixture/);
  });

  it('still removes a lone unbacked ladder (not part of a column)', () => {
    const r = run(
      [{ Name: 'minecraft:ladder', Properties: { facing: 'south' } }],
      [{ state: 0, pos: [5, 5, 5] }],
    );
    expect(r.blocks.filter((b) => nameOf(r, b) === 'minecraft:ladder')).toHaveLength(0);
  });
});

describe('fixPlacement — chest lids', () => {
  it('clears a candle sitting on a chest (keeps the lid openable)', () => {
    const r = run(
      [{ Name: 'minecraft:chest' }, { Name: 'minecraft:candle' }],
      [{ state: 0, pos: [0, 0, 0] }, { state: 1, pos: [0, 1, 0] }],
    );
    expect(r.blocks.filter((b) => nameOf(r, b) === 'minecraft:candle')).toHaveLength(0);
    expect(r.blocks.filter((b) => nameOf(r, b) === 'minecraft:chest')).toHaveLength(1);
    expect((r.fixes ?? []).join(' ')).toMatch(/chest lid/);
  });

  it('leaves a solid block above a chest alone (framing, not ours to gut)', () => {
    const r = run(
      [{ Name: 'minecraft:chest' }, { Name: 'minecraft:oak_planks' }],
      [{ state: 0, pos: [0, 0, 0] }, { state: 1, pos: [0, 1, 0] }],
    );
    expect(r.blocks.filter((b) => nameOf(r, b) === 'minecraft:oak_planks')).toHaveLength(1);
  });
});

describe('fixPlacement — floating top-slabs', () => {
  it('seats a top-slab resting on a full block (flips to bottom)', () => {
    const r = run(
      [{ Name: 'minecraft:dark_oak_planks' }, { Name: 'minecraft:dark_oak_slab', Properties: { type: 'top' } }],
      [{ state: 0, pos: [0, 0, 0] }, { state: 1, pos: [0, 1, 0] }],
    );
    const slab = r.blocks.find((b) => nameOf(r, b) === 'minecraft:dark_oak_slab')!;
    expect(r.palette[slab.state].Properties?.type).toBe('bottom');
    expect((r.fixes ?? []).join(' ')).toMatch(/top-slab/);
  });

  it('leaves a top-slab sitting on stairs (roof ridge cap) alone', () => {
    const r = run(
      [{ Name: 'minecraft:oak_stairs' }, { Name: 'minecraft:oak_slab', Properties: { type: 'top' } }],
      [{ state: 0, pos: [0, 0, 0] }, { state: 1, pos: [0, 1, 0] }],
    );
    const slab = r.blocks.find((b) => nameOf(r, b) === 'minecraft:oak_slab')!;
    expect(r.palette[slab.state].Properties?.type).toBe('top');
  });

  it('leaves a top-slab with a block above (ceiling lip) and one floating in air alone', () => {
    const lip = run(
      [{ Name: 'minecraft:stone' }, { Name: 'minecraft:stone_slab', Properties: { type: 'top' } }],
      [{ state: 0, pos: [0, 2, 0] }, { state: 0, pos: [0, 0, 0] }, { state: 1, pos: [0, 1, 0] }], // block below AND above
    );
    expect(lip.palette[lip.blocks.find((b) => nameOf(lip, b) === 'minecraft:stone_slab')!.state].Properties?.type).toBe('top');

    const floating = run(
      [{ Name: 'minecraft:stone_slab', Properties: { type: 'top' } }],
      [{ state: 0, pos: [5, 5, 5] }], // nothing below to seat on
    );
    expect(floating.palette[floating.blocks[0].state].Properties?.type).toBe('top');
  });
});

describe('fixPlacement — door passage', () => {
  it('opens a doorway blocked by a wall behind it', () => {
    // facing south → back is north (z-1); a stone wall plugs both door halves there.
    // The door is COMPLETE (both halves) so it isn't dropped as a lone half first.
    const r = run(
      [
        { Name: 'minecraft:spruce_door', Properties: { facing: 'south', half: 'lower' } },
        { Name: 'minecraft:spruce_door', Properties: { facing: 'south', half: 'upper' } },
        { Name: 'minecraft:stone_bricks' },
      ],
      [
        { state: 0, pos: [5, 1, 5] }, { state: 1, pos: [5, 2, 5] },
        { state: 2, pos: [5, 1, 4] }, { state: 2, pos: [5, 2, 4] },
      ],
    );
    const walls = r.blocks.filter((b) => nameOf(r, b) === 'minecraft:stone_bricks');
    expect(walls).toHaveLength(0); // the plug was carved out
    expect(r.blocks.filter((b) => nameOf(r, b) === 'minecraft:spruce_door')).toHaveLength(2);
    expect((r.fixes ?? []).join(' ')).toMatch(/doorway/);
  });

  it('leaves a complete door with clear passage on both sides untouched', () => {
    const r = run(
      [
        { Name: 'minecraft:spruce_door', Properties: { facing: 'south', half: 'lower' } },
        { Name: 'minecraft:spruce_door', Properties: { facing: 'south', half: 'upper' } },
      ],
      [{ state: 0, pos: [5, 1, 5] }, { state: 1, pos: [5, 2, 5] }],
    );
    expect(r.blocks).toHaveLength(2);
    expect(r.fixes ?? []).toHaveLength(0);
  });
});

describe('fixPlacement — orphan door halves', () => {
  const lower = (h: string): AuthoringPaletteEntry => ({ Name: 'minecraft:oak_door', Properties: { facing: 'south', half: 'lower', hinge: h } });
  const upper = (h: string): AuthoringPaletteEntry => ({ Name: 'minecraft:oak_door', Properties: { facing: 'south', half: 'upper', hinge: h } });

  it('removes an upper door half with no lower half beneath it', () => {
    // 0 = planks floor, 1 = upper door half sitting on the floor (its lower is missing).
    const r = run(
      [{ Name: 'minecraft:oak_planks' }, upper('right')],
      [{ state: 0, pos: [5, 10, 5] }, { state: 1, pos: [5, 11, 5] }],
    );
    expect(r.blocks.some((b) => nameOf(r, b).endsWith('_door'))).toBe(false);
    expect((r.fixes ?? []).join(' ')).toMatch(/orphan door/);
  });

  it('removes a lone lower door half (a single-leaf "half door" used as decoration)', () => {
    // 0 = planks floor, 1 = a lower door half on the floor with NO upper half above it —
    // the decorative half-door the model dumps in a row across a room.
    const r = run(
      [{ Name: 'minecraft:oak_planks' }, lower('left')],
      [{ state: 0, pos: [5, 0, 5] }, { state: 1, pos: [5, 1, 5] }],
    );
    expect(r.blocks.some((b) => nameOf(r, b).endsWith('_door'))).toBe(false);
    expect((r.fixes ?? []).join(' ')).toMatch(/orphan door/);
  });

  it('keeps a complete two-half door', () => {
    const r = run(
      [lower('right'), upper('right'), { Name: 'minecraft:stone' }],
      [{ state: 2, pos: [5, 0, 5] }, { state: 0, pos: [5, 1, 5] }, { state: 1, pos: [5, 2, 5] }],
    );
    expect(r.blocks.filter((b) => nameOf(r, b).endsWith('_door'))).toHaveLength(2);
  });
});

describe('fixPlacement — floating connecting blocks', () => {
  it('removes a line of iron bars hovering with no solid support (railing over a roof)', () => {
    // A 1-cell air gap below the bars; nothing solid touches the group anywhere.
    const palette: AuthoringPaletteEntry[] = [{ Name: 'minecraft:iron_bars' }, { Name: 'minecraft:oak_stairs', Properties: { facing: 'east' } }];
    const blocks: AuthoringBlock[] = [];
    for (let z = 0; z < 5; z++) blocks.push({ state: 0, pos: [8, 31, z] }); // floating bar line
    for (let z = 0; z < 5; z++) blocks.push({ state: 1, pos: [8, 29, z] }); // roof 2 blocks below (not touching)
    const r = fixPlacement(blocks, palette, ctx);
    expect(r.blocks.some((b) => nameOf(r, b) === 'minecraft:iron_bars')).toBe(false);
    expect((r.fixes ?? []).join(' ')).toMatch(/floating/);
  });

  it('keeps a window pane anchored in a solid wall', () => {
    // A pane with a solid wall block on either side (a real window) is anchored.
    const palette: AuthoringPaletteEntry[] = [{ Name: 'minecraft:glass_pane' }, { Name: 'minecraft:stone' }];
    const blocks: AuthoringBlock[] = [
      { state: 1, pos: [4, 2, 5] }, { state: 0, pos: [5, 2, 5] }, { state: 1, pos: [6, 2, 5] },
      { state: 1, pos: [5, 1, 5] }, // a block below it too
    ];
    const r = fixPlacement(blocks, palette, ctx);
    expect(r.blocks.some((b) => nameOf(r, b) === 'minecraft:glass_pane')).toBe(true);
  });
});
