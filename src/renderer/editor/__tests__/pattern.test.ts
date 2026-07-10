import { describe, expect, it } from 'vitest';
import { cellHash01, isPattern, parsePattern, pickPatternIndex } from '../pattern';

describe('parsePattern', () => {
  it('parses a single plain id as a one-entry pattern', () => {
    expect(parsePattern('minecraft:stone')).toEqual([{ name: 'minecraft:stone', weight: 1 }]);
  });

  it('qualifies bare names with the vanilla namespace', () => {
    expect(parsePattern('stone')![0].name).toBe('minecraft:stone');
  });

  it('parses weighted entries and normalizes to 1', () => {
    const p = parsePattern('50% stone, 30% andesite, 20% gravel')!;
    expect(p.map((e) => e.name)).toEqual(['minecraft:stone', 'minecraft:andesite', 'minecraft:gravel']);
    expect(p.reduce((a, e) => a + e.weight, 0)).toBeCloseTo(1);
    expect(p[0].weight).toBeCloseTo(0.5);
    expect(p[2].weight).toBeCloseTo(0.2);
  });

  it('weights need not sum to 100', () => {
    const p = parsePattern('1% diamond_block, 3% gold_block')!;
    expect(p[0].weight).toBeCloseTo(0.25);
    expect(p[1].weight).toBeCloseTo(0.75);
  });

  it('unweighted entries share the average explicit weight', () => {
    const p = parsePattern('50% stone, andesite')!;
    expect(p[0].weight).toBeCloseTo(0.5);
    expect(p[1].weight).toBeCloseTo(0.5);
  });

  it('equal weights when nothing is explicit', () => {
    const p = parsePattern('stone, andesite, diorite')!;
    for (const e of p) expect(e.weight).toBeCloseTo(1 / 3);
  });

  it('rejects malformed entries', () => {
    expect(parsePattern('')).toBeNull();
    expect(parsePattern('50%')).toBeNull();
    expect(parsePattern('0% stone, andesite')).toBeNull();
    expect(parsePattern('stone; andesite')).toBeNull();
  });

  it('accepts namespaced mod ids', () => {
    expect(parsePattern('mymod:weird_block')![0].name).toBe('mymod:weird_block');
  });
});

describe('isPattern', () => {
  it('is false for a plain id and true for multi-entry input', () => {
    expect(isPattern('minecraft:stone')).toBe(false);
    expect(isPattern('stone, andesite')).toBe(true);
    expect(isPattern('not a pattern!')).toBe(false);
  });
});

describe('pickPatternIndex', () => {
  const p = parsePattern('50% stone, 30% andesite, 20% gravel')!;

  it('is deterministic per cell', () => {
    for (let i = 0; i < 20; i++) {
      const a = pickPatternIndex(p, i, i * 7, -i);
      const b = pickPatternIndex(p, i, i * 7, -i);
      expect(a).toBe(b);
    }
  });

  it('roughly honours the weights over a large sample', () => {
    const counts = [0, 0, 0];
    const N = 20000;
    for (let i = 0; i < N; i++) counts[pickPatternIndex(p, i % 100, Math.floor(i / 100), i % 37)]++;
    expect(counts[0] / N).toBeGreaterThan(0.45);
    expect(counts[0] / N).toBeLessThan(0.55);
    expect(counts[2] / N).toBeGreaterThan(0.15);
    expect(counts[2] / N).toBeLessThan(0.25);
  });

  it('single-entry pattern always picks 0', () => {
    expect(pickPatternIndex(parsePattern('stone')!, 5, 5, 5)).toBe(0);
  });

  it('hash spreads across neighbouring cells', () => {
    const seen = new Set<number>();
    for (let x = 0; x < 4; x++) for (let z = 0; z < 4; z++) seen.add(cellHash01(x, 0, z));
    expect(seen.size).toBe(16);
  });
});
