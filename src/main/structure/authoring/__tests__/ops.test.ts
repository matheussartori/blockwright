import { describe, expect, it } from 'vitest';
import { resolveBlocks } from '../ops';
import type { AuthoringStructure } from '../types';

const stone = { Name: 'minecraft:stone' };
const count = (s: AuthoringStructure): number => resolveBlocks(s).blocks.length;

describe('resolveBlocks — volumetric ops', () => {
  it('fill places a solid box', () => {
    expect(count({ size: [3, 3, 3], palette: [stone], ops: [{ op: 'fill', from: [0, 0, 0], to: [2, 2, 2], state: 0 }] })).toBe(27);
  });

  it('hollow leaves the interior empty', () => {
    expect(count({ size: [3, 3, 3], palette: [stone], ops: [{ op: 'hollow', from: [0, 0, 0], to: [2, 2, 2], state: 0 }] })).toBe(26);
  });

  it('walls places only the 4 vertical sides', () => {
    expect(count({ size: [3, 3, 3], palette: [stone], ops: [{ op: 'walls', from: [0, 0, 0], to: [2, 2, 2], state: 0 }] })).toBe(24);
  });

  it('line places a straight run', () => {
    expect(count({ size: [4, 1, 1], palette: [stone], ops: [{ op: 'line', from: [0, 0, 0], to: [3, 0, 0], state: 0 }] })).toBe(4);
  });

  it('block places a single cell', () => {
    expect(count({ size: [2, 2, 2], palette: [stone], ops: [{ op: 'block', pos: [1, 1, 1], state: 0 }] })).toBe(1);
  });

  it('drops air cells (carving)', () => {
    const r = resolveBlocks({
      size: [3, 1, 1],
      palette: [stone, { Name: 'minecraft:air' }],
      ops: [
        { op: 'fill', from: [0, 0, 0], to: [2, 0, 0], state: 0 },
        { op: 'block', pos: [1, 0, 0], state: 1 },
      ],
    });
    expect(r.blocks.length).toBe(2); // middle cell carved out
  });

  it('repeat tiles a cell along an axis', () => {
    const r = resolveBlocks({
      size: [3, 1, 1],
      palette: [stone],
      ops: [
        { op: 'block', pos: [0, 0, 0], state: 0 },
        { op: 'repeat', from: [0, 0, 0], to: [0, 0, 0], axis: 'x', step: 1, count: 3 },
      ],
    });
    expect(r.blocks.map((b) => b.pos[0]).sort()).toEqual([0, 1, 2]);
  });

  it('rotate rewrites orientation and interns a new palette entry', () => {
    const r = resolveBlocks({
      size: [1, 1, 1],
      palette: [{ Name: 'minecraft:oak_stairs', Properties: { facing: 'east', half: 'bottom' } }],
      ops: [
        { op: 'block', pos: [0, 0, 0], state: 0 },
        { op: 'rotate', from: [0, 0, 0], to: [0, 0, 0], turns: 1 },
      ],
    });
    const b = r.blocks[0];
    expect(r.palette[b.state].Properties?.facing).toBe('south');
  });

  it('stairs builds an N+1 step climb facing the ascent direction', () => {
    const r = resolveBlocks({
      size: [4, 4, 1],
      palette: [{ Name: 'minecraft:oak_stairs' }],
      ops: [{ op: 'stairs', from: [0, 0, 0], to: [2, 2, 0], state: 0 }],
    });
    expect(r.blocks.map((b) => `${b.pos[0]},${b.pos[1]},${b.pos[2]}`).sort()).toEqual(['0,0,0', '1,1,0', '2,2,0']);
    expect(r.palette[r.blocks[0].state].Properties?.facing).toBe('east');
  });

  it('roof lays only stair/slab blocks', () => {
    const r = resolveBlocks({
      size: [5, 5, 5],
      palette: [{ Name: 'minecraft:oak_stairs' }],
      ops: [{ op: 'roof', from: [0, 0, 0], to: [4, 4, 4], state: 0 }],
    });
    expect(r.blocks.length).toBeGreaterThan(0);
    for (const b of r.blocks) expect(r.palette[b.state].Name).toMatch(/_stairs$|_slab$/);
  });

  it('closes the gable-end triangles when given a fill block', () => {
    const r = resolveBlocks({
      size: [7, 7, 7],
      palette: [{ Name: 'minecraft:oak_stairs' }, { Name: 'minecraft:oak_planks' }],
      ops: [{ op: 'roof', from: [0, 0, 0], to: [6, 6, 6], state: 0, ridge: 'z', fill: 1 }],
    });
    // ridge along z → gable ends at z=0 and z=6; the fill block walls them in.
    const ends = r.blocks.filter((b) => r.palette[b.state].Name === 'minecraft:oak_planks' && (b.pos[2] === 0 || b.pos[2] === 6));
    expect(ends.length).toBeGreaterThan(0);
  });

  it('leaves gable ends open when no fill is given (only stairs/slabs)', () => {
    const r = resolveBlocks({
      size: [7, 7, 7],
      palette: [{ Name: 'minecraft:oak_stairs' }],
      ops: [{ op: 'roof', from: [0, 0, 0], to: [6, 6, 6], state: 0, ridge: 'z' }],
    });
    for (const b of r.blocks) expect(r.palette[b.state].Name).toMatch(/_stairs$|_slab$/);
  });

  it('dedupes identical palette interns', () => {
    const r = resolveBlocks({
      size: [2, 1, 1],
      palette: [stone],
      ops: [
        { op: 'fill', from: [0, 0, 0], to: [0, 0, 0], state: 0 },
        { op: 'fill', from: [1, 0, 0], to: [1, 0, 0], state: 0 },
      ],
    });
    expect(r.palette.length).toBe(1);
  });
});
