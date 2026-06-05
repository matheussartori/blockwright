import { describe, expect, it } from 'vitest';
import { composeStructure, isKnownStructure, knownStructureNames, type Intern } from '../compose';
import { listModuleCatalog } from '../index';

/** A throwaway intern that just hands out incrementing indices per distinct key. */
function stubIntern(): Intern {
  const seen = new Map<string, number>();
  return (name, props) => {
    const k = `${name}|${JSON.stringify(props ?? {})}`;
    if (!seen.has(k)) seen.set(k, seen.size);
    return seen.get(k)!;
  };
}

const from: [number, number, number] = [0, 0, 0];
const house: [number, number, number] = [10, 7, 8];
const tower: [number, number, number] = [8, 17, 8];

describe('compose: structure types × decorations', () => {
  it('recognises the registered structure types, rejects unknowns and retired names', () => {
    expect(isKnownStructure('house')).toBe(true);
    expect(isKnownStructure('tower')).toBe(true);
    expect(isKnownStructure('basement')).toBe(false); // basement is its own (unwired) category now
    expect(isKnownStructure('abandoned_house')).toBe(false); // alias retired
    expect(isKnownStructure('castle')).toBe(false);
    expect(knownStructureNames()).toEqual(expect.arrayContaining(['house', 'tower']));
  });

  it('builds with the default (cozy) decoration and is deterministic for a seed', () => {
    const a = composeStructure('tower', from, tower, { seed: 7 }, stubIntern());
    const b = composeStructure('tower', from, tower, { seed: 7 }, stubIntern());
    expect(a.length).toBe(b.length);
    expect(a.length).toBeGreaterThan(0);
  });

  it('accepts both `decoration` and the legacy `theme` param key', () => {
    const viaDecoration = composeStructure('house', from, house, { decoration: 'cozy' }, stubIntern());
    const viaTheme = composeStructure('house', from, house, { theme: 'cozy' }, stubIntern());
    expect(viaDecoration.length).toBe(viaTheme.length);
  });

  it('throws an actionable error on an unknown type or decoration', () => {
    expect(() => composeStructure('castle', from, house, {}, stubIntern())).toThrow(/unknown structure type/);
    expect(() => composeStructure('house', from, house, { decoration: 'nope' }, stubIntern())).toThrow(/unknown decoration/);
  });

  it('house owns its massing: a single roof, a connected stair core, no doubled roofs', () => {
    const big: [number, number, number] = [14, 20, 14];
    const ops = composeStructure(
      'house',
      from,
      big,
      { floors: 2, basement: 'full', attic: 'storage', balcony: 'front' },
      stubIntern(),
    );
    const roofs = ops.filter((o) => o.op === 'roof');
    const stairs = ops.filter((o) => o.op === 'stairs');
    expect(roofs).toHaveLength(1); // exactly one roof — never the doubled-roof bug
    // basement→ground→floor2 = 2 flights (the attic is reached by a ladder, so a
    // stair flight never pierces the roof).
    expect(stairs.length).toBeGreaterThanOrEqual(2);
  });

  it('the catalog projects structure params for the Details controls (no decay/unit)', () => {
    const cat = listModuleCatalog();
    const house = cat.structure.find((m) => m.id === 'house');
    const names = (house?.params ?? []).map((p) => p.name);
    expect(names).toEqual(expect.arrayContaining(['floors', 'basement', 'attic', 'balcony', 'roof']));
    expect(names).not.toContain('decay'); // unit params belong to the decoration, not the UI
    const floors = house?.params?.find((p) => p.name === 'floors');
    expect(floors).toMatchObject({ kind: 'int', label: 'Floors', min: 1, max: 4 });
    const basement = house?.params?.find((p) => p.name === 'basement');
    expect(basement?.kind).toBe('enum');
    if (basement?.kind === 'enum') expect(basement.options.map((o) => o.value)).toEqual(['none', 'full', 'half']);
    // Tower exposes only its own params (crown), never the house's.
    const tower = cat.structure.find((m) => m.id === 'tower');
    expect((tower?.params ?? []).map((p) => p.name)).toEqual(['crown']);
  });

  it('the roof param forces the roof form (overriding the seeded pick)', () => {
    const big: [number, number, number] = [14, 20, 14];
    const base = { floors: 1, seed: 4 };
    const roofOf = (roof: string) => {
      const ops = composeStructure('house', from, big, { ...base, roof }, stubIntern());
      return ops.find((o) => o.op === 'roof') as Extract<(typeof ops)[number], { op: 'roof' }>;
    };
    expect(roofOf('hip').style).toBe('hip');
    expect(roofOf('gable').style).toBe('gable');
  });

  it('house params are deterministic for the same box + params + seed', () => {
    const big: [number, number, number] = [12, 18, 12];
    const p = { floors: 2, basement: 'half', attic: 'finished', balcony: 'side', seed: 3 };
    const a = composeStructure('house', from, big, p, stubIntern());
    const b = composeStructure('house', from, big, p, stubIntern());
    expect(JSON.stringify(a)).toBe(JSON.stringify(b)); // byte-identical for a fixed seed
  });

  it('the seed varies the shell across runs (different windows/corners/roof), still a single roof', () => {
    const big: [number, number, number] = [14, 20, 14];
    const base = { floors: 2, basement: 'full', attic: 'storage', balcony: 'front' };
    const shapes = new Set<string>();
    for (let seed = 1; seed <= 16; seed++) {
      const ops = composeStructure('house', from, big, { ...base, seed }, stubIntern());
      expect(ops.filter((o) => o.op === 'roof')).toHaveLength(1); // invariant holds for every seed
      shapes.add(JSON.stringify(ops));
    }
    expect(shapes.size).toBeGreaterThan(1); // not every run is the same shell
  });
});
