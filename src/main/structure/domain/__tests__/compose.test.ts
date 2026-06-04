import { describe, expect, it } from 'vitest';
import type { AuthoringOp } from '../../authoring/types';
import { composeStructure, isKnownStructure, knownStructureNames, type Intern } from '../compose';

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

describe('basement footprint variety', () => {
  it('carves a smaller floor footprint for a non-rect shape', () => {
    const rect = composeStructure('basement', from, to, { shape: 'rect' }, stubIntern());
    const l = composeStructure('basement', from, to, { shape: 'l', seed: 1 }, stubIntern());
    expect(floorBlocks(l)).toBeLessThan(floorBlocks(rect));
    expect(floorBlocks(l)).toBeGreaterThan(0);
  });

  it('is deterministic for a given shape + seed', () => {
    const a = composeStructure('basement', from, to, { shape: 'auto', seed: 99 }, stubIntern());
    const b = composeStructure('basement', from, to, { shape: 'auto', seed: 99 }, stubIntern());
    expect(a.length).toBe(b.length);
  });
});

describe('compose: structure types × decoration themes', () => {
  it('recognises type ids and back-compat aliases, rejects unknowns', () => {
    expect(isKnownStructure('house')).toBe(true);
    expect(isKnownStructure('basement')).toBe(true);
    expect(isKnownStructure('abandoned_house')).toBe(true);
    expect(isKnownStructure('large_basement')).toBe(true);
    expect(isKnownStructure('castle')).toBe(false);
    expect(knownStructureNames()).toContain('large_basement');
  });

  it('the old alias equals the explicit type + its theme', () => {
    const alias = composeStructure('large_basement', from, to, { shape: 'rect' }, stubIntern());
    const explicit = composeStructure('basement', from, to, { shape: 'rect', theme: 'abandoned' }, stubIntern());
    expect(alias.length).toBe(explicit.length);
  });

  it('the same type yields a cleaner build under the plain theme (no decay)', () => {
    const abandoned = composeStructure('basement', from, to, { shape: 'rect', theme: 'abandoned' }, stubIntern());
    const plain = composeStructure('basement', from, to, { shape: 'rect', theme: 'plain' }, stubIntern());
    expect(plain.length).toBeLessThan(abandoned.length);
  });

  it('throws an actionable error on an unknown type or theme', () => {
    expect(() => composeStructure('castle', from, to, {}, stubIntern())).toThrow(/unknown structure type/);
    expect(() => composeStructure('house', from, to, { theme: 'nope' }, stubIntern())).toThrow(/unknown theme/);
  });
});
