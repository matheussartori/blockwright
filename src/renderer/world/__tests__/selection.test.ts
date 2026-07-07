// The box-selection math: two corners span an inclusive region regardless of pick order,
// and the post-commit face adjustments (drag handles / steppers) can never invert the box
// or escape the world's build range.
import { describe, expect, it } from 'vitest';
import { adjustFaceY, regionVolume, spanRegion, type SelectionRegion } from '../selection';

describe('spanRegion', () => {
  it('spans the same region regardless of corner order', () => {
    const a: [number, number, number] = [10, 64, -3];
    const b: [number, number, number] = [-2, 60, 7];
    const forward = spanRegion(a, b);
    expect(forward).toEqual({ min: [-2, 60, -3], max: [10, 64, 7] });
    expect(spanRegion(b, a)).toEqual(forward);
  });

  it('a single cell is a 1×1×1 region', () => {
    const c: [number, number, number] = [4, 70, 4];
    const r = spanRegion(c, c);
    expect(r).toEqual({ min: c, max: c });
    expect(regionVolume(r)).toBe(1);
  });
});

describe('regionVolume', () => {
  it('counts inclusive blocks', () => {
    expect(regionVolume({ min: [0, 0, 0], max: [3, 1, 2] })).toBe(4 * 2 * 3);
  });
});

describe('adjustFaceY', () => {
  const r: SelectionRegion = { min: [0, 60, 0], max: [4, 70, 4] };

  it('moves the top face and keeps the other axes', () => {
    expect(adjustFaceY(r, 'top', 75)).toEqual({ min: [0, 60, 0], max: [4, 75, 4] });
    expect(adjustFaceY(r, 'bottom', 55)).toEqual({ min: [0, 55, 0], max: [4, 70, 4] });
  });

  it('never inverts: a face stops at the opposite face', () => {
    expect(adjustFaceY(r, 'top', 40).max[1]).toBe(60);
    expect(adjustFaceY(r, 'bottom', 99).min[1]).toBe(70);
  });

  it('clamps to the world build range when given', () => {
    expect(adjustFaceY(r, 'top', 400, [-64, 319]).max[1]).toBe(319);
    expect(adjustFaceY(r, 'bottom', -100, [-64, 319]).min[1]).toBe(-64);
  });

  it('rounds continuous drag positions to whole cells', () => {
    expect(adjustFaceY(r, 'top', 72.6).max[1]).toBe(73);
    expect(adjustFaceY(r, 'bottom', 58.4).min[1]).toBe(58);
  });

  it('returns a new region (no mutation)', () => {
    adjustFaceY(r, 'top', 75);
    expect(r.max[1]).toBe(70);
  });
});
