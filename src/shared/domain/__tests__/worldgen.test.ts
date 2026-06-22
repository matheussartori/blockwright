import { describe, it, expect } from 'vitest';
import {
  DEFAULT_WORLDGEN,
  isValidResourceName,
  plannedFiles,
  sanitizeResourceName,
  structureFolder,
  validateOptions,
  type WorldgenOptions,
} from '../worldgen';

describe('sanitizeResourceName', () => {
  it('lowercases and replaces illegal characters', () => {
    expect(sanitizeResourceName('My Tower!')).toBe('my_tower');
    expect(sanitizeResourceName('Café 2')).toBe('caf_2');
  });
  it('keeps already-legal ids untouched', () => {
    expect(sanitizeResourceName('wizard.tower-2')).toBe('wizard.tower-2');
  });
  it('falls back to `structure` for empty/garbage input', () => {
    expect(sanitizeResourceName('   ')).toBe('structure');
    expect(sanitizeResourceName('!!!')).toBe('structure');
  });
});

describe('isValidResourceName', () => {
  it('accepts legal ids and rejects illegal ones', () => {
    expect(isValidResourceName('tower')).toBe(true);
    expect(isValidResourceName('My Tower')).toBe(false);
    expect(isValidResourceName('')).toBe(false);
  });
});

describe('structureFolder', () => {
  it('uses the singular `structure` folder for 1.21+', () => {
    expect(structureFolder('1.21.1')).toBe('structure');
    expect(structureFolder('1.21')).toBe('structure');
    expect(structureFolder('1.22')).toBe('structure');
  });
  it('uses the legacy `structures` folder before 1.21', () => {
    expect(structureFolder('1.20.4')).toBe('structures');
    expect(structureFolder('1.19.2')).toBe('structures');
  });
  it('assumes modern when the version is unknown', () => {
    expect(structureFolder(null)).toBe('structure');
  });
});

describe('plannedFiles', () => {
  it('lists the nbt plus four worldgen files when generating', () => {
    const files = plannedFiles('mymod', 'tower', '1.21.1', { ...DEFAULT_WORLDGEN, generate: true });
    expect(files.map((f) => f.rel)).toEqual([
      'data/mymod/structure/tower.nbt',
      'data/mymod/worldgen/structure/tower.json',
      'data/mymod/worldgen/template_pool/tower/start.json',
      'data/mymod/worldgen/structure_set/tower.json',
      'data/mymod/tags/worldgen/biome/has_structure/tower.json',
    ]);
  });
  it('writes only the nbt when worldgen is off', () => {
    const files = plannedFiles('mymod', 'tower', '1.21.1', { ...DEFAULT_WORLDGEN, generate: false });
    expect(files).toHaveLength(1);
    expect(files[0].kind).toBe('nbt');
  });
  it('honors the legacy folder name for old versions', () => {
    const files = plannedFiles('mymod', 'tower', '1.20.1', DEFAULT_WORLDGEN);
    expect(files[0].rel).toBe('data/mymod/structures/tower.nbt');
  });
});

describe('validateOptions', () => {
  const ok: WorldgenOptions = { ...DEFAULT_WORLDGEN, generate: true };
  it('passes a sane configuration', () => {
    expect(validateOptions('tower', ok)).toEqual([]);
  });
  it('rejects separation ≥ spacing (the never-places trap)', () => {
    const issues = validateOptions('tower', { ...ok, spacing: 8, separation: 8 });
    expect(issues.some((i) => i.code === 'separation_ge_spacing')).toBe(true);
  });
  it('rejects an empty biome list (silent no-spawn)', () => {
    const issues = validateOptions('tower', { ...ok, biomes: [] });
    expect(issues.some((i) => i.code === 'biomes_empty')).toBe(true);
  });
  it('skips worldgen checks when not generating', () => {
    const issues = validateOptions('tower', { ...ok, generate: false, biomes: [], separation: 999 });
    expect(issues).toEqual([]);
  });
});
