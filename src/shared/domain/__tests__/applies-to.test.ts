import { describe, expect, it } from 'vitest';
import { moduleAppliesTo } from '../applies-to';

describe('moduleAppliesTo', () => {
  it('applies to everything when appliesTo is omitted', () => {
    expect(moduleAppliesTo(undefined, 'house')).toBe(true);
    expect(moduleAppliesTo(undefined, undefined)).toBe(true);
  });

  it('applies to everything when appliesTo is empty', () => {
    expect(moduleAppliesTo([], 'tower')).toBe(true);
    expect(moduleAppliesTo([], undefined)).toBe(true);
  });

  it('applies only when the host is in appliesTo', () => {
    expect(moduleAppliesTo(['house'], 'house')).toBe(true);
    expect(moduleAppliesTo(['house', 'tower'], 'tower')).toBe(true);
    expect(moduleAppliesTo(['house'], 'tower')).toBe(false);
  });

  it('does not apply when there is no host to match a restriction', () => {
    expect(moduleAppliesTo(['house'], undefined)).toBe(false);
  });
});
