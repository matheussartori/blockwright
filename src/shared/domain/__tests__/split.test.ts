import { describe, it, expect } from 'vitest';
import { effectiveNbtLimit, splitAxis, splitPlan, type Vec3 } from '../split';

describe('effectiveNbtLimit', () => {
  it('pins explicit choices', () => {
    expect(effectiveNbtLimit('48', '1.12')).toBe(48);
    expect(effectiveNbtLimit('32', '1.21.1')).toBe(32);
  });
  it('derives from version on auto (1.16 raised the cap)', () => {
    expect(effectiveNbtLimit('auto', '1.21.1')).toBe(48);
    expect(effectiveNbtLimit('auto', '1.16')).toBe(48);
    expect(effectiveNbtLimit('auto', '1.15.2')).toBe(32);
    expect(effectiveNbtLimit('auto', '1.12.2')).toBe(32);
    expect(effectiveNbtLimit('auto', null)).toBe(48); // unknown → modern
  });
});

describe('splitAxis', () => {
  it('keeps every segment within the limit', () => {
    for (const [len, limit] of [[60, 48], [100, 48], [200, 32], [49, 48], [48, 48]] as const) {
      const segs = splitAxis(len, limit);
      expect(segs.reduce((a, s) => a + s.len, 0)).toBe(len); // exact coverage
      for (const s of segs) expect(s.len).toBeLessThanOrEqual(limit);
    }
  });
  it('balances segments (first remainder gets +1) and is contiguous', () => {
    expect(splitAxis(100, 48)).toEqual([
      { start: 0, len: 34 },
      { start: 34, len: 33 },
      { start: 67, len: 33 },
    ]);
  });
});

describe('splitPlan', () => {
  it('is not oversized when every axis fits the limit', () => {
    const plan = splitPlan([48, 48, 48], 48);
    expect(plan.oversized).toBe(false);
    expect(plan.pieceCount).toBe(1);
    expect(plan.edges).toHaveLength(0);
  });

  it('splits when any axis exceeds the limit', () => {
    const plan = splitPlan([49, 10, 10], 48);
    expect(plan.oversized).toBe(true);
    expect(plan.divisions).toEqual({ nx: 2, ny: 1, nz: 1 });
    expect(plan.pieceCount).toBe(2);
    expect(plan.edges).toHaveLength(1);
  });

  it('produces a spanning tree (pieceCount-1 edges, all reachable from root)', () => {
    const plan = splitPlan([60, 50, 60], 48); // 2 × 2 × 2 = 8 pieces
    expect(plan.pieceCount).toBe(8);
    expect(plan.edges).toHaveLength(plan.pieceCount - 1);

    const reached = new Set<number>([plan.root]);
    let grew = true;
    while (grew) {
      grew = false;
      for (const e of plan.edges) {
        if (reached.has(e.parent) && !reached.has(e.child)) {
          reached.add(e.child);
          grew = true;
        }
      }
    }
    expect(reached.size).toBe(plan.pieceCount); // every piece connected to root
  });

  it('tiles the volume with no gap or overlap', () => {
    const size: Vec3 = [60, 50, 60];
    const plan = splitPlan(size, 48);
    const seen = new Set<string>();
    let count = 0;
    for (const s of plan.slots) {
      for (let x = s.min[0]; x < s.min[0] + s.size[0]; x++) {
        for (let y = s.min[1]; y < s.min[1] + s.size[1]; y++) {
          for (let z = s.min[2]; z < s.min[2] + s.size[2]; z++) {
            const k = `${x},${y},${z}`;
            expect(seen.has(k)).toBe(false); // no overlap
            seen.add(k);
            count++;
          }
        }
      }
    }
    expect(count).toBe(size[0] * size[1] * size[2]); // full coverage, no gap
    for (const s of plan.slots) for (let a = 0; a < 3; a++) expect(s.size[a]).toBeLessThanOrEqual(48);
  });

  it('connects only grid-adjacent slots (differ by 1 on exactly one axis)', () => {
    const plan = splitPlan([60, 50, 60], 48);
    for (const e of plan.edges) {
      const p = plan.slots[e.parent];
      const c = plan.slots[e.child];
      const d = Math.abs(p.i - c.i) + Math.abs(p.j - c.j) + Math.abs(p.k - c.k);
      expect(d).toBe(1);
    }
  });

  it('always gives the root an outbound edge (so the /place jigsaw target exists)', () => {
    for (const size of [[49, 10, 10], [60, 50, 60], [200, 48, 48]] as Vec3[]) {
      const plan = splitPlan(size, 48);
      expect(plan.edges.some((e) => e.parent === plan.root)).toBe(true);
    }
  });
});
