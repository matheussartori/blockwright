import { describe, expect, it } from 'vitest';
import type { FloorDef } from '@/shared/types';
import { buildFloorPlan, normalizeFloor } from '../floors';

describe('normalizeFloor', () => {
  it('keeps an ascending range as-is', () => {
    const f: FloorDef = { id: 'a', name: 'Ground', from: 0, to: 4 };
    expect(normalizeFloor(f)).toEqual(f);
  });

  it('sorts a descending range into [from, to]', () => {
    const out = normalizeFloor({ id: 'a', name: 'x', from: 8, to: 4 });
    expect(out.from).toBe(4);
    expect(out.to).toBe(8);
  });

  it('migrates a legacy single-layer {y} record to a from===to range', () => {
    const out = normalizeFloor({ id: 'a', name: 'x', y: 3 } as FloorDef & { y?: number });
    expect(out.from).toBe(3);
    expect(out.to).toBe(3);
  });

  it('preserves id, name, and role', () => {
    const out = normalizeFloor({ id: 'b', name: 'Cellar', from: 1, to: 0, role: 'basement' });
    expect(out).toMatchObject({ id: 'b', name: 'Cellar', role: 'basement' });
  });
});

describe('buildFloorPlan', () => {
  it('returns an empty string when no levels are defined', () => {
    expect(buildFloorPlan([])).toBe('');
  });

  it('lists levels bottom-up regardless of input order', () => {
    const out = buildFloorPlan([
      { id: 'up', name: 'Upper', from: 5, to: 9 },
      { id: 'lo', name: 'Ground', from: 0, to: 4 },
    ]);
    expect(out.indexOf('Ground')).toBeLessThan(out.indexOf('Upper'));
    expect(out).toContain('[Floor plan');
  });

  it('renders a single-layer level as a single y and a span as a range', () => {
    const out = buildFloorPlan([
      { id: 's', name: 'Slab', from: 2, to: 2 },
      { id: 'r', name: 'Hall', from: 3, to: 7 },
    ]);
    expect(out).toContain('Slab: y 2');
    expect(out).toContain('Hall: y 3–7');
  });

  it('falls back to a "Level N" name when blank', () => {
    const out = buildFloorPlan([{ id: 'a', name: '   ', from: 0, to: 1 }]);
    expect(out).toContain('Level 1');
  });
});
