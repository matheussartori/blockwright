import { describe, expect, it } from 'vitest';
import {
  isJigsawSupported,
  mcVersionAtLeast,
  mcVersionRank,
  minorOf,
  parseMcVersion,
} from '../mc-version';

describe('parseMcVersion', () => {
  it('parses the classic 1.x line', () => {
    expect(parseMcVersion('1.21.1')).toBe('1.21.1');
    expect(parseMcVersion('1.21')).toBe('1.21');
    expect(parseMcVersion('minecraft_version=1.20.4')).toBe('1.20.4');
    expect(parseMcVersion('[1.19.4,1.20)')).toBe('1.19.4');
    expect(parseMcVersion('~1.21.11')).toBe('1.21.11');
  });

  it('parses the year-numbered 26.x scheme', () => {
    expect(parseMcVersion('26.2')).toBe('26.2');
    expect(parseMcVersion('26.1')).toBe('26.1');
    expect(parseMcVersion('26.3.1')).toBe('26.3.1');
    expect(parseMcVersion('minecraft_version=26.2')).toBe('26.2');
    expect(parseMcVersion('>=27.1')).toBe('27.1');
  });

  it('rejects non-versions', () => {
    expect(parseMcVersion(null)).toBeNull();
    expect(parseMcVersion('')).toBeNull();
    expect(parseMcVersion('fabric-loader 0.16.9')).toBeNull();
    expect(parseMcVersion('25.4')).toBeNull(); // year scheme starts at 26
    expect(parseMcVersion('nonsense')).toBeNull();
  });
});

describe('minorOf', () => {
  it('keeps major.minor across both schemes', () => {
    expect(minorOf('1.21.1')).toBe('1.21');
    expect(minorOf('26.2')).toBe('26.2');
    expect(minorOf('26.3.1')).toBe('26.3');
    expect(minorOf(null)).toBeNull();
  });
});

describe('mcVersionRank / mcVersionAtLeast', () => {
  it('orders year-numbered releases above every 1.x', () => {
    const r = (v: string) => mcVersionRank(v)!;
    expect(r('1.21.11')).toBeLessThan(r('26.1'));
    expect(r('26.1')).toBeLessThan(r('26.2'));
    expect(r('26.2')).toBeLessThan(r('26.2.1'));
    expect(r('1.20.4')).toBeLessThan(r('1.21'));
    expect(r('1.21')).toBeLessThan(r('1.21.1'));
    expect(mcVersionRank('garbage')).toBeNull();
  });

  it('compares against a floor with a fallback for unparseable input', () => {
    expect(mcVersionAtLeast('26.2', '1.21')).toBe(true);
    expect(mcVersionAtLeast('1.20.4', '1.21')).toBe(false);
    expect(mcVersionAtLeast('1.21', '1.21')).toBe(true);
    expect(mcVersionAtLeast(null, '1.21')).toBe(true); // default: assume modern
    expect(mcVersionAtLeast(null, '1.21', false)).toBe(false);
  });
});

describe('isJigsawSupported', () => {
  it('accepts the validated 1.21 line', () => {
    expect(isJigsawSupported('1.21.1')).toBe(true);
    expect(isJigsawSupported('1.21.4')).toBe(true);
  });

  it('accepts year-numbered releases wholesale', () => {
    expect(isJigsawSupported('26.1')).toBe(true);
    expect(isJigsawSupported('26.2')).toBe(true);
    expect(isJigsawSupported('27.1')).toBe(true);
  });

  it('rejects unvalidated older lines and unknowns', () => {
    expect(isJigsawSupported('1.20.4')).toBe(false);
    expect(isJigsawSupported(null)).toBe(false);
    expect(isJigsawSupported('nonsense')).toBe(false);
  });
});
