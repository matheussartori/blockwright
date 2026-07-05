import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { detectMcVersion } from '../mc-version-detect';

let root: string;

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'bw-mcver-'));
});

afterEach(() => {
  fs.rmSync(root, { recursive: true, force: true });
});

const writeMeta = (pack: Record<string, unknown>) =>
  fs.writeFileSync(path.join(root, 'pack.mcmeta'), JSON.stringify({ pack }));

describe('detectMcVersion', () => {
  it('reads version.json first (exact version)', () => {
    fs.writeFileSync(path.join(root, 'version.json'), JSON.stringify({ id: '26.2' }));
    writeMeta({ pack_format: 48 });
    expect(detectMcVersion(root)).toBe('26.2');
  });

  it('reads a year-numbered fabric.mod.json dependency', () => {
    fs.writeFileSync(
      path.join(root, 'fabric.mod.json'),
      JSON.stringify({ depends: { minecraft: '~26.1' } }),
    );
    expect(detectMcVersion(root)).toBe('26.1');
  });

  it('reads a year-numbered gradle.properties', () => {
    fs.writeFileSync(path.join(root, 'gradle.properties'), 'minecraft_version=26.2\n');
    expect(detectMcVersion(root)).toBe('26.2');
  });

  it('maps a classic pack_format', () => {
    writeMeta({ pack_format: 48 });
    expect(detectMcVersion(root)).toBe('1.21.1');
  });

  it('maps an in-between pack_format to the nearest known family below it', () => {
    writeMeta({ pack_format: 58 }); // between 57 (1.21.3) and 61 (1.21.4)
    expect(detectMcVersion(root)).toBe('1.21.3');
  });

  it('reads the 26.x min_format/max_format range (number, fractional, and pair forms)', () => {
    writeMeta({ min_format: 107, max_format: 107 });
    expect(detectMcVersion(root)).toBe('26.2');

    writeMeta({ min_format: 107.1 });
    expect(detectMcVersion(root)).toBe('26.2');

    writeMeta({ min_format: [107, 1] });
    expect(detectMcVersion(root)).toBe('26.2');
  });

  it('returns null when nothing declares a version', () => {
    expect(detectMcVersion(root)).toBeNull();
  });
});
