import { describe, expect, it } from 'vitest';
import { heightOverhead, planStoreys, sanitizeFloorHeights } from '../storeys';

describe('planStoreys: the uniform fallback (legacy split)', () => {
  it('fills the ideal zone evenly', () => {
    const ladder = planStoreys({ baseY: 0, idealTop: 10, maxWallTop: 18, floors: 2 });
    expect(ladder.heights).toEqual([5, 5]);
    expect(ladder.slabYs).toEqual([0, 5]);
    expect(ladder.wallTop).toBe(10);
  });

  it('shrinks one cell at a time while the wall top overflows the hard cap', () => {
    const ladder = planStoreys({ baseY: 0, idealTop: 10, maxWallTop: 8, floors: 2 });
    expect(ladder.heights).toEqual([4, 4]);
    expect(ladder.wallTop).toBe(8);
  });

  it('never shrinks below the 3-cell storey floor', () => {
    const ladder = planStoreys({ baseY: 0, idealTop: 5, maxWallTop: 5, floors: 3 });
    expect(ladder.heights).toEqual([3, 3, 3]); // overflow tolerated, like the legacy loops
    expect(ladder.wallTop).toBe(9);
  });
});

describe('planStoreys: explicit per-floor heights', () => {
  it('uses the heights exactly when they fit', () => {
    const ladder = planStoreys({ baseY: 0, idealTop: 20, maxWallTop: 20, floors: 2, floorHeights: [7, 4] });
    expect(ladder.heights).toEqual([7, 4]);
    expect(ladder.slabYs).toEqual([0, 7]);
    expect(ladder.wallTop).toBe(11);
  });

  it('pads a short array with its last height and truncates a long one', () => {
    expect(planStoreys({ baseY: 0, idealTop: 30, maxWallTop: 30, floors: 3, floorHeights: [7] }).heights)
      .toEqual([7, 7, 7]);
    expect(planStoreys({ baseY: 0, idealTop: 30, maxWallTop: 30, floors: 2, floorHeights: [7, 4, 5] }).heights)
      .toEqual([7, 4]);
  });

  it('shrinks proportionally (keeping the ratio) when the box is too short', () => {
    // 10:5 asked into 9 available cells → 6:3, still 2:1.
    const ladder = planStoreys({ baseY: 0, idealTop: 9, maxWallTop: 9, floors: 2, floorHeights: [10, 5] });
    expect(ladder.heights).toEqual([6, 3]);
    expect(ladder.wallTop).toBe(9);
  });

  it('hands the flooring remainder back so the available zone is filled', () => {
    // 7+7=14 into 13 → scaled floors to [6,6]=12, remainder 1 → [7,6].
    const ladder = planStoreys({ baseY: 0, idealTop: 13, maxWallTop: 13, floors: 2, floorHeights: [7, 7] });
    expect(ladder.heights).toEqual([7, 6]);
    expect(ladder.wallTop).toBe(13);
  });

  it('keeps the heights (overflow tolerated) when even 3-cell storeys cannot fit', () => {
    const ladder = planStoreys({ baseY: 0, idealTop: 4, maxWallTop: 4, floors: 2, floorHeights: [5, 5] });
    expect(ladder.heights).toEqual([5, 5]); // the caller's own guards take over
  });

  it('offsets the slab Ys from a raised base', () => {
    const ladder = planStoreys({ baseY: 4, idealTop: 20, maxWallTop: 20, floors: 2, floorHeights: [6, 4] });
    expect(ladder.slabYs).toEqual([4, 10]);
    expect(ladder.wallTop).toBe(14);
  });
});

describe('sanitizeFloorHeights', () => {
  it('accepts a numeric array, truncating and clamping each entry', () => {
    expect(sanitizeFloorHeights([5.7, 2, 40])).toEqual([5, 3, 32]);
  });

  it('rejects anything that is not a non-empty numeric array', () => {
    expect(sanitizeFloorHeights(undefined)).toBeUndefined();
    expect(sanitizeFloorHeights('5,4')).toBeUndefined();
    expect(sanitizeFloorHeights([])).toBeUndefined();
    expect(sanitizeFloorHeights(['5', 4])).toBeUndefined();
    expect(sanitizeFloorHeights([NaN])).toBeUndefined();
    expect(sanitizeFloorHeights(Array.from({ length: 9 }, () => 5))).toBeUndefined();
  });
});

describe('heightOverhead: roof-aware', () => {
  it('a FLAT roof pays only a deck + parapet, never the pitch reserve', () => {
    expect(heightOverhead({ w: 37, d: 33, roof: 'flat' })).toBe(2);
    expect(heightOverhead({ w: 37, d: 33, roof: 'flat', basement: true })).toBe(7);
  });

  it('a pitched (or unstated) roof reserves ~half the smaller span + a ceiling course', () => {
    expect(heightOverhead({ w: 37, d: 33, roof: 'gable' })).toBe(17);
    expect(heightOverhead({ w: 37, d: 33 })).toBe(17); // unstated → conservative pitch
    expect(heightOverhead({ w: 11, d: 11, roof: 'hip', basement: true, attic: true })).toBe(13);
  });
});
