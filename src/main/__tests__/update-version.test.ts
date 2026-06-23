import { describe, expect, it } from 'vitest';
import { isNewer, parseVersion } from '../update-version';

describe('parseVersion', () => {
  it('strips a leading v and splits major.minor.patch', () => {
    expect(parseVersion('v1.2.3')).toEqual([1, 2, 3]);
    expect(parseVersion('1.2.3')).toEqual([1, 2, 3]);
  });

  it('drops prerelease/build metadata and pads missing segments', () => {
    expect(parseVersion('2.0.0-beta.1')).toEqual([2, 0, 0]);
    expect(parseVersion('1.4')).toEqual([1, 4, 0]);
    expect(parseVersion('v3')).toEqual([3, 0, 0]);
  });
});

describe('isNewer', () => {
  it('detects a strictly newer release', () => {
    expect(isNewer('1.2.0', '1.1.0')).toBe(true);
    expect(isNewer('v2.0.0', '1.9.9')).toBe(true);
    expect(isNewer('1.1.1', '1.1.0')).toBe(true);
  });

  it('is false for the same or older version', () => {
    expect(isNewer('1.1.0', '1.1.0')).toBe(false);
    expect(isNewer('1.0.0', '1.1.0')).toBe(false);
    expect(isNewer('v1.1.0', '1.1.0')).toBe(false);
  });
});
