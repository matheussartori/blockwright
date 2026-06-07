import { describe, expect, it } from 'vitest';
import {
  SCALE_TIERS,
  presetForScale,
  scaleForArea,
  scaleTier,
  type FurnishingPreset,
} from '../furnishing';

describe('scaleForArea', () => {
  it('tiers by interior floor area, ascending', () => {
    expect(scaleForArea(0).scale).toBe('snug');
    expect(scaleForArea(20).scale).toBe('snug');
    expect(scaleForArea(30).scale).toBe('standard');
    expect(scaleForArea(50).scale).toBe('standard');
    expect(scaleForArea(64).scale).toBe('grand');
    expect(scaleForArea(200).scale).toBe('grand');
  });
  it('tiers are sorted ascending by minArea', () => {
    for (let i = 1; i < SCALE_TIERS.length; i++) {
      expect(SCALE_TIERS[i].minArea).toBeGreaterThan(SCALE_TIERS[i - 1].minArea);
    }
  });
});

describe('scaleTier', () => {
  it('looks up a tier by id', () => {
    expect(scaleTier('grand').label).toBe('Grand');
  });
});

describe('presetForScale', () => {
  const presets: FurnishingPreset[] = [
    { id: 'a', label: 'A', scale: 'snug', summary: '', furnishings: [] },
    { id: 'b', label: 'B', scale: 'grand', summary: '', furnishings: [] },
  ];
  it('returns undefined for an empty library', () => {
    expect(presetForScale([], 'snug')).toBeUndefined();
    expect(presetForScale(undefined, 'snug')).toBeUndefined();
  });
  it('prefers the exact scale', () => {
    expect(presetForScale(presets, 'grand')?.id).toBe('b');
    expect(presetForScale(presets, 'snug')?.id).toBe('a');
  });
  it('falls back to the next smaller tier when the exact one is missing', () => {
    // No 'standard' preset → resolves down to 'snug', not nothing.
    expect(presetForScale(presets, 'standard')?.id).toBe('a');
  });
});
