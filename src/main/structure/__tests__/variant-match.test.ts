import { describe, expect, it } from 'vitest';
import { bestVariant, variantScore } from '../variant-match';

// The barrel blockstate has only compound keys (facing + open); a palette that
// omits `open` must still resolve, not fall back to a flat color.
const barrel = {
  'facing=down,open=false': 'down-closed',
  'facing=down,open=true': 'down-open',
  'facing=up,open=false': 'up-closed',
  'facing=up,open=true': 'up-open',
};

describe('variantScore', () => {
  it('matches an exact full property set', () => {
    expect(variantScore('facing=up,open=false', { facing: 'up', open: 'false' })).toBe(2);
  });

  it('disqualifies a conflicting present property', () => {
    expect(variantScore('facing=up,open=false', { facing: 'down', open: 'false' })).toBe(-1);
  });

  it('ignores absent properties instead of failing', () => {
    // `open` missing — partial match, not a conflict.
    expect(variantScore('facing=up,open=false', { facing: 'up' })).toBe(1);
  });

  it('treats the empty key as a zero-score catch-all', () => {
    expect(variantScore('', { facing: 'up' })).toBe(0);
  });
});

describe('bestVariant', () => {
  it('picks the exact match when fully specified', () => {
    expect(bestVariant(barrel, { facing: 'up', open: 'true' })).toBe('up-open');
  });

  it('resolves a barrel missing `open` to the first facing match (open=false default)', () => {
    expect(bestVariant(barrel, { facing: 'up' })).toBe('up-closed');
  });

  it('still resolves with no properties at all rather than returning undefined', () => {
    expect(bestVariant(barrel, {})).toBe('down-closed');
  });

  it('returns undefined for an empty variant map', () => {
    expect(bestVariant({}, { facing: 'up' })).toBeUndefined();
  });
});
