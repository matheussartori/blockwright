import { describe, expect, it } from 'vitest';
import { isSlimeChunk, JavaRandom } from '../slime';

describe('JavaRandom', () => {
  it('reproduces java.util.Random(0)’s documented nextInt() stream', () => {
    // The canonical first three values of `new java.util.Random(0).nextInt()`.
    const r = new JavaRandom(0n);
    expect(r.nextInt()).toBe(-1155484576);
    expect(r.nextInt()).toBe(-723955400);
    expect(r.nextInt()).toBe(1033096058);
  });

  it('nextInt(bound) stays in range and is deterministic', () => {
    const r = new JavaRandom(42n);
    const seen = new Set<number>();
    for (let i = 0; i < 1000; i++) {
      const v = r.nextInt(10);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(10);
      seen.add(v);
    }
    expect(seen.size).toBe(10); // all buckets hit over 1000 draws
    // Determinism: the same seed replays the same stream.
    expect(new JavaRandom(42n).nextInt(10)).toBe(new JavaRandom(42n).nextInt(10));
  });

  it('handles power-of-two bounds via the multiply-shift path', () => {
    const r = new JavaRandom(7n);
    for (let i = 0; i < 100; i++) {
      const v = r.nextInt(16);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(16);
    }
  });
});

describe('isSlimeChunk', () => {
  it('is deterministic and ~10% dense', () => {
    let count = 0;
    const area = 64;
    for (let cx = -area; cx < area; cx++) {
      for (let cz = -area; cz < area; cz++) {
        const a = isSlimeChunk('123456789', cx, cz);
        expect(isSlimeChunk('123456789', cx, cz)).toBe(a);
        if (a) count++;
      }
    }
    const density = count / (area * 2) ** 2;
    expect(density).toBeGreaterThan(0.08);
    expect(density).toBeLessThan(0.12);
  });

  it('depends on the seed', () => {
    // Two seeds must disagree somewhere in a small area.
    let differs = false;
    for (let cx = 0; cx < 16 && !differs; cx++) {
      for (let cz = 0; cz < 16 && !differs; cz++) {
        if (isSlimeChunk('1', cx, cz) !== isSlimeChunk('2', cx, cz)) differs = true;
      }
    }
    expect(differs).toBe(true);
  });

  it('accepts negative 64-bit seeds (decimal string)', () => {
    expect(() => isSlimeChunk('-9223372036854775808', -100000, 100000)).not.toThrow();
  });
});
