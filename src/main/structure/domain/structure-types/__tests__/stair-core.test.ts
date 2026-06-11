import { describe, expect, it } from 'vitest';
import { addStairCore } from '../stair-core';
import { box, type RolePalette } from '../types';
import type { AuthoringOp } from '../../../authoring/types';

/** A throwaway role palette: each (role, props) interns to a stable incrementing index,
 *  and `idOf` returns a synthetic block id so the geometry logic can run without the
 *  real decoration/content pack. */
function stubPalette(): RolePalette {
  const seen = new Map<string, number>();
  const intern = (key: string): number => {
    if (!seen.has(key)) seen.set(key, seen.size);
    return seen.get(key)!;
  };
  return {
    get: (role, props) => intern(`${role}|${JSON.stringify(props ?? {})}`),
    weather: (role, props) => intern(`weather:${role}|${JSON.stringify(props ?? {})}`),
    air: () => intern('air'),
    idOf: (role) => `minecraft:${role}`,
  };
}

/** The y of every walkable slab for `floors` storeys of height `h`, bottom-up. */
const slabs = (floors: number, h: number, base = 0): number[] =>
  Array.from({ length: floors }, (_, f) => base + f * h);

describe('addStairCore', () => {
  it('lays a side-by-side switchback (one flight per storey gap) when the footprint fits', () => {
    const ops: AuthoringOp[] = [];
    addStairCore({ ops, box: box([0, 0, 0], [10, 20, 8]), slabYs: slabs(3, 5), storeyH: 5, palette: stubPalette() });
    const flights = ops.filter((o) => o.op === 'stairs');
    expect(flights).toHaveLength(2); // 3 storeys → 2 connecting flights
    // Each flight carves its stairwell hole + headroom (a `clear` index) through the slab.
    for (const f of flights) expect(f).toHaveProperty('clear');
  });

  it('alternates flight rows so the up/down runs sit side by side', () => {
    const ops: AuthoringOp[] = [];
    addStairCore({ ops, box: box([0, 0, 0], [10, 20, 8]), slabYs: slabs(3, 5), storeyH: 5, palette: stubPalette() });
    const flights = ops.filter((o): o is Extract<AuthoringOp, { op: 'stairs' }> => o.op === 'stairs');
    // The two flights run on adjacent z rows (the switchback turn), never the same row.
    const rows = flights.map((f) => f.from[2]);
    expect(new Set(rows).size).toBe(2);
    expect(Math.abs(rows[0] - rows[1])).toBe(1);
  });

  it('falls back to a continuous wall ladder (never a bare shaft) when the footprint is too tight', () => {
    const ops: AuthoringOp[] = [];
    // A run of 4 cells can't fit in a 3×3 interior → no stair fits.
    addStairCore({ ops, box: box([0, 0, 0], [4, 20, 4]), slabYs: slabs(3, 5), storeyH: 5, palette: stubPalette() });
    expect(ops.some((o) => o.op === 'stairs')).toBe(false);
    // A vertical column of ladder blocks links the floors instead.
    const ladders = ops.filter((o) => o.op === 'block');
    expect(ladders.length).toBeGreaterThan(0);
  });

  it('adds an attic access ladder only when atticWallTop is set', () => {
    const withAttic: AuthoringOp[] = [];
    addStairCore({ ops: withAttic, box: box([0, 0, 0], [10, 30, 8]), slabYs: slabs(2, 5), storeyH: 5, palette: stubPalette(), atticWallTop: 18 });
    const withoutAttic: AuthoringOp[] = [];
    addStairCore({ ops: withoutAttic, box: box([0, 0, 0], [10, 30, 8]), slabYs: slabs(2, 5), storeyH: 5, palette: stubPalette() });
    // The attic build emits extra block ops (the climb + step-off) the plain build doesn't.
    expect(withAttic.filter((o) => o.op === 'block').length)
      .toBeGreaterThan(withoutAttic.filter((o) => o.op === 'block').length);
  });

  it('links each consecutive storey: N storeys → N-1 flights', () => {
    for (const n of [2, 3, 4]) {
      const ops: AuthoringOp[] = [];
      addStairCore({ ops, box: box([0, 0, 0], [10, 40, 8]), slabYs: slabs(n, 5), storeyH: 5, palette: stubPalette() });
      expect(ops.filter((o) => o.op === 'stairs')).toHaveLength(n - 1);
    }
  });
});
