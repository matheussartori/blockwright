import { describe, expect, it } from 'vitest';
import { DATA_VERSIONS, dataVersionFor, DEFAULT_DATA_VERSION } from '../mc-data-version';

describe('dataVersionFor', () => {
  it('resolves exact known versions', () => {
    expect(dataVersionFor('1.21.1')).toBe(3955);
    expect(dataVersionFor('1.21.4')).toBe(4189);
    expect(dataVersionFor('26.2')).toBe(4903);
  });

  it('falls back to the NEAREST OLDER release for gaps (never a newer stamp)', () => {
    // 26.1 isn't tabled — stamp the newest 1.x we know; the 26.1 game upgrades it on load.
    expect(dataVersionFor('26.1')).toBe(DATA_VERSIONS['1.21.8']);
    // 1.21.2 → 1.21.1; 1.20.2 → 1.20.1.
    expect(dataVersionFor('1.21.2')).toBe(DATA_VERSIONS['1.21.1']);
    expect(dataVersionFor('1.20.2')).toBe(DATA_VERSIONS['1.20.1']);
    // A future drop resolves to the newest tabled entry.
    expect(dataVersionFor('27.3')).toBe(DATA_VERSIONS['26.2']);
  });

  it('uses the default when unknown or older than the whole table', () => {
    expect(dataVersionFor(null)).toBe(DEFAULT_DATA_VERSION);
    expect(dataVersionFor('garbage')).toBe(DEFAULT_DATA_VERSION);
    expect(dataVersionFor('1.12.2')).toBe(DEFAULT_DATA_VERSION);
  });

  it('keeps the default pinned at 1.21.1 (the AI knowledge-base target)', () => {
    expect(DEFAULT_DATA_VERSION).toBe(3955);
  });
});
