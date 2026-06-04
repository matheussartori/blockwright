import { describe, expect, it } from 'vitest';
import { FOOTPRINT_SHAPES, makeFootprint } from '../footprint';

const box = { x0: 0, z0: 0, x1: 11, z1: 9 }; // 12 × 10
const W = 12, D = 10;

/** Flood-fill: is the column set a single 4-connected region? */
function isConnected(cols: Array<[number, number]>): boolean {
  if (cols.length === 0) return false;
  const set = new Set(cols.map(([x, z]) => `${x},${z}`));
  const seen = new Set<string>([`${cols[0][0]},${cols[0][1]}`]);
  const stack: Array<[number, number]> = [cols[0]];
  while (stack.length) {
    const [x, z] = stack.pop()!;
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
      const k = `${x + dx},${z + dz}`;
      if (set.has(k) && !seen.has(k)) { seen.add(k); stack.push([x + dx, z + dz]); }
    }
  }
  return seen.size === set.size;
}

describe('makeFootprint', () => {
  it('rect fills the whole box', () => {
    const fp = makeFootprint(box, 'rect', 1);
    expect(fp.columns().length).toBe(W * D);
    expect(fp.shape).toBe('rect');
  });

  it('carved shapes remove some columns but stay non-empty', () => {
    for (const shape of ['l', 't', 'u', 'plus'] as const) {
      const n = makeFootprint(box, shape, 7).columns().length;
      expect(n).toBeGreaterThan(0);
      expect(n).toBeLessThan(W * D);
    }
  });

  it('keeps every shape a single connected region across many seeds', () => {
    for (const shape of FOOTPRINT_SHAPES) {
      for (let seed = 0; seed < 25; seed++) {
        expect(isConnected(makeFootprint(box, shape, seed).columns())).toBe(true);
      }
    }
  });

  it('is deterministic for a given seed', () => {
    const cols = (s: number): string[] => makeFootprint(box, 'auto', s).columns().map((c) => c.join(',')).sort();
    expect(cols(42)).toEqual(cols(42));
  });

  it('auto resolves to a concrete shape', () => {
    const fp = makeFootprint(box, 'auto', 3);
    expect(fp.shape).not.toBe('auto');
    expect(FOOTPRINT_SHAPES).toContain(fp.shape);
  });

  it('auto never picks the plus shape (too odd for a room), but explicit plus works', () => {
    for (let seed = 0; seed < 100; seed++) {
      expect(makeFootprint(box, 'auto', seed).shape).not.toBe('plus');
    }
    expect(makeFootprint(box, 'plus', 1).shape).toBe('plus');
  });

  it('falls back to rect for a tiny box', () => {
    expect(makeFootprint({ x0: 0, z0: 0, x1: 3, z1: 3 }, 'l', 5).shape).toBe('rect');
  });

  it('marks perimeter columns as edges and interior columns as non-edge', () => {
    const fp = makeFootprint(box, 'rect', 1);
    expect(fp.isEdge(0, 0)).toBe(true);
    expect(fp.isEdge(5, 5)).toBe(false);
  });
});
