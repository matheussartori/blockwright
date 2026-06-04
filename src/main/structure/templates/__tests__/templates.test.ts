import { describe, expect, it } from 'vitest';
import type { AuthoringOp } from '../../authoring/types';
import { expandTemplate, type Intern } from '../index';

/** A throwaway intern that just hands out incrementing indices per distinct key. */
function stubIntern(): Intern {
  const seen = new Map<string, number>();
  return (name, props) => {
    const k = `${name}|${JSON.stringify(props ?? {})}`;
    if (!seen.has(k)) seen.set(k, seen.size);
    return seen.get(k)!;
  };
}

const from: [number, number, number] = [0, 0, 0];
const to: [number, number, number] = [15, 5, 13];
const floorBlocks = (ops: AuthoringOp[]): number =>
  ops.filter((o) => o.op === 'block' && o.pos[1] === 0).length;

describe('large_basement footprint variety', () => {
  it('carves a smaller floor footprint for a non-rect shape', () => {
    const rect = expandTemplate('large_basement', from, to, { shape: 'rect' }, stubIntern());
    const l = expandTemplate('large_basement', from, to, { shape: 'l', seed: 1 }, stubIntern());
    expect(floorBlocks(l)).toBeLessThan(floorBlocks(rect));
    expect(floorBlocks(l)).toBeGreaterThan(0);
  });

  it('is deterministic for a given shape + seed', () => {
    const a = expandTemplate('large_basement', from, to, { shape: 'auto', seed: 99 }, stubIntern());
    const b = expandTemplate('large_basement', from, to, { shape: 'auto', seed: 99 }, stubIntern());
    expect(a.length).toBe(b.length);
  });
});
