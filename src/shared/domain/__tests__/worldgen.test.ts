import { describe, it, expect } from 'vitest';
import {
  DEFAULT_WORLDGEN,
  isValidResourceName,
  plannedFiles,
  sanitizeResourceName,
  splitFileSpecs,
  structureFolder,
  validateOptions,
  validateSplit,
  type WorldgenOptions,
} from '../worldgen';
import { splitPlan } from '../split';

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

describe('split export file plan', () => {
  const wg: WorldgenOptions = { ...DEFAULT_WORLDGEN, generate: false };

  it('plannedFiles emits the jigsaw assembly when oversized (regardless of generate)', () => {
    const plan = splitPlan([60, 10, 10], 48); // 2 pieces, 1 edge
    const files = plannedFiles('mymod', 'big', '1.21.1', wg, plan);
    const kinds = files.map((f) => f.kind);
    expect(kinds.filter((k) => k === 'piece')).toHaveLength(2);
    // start pool + 1 edge pool
    expect(kinds.filter((k) => k === 'template_pool')).toHaveLength(2);
    expect(kinds).toContain('structure');
    expect(kinds).toContain('structure_set');
    expect(kinds).toContain('biome_tag');
    // pieces live under data/<ns>/structure/<base>/
    expect(files.find((f) => f.kind === 'piece')!.rel.startsWith('data/mymod/structure/big/')).toBe(true);
  });

  it('plannedFiles keeps the single-piece path when within the limit', () => {
    const plan = splitPlan([48, 48, 48], 48);
    const files = plannedFiles('mymod', 'big', '1.21.1', { ...wg, generate: true }, plan);
    expect(files.filter((f) => f.kind === 'piece')).toHaveLength(0);
    expect(files.filter((f) => f.kind === 'nbt')).toHaveLength(1);
  });

  it('splitFileSpecs and plannedFiles agree on the rel paths', () => {
    const plan = splitPlan([100, 60, 60], 48);
    const specs = splitFileSpecs('mymod', 'big', '1.21.1', plan);
    expect(plannedFiles('mymod', 'big', '1.21.1', wg, plan).map((f) => f.rel)).toEqual(specs.map((s) => s.rel));
    // every piece + every edge pool + the 3 fixed worldgen files are present
    expect(specs.filter((s) => s.ref.type === 'piece')).toHaveLength(plan.pieceCount);
    expect(specs.filter((s) => s.ref.type === 'edge_pool')).toHaveLength(plan.edges.length);
  });

  it('validateSplit flags an informational note and within-limit plans pass clean', () => {
    expect(validateSplit(splitPlan([48, 48, 48], 48))).toEqual([]);
    const issues = validateSplit(splitPlan([60, 10, 10], 48));
    expect(issues.some((i) => i.code === 'split_active')).toBe(true);
    expect(issues.every((i) => i.level !== 'error')).toBe(true);
  });
});
