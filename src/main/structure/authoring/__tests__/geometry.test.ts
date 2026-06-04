import { describe, expect, it } from 'vitest';
import { cellsInBox, inBounds, lineCells, posKey, rotXZ } from '../geometry';
import type { AuthoringBlock } from '../types';

describe('lineCells', () => {
  it('walks a straight run along the dominant x axis', () => {
    expect(lineCells([0, 0, 0], [3, 0, 0])).toEqual([
      [0, 0, 0], [1, 0, 0], [2, 0, 0], [3, 0, 0],
    ]);
  });

  it('steps a perfect diagonal across two axes', () => {
    expect(lineCells([0, 0, 0], [2, 2, 0])).toEqual([
      [0, 0, 0], [1, 1, 0], [2, 2, 0],
    ]);
  });

  it('handles a y-dominant run', () => {
    expect(lineCells([0, 0, 0], [0, 3, 0])).toEqual([
      [0, 0, 0], [0, 1, 0], [0, 2, 0], [0, 3, 0],
    ]);
  });
});

describe('inBounds', () => {
  it('accepts cells inside the size box', () => {
    expect(inBounds([0, 0, 0], [1, 1, 1])).toBe(true);
  });
  it('rejects cells on the upper edge and negatives', () => {
    expect(inBounds([1, 0, 0], [1, 1, 1])).toBe(false);
    expect(inBounds([-1, 0, 0], [2, 2, 2])).toBe(false);
  });
});

describe('rotXZ', () => {
  it('rotates a point one clockwise quarter-turn about the origin', () => {
    expect(rotXZ(1, 0, 0, 0)).toEqual([0, 1]);
  });
});

describe('cellsInBox', () => {
  it('returns only the cells within the inclusive box', () => {
    const cells = new Map<string, AuthoringBlock>();
    const put = (x: number, y: number, z: number): void => {
      cells.set(posKey(x, y, z), { state: 0, pos: [x, y, z] });
    };
    put(0, 0, 0); put(1, 0, 0); put(2, 0, 0);
    const got = cellsInBox(cells, [0, 0, 0], [1, 0, 0]).map((c) => c.pos[0]).sort();
    expect(got).toEqual([0, 1]);
  });
});
