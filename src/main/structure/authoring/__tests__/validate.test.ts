import { describe, expect, it } from 'vitest';
import { validateAuthoring } from '../validate';
import type { AuthoringStructure } from '../types';

const ok: AuthoringStructure = {
  size: [2, 1, 1],
  palette: [{ Name: 'minecraft:stone' }],
  ops: [{ op: 'block', pos: [0, 0, 0], state: 0 }],
};

describe('validateAuthoring', () => {
  it('accepts a minimal valid structure', () => {
    expect(() => validateAuthoring(ok)).not.toThrow();
  });

  it('rejects a malformed size', () => {
    expect(() => validateAuthoring({ ...ok, size: [2, 1] as unknown as [number, number, number] })).toThrow(/size/);
  });

  it('rejects an empty palette', () => {
    expect(() => validateAuthoring({ ...ok, palette: [] })).toThrow(/palette/);
  });

  it('rejects an out-of-bounds position', () => {
    expect(() => validateAuthoring({ ...ok, ops: [{ op: 'block', pos: [5, 0, 0], state: 0 }] })).toThrow(/out of bounds/);
  });

  it('rejects an out-of-range palette state', () => {
    expect(() => validateAuthoring({ ...ok, ops: [{ op: 'block', pos: [0, 0, 0], state: 9 }] })).toThrow(/palette range/);
  });

  it('rejects a flat (non-climbing) staircase', () => {
    expect(() => validateAuthoring({
      ...ok, size: [3, 3, 3], ops: [{ op: 'stairs', from: [0, 0, 0], to: [2, 0, 0], state: 0 }],
    })).toThrow(/stairs must change height/);
  });

  it('rejects an unknown op kind', () => {
    expect(() => validateAuthoring({ ...ok, ops: [{ op: 'frobnicate' } as never] })).toThrow(/op must be one of/);
  });

  it('rejects a structure with nothing to place', () => {
    expect(() => validateAuthoring({ size: [1, 1, 1], palette: [{ Name: 'minecraft:stone' }] })).toThrow(/at least one block/);
  });
});
