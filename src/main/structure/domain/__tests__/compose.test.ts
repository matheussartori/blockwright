import { describe, expect, it } from 'vitest';
import { composeStructure, composeModule, composeModulePreview, isKnownStructure, knownStructureNames, type Intern } from '../compose';
import { buildModulePreview, listModuleCatalog, selectedGuides, structureFinalizers } from '../index';
import { compileStructure } from '../../authoring';

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

  it('the catalog projects structure params for the Details controls (no decay/unit, no module-owned)', () => {
    const cat = listModuleCatalog();
    const house = cat.structure.find((m) => m.id === 'house');
    const names = (house?.params ?? []).map((p) => p.name);
    expect(names).toEqual(expect.arrayContaining(['floors', 'attic', 'balcony']));
    expect(names).not.toContain('decay'); // unit params belong to the decoration, not the UI
    // roof + basement are promoted to their own module-category selects, so they no
    // longer appear as the house's own param controls (they stay in the build spec).
    expect(names).not.toContain('roof');
    expect(names).not.toContain('basement');
    const floors = house?.params?.find((p) => p.name === 'floors');
    expect(floors).toMatchObject({ kind: 'int', label: 'Floors', min: 1, max: 4 });
    // Tower exposes only its own params (crown), never the house's.
    const tower = cat.structure.find((m) => m.id === 'tower');
    expect((tower?.params ?? []).map((p) => p.name)).toEqual(['crown']);
  });

  it('roof + basement are their own module categories, linked to the house via appliesTo', () => {
    const cat = listModuleCatalog();
    expect(cat.roof.map((m) => m.id)).toEqual(expect.arrayContaining(['gable', 'hip']));
    expect(cat.basement.map((m) => m.id)).toEqual(expect.arrayContaining(['full', 'half', 'basement']));
    // Every roof/basement module declares the structures it pairs with (house for now).
    for (const m of [...cat.roof, ...cat.basement]) {
      expect(m.appliesTo).toContain('house');
    }
  });

  it('structure modules declare their finalize passes (modular per-structure code gating)', () => {
    // House is a hearth home → stair cleanup + single-chimney; tower is storeyed but has
    // no chimney; an unknown id contributes nothing.
    expect(structureFinalizers('house')).toEqual(expect.arrayContaining(['stairs', 'chimney']));
    expect(structureFinalizers('tower')).toEqual(['stairs']);
    expect(structureFinalizers('tower')).not.toContain('chimney');
    expect(structureFinalizers(undefined)).toEqual([]);
    expect(structureFinalizers('castle')).toEqual([]);
  });
});

describe('composeModule: roof/basement module geometry runs through the compose layer', () => {
  const from: [number, number, number] = [0, 0, 0];
  const to: [number, number, number] = [8, 6, 8];

  it('runs a roof module build() — generic geometry, any host', () => {
    const ops = composeModule('roof', 'gable', from, to, { decoration: 'cozy' }, stubIntern());
    const roofs = ops.filter((o) => o.op === 'roof');
    expect(roofs).toHaveLength(1);
    expect((roofs[0] as Extract<(typeof roofs)[number], { op: 'roof' }>).style).toBe('gable');
  });

  it('layers HOST-SPECIFIC integration ops on top only for the matching host', () => {
    const generic = composeModule('roof', 'gable', from, to, { decoration: 'cozy' }, stubIntern());
    const onHouse = composeModule('roof', 'gable', from, to, { decoration: 'cozy' }, stubIntern(), 'house');
    const onTower = composeModule('roof', 'gable', from, to, { decoration: 'cozy' }, stubIntern(), 'tower');
    // The house adds gable-end vents; a host with no integration adds nothing extra.
    expect(onHouse.length).toBeGreaterThan(generic.length);
    expect(onTower.length).toBe(generic.length);
  });

  it('runs a basement module build() (sealed room: floor, ceiling, walls, light)', () => {
    const ops = composeModule('basement', 'full', from, to, { decoration: 'cozy' }, stubIntern());
    expect(ops.filter((o) => o.op === 'fill').length).toBeGreaterThanOrEqual(2); // floor + ceiling
    expect(ops.some((o) => o.op === 'walls')).toBe(true);
    expect(ops.some((o) => o.op === 'block')).toBe(true); // the light
  });

  it('throws on an unknown module id', () => {
    expect(() => composeModule('roof', 'nope', from, to, {}, stubIntern())).toThrow(/unknown roof module/);
  });

  it('composeModulePreview gives a roof a host wall box to sit on', () => {
    const ops = composeModulePreview('roof', 'gable', from, to, stubIntern());
    expect(ops.some((o) => o.op === 'walls')).toBe(true); // host walls under the roof
    expect(ops.some((o) => o.op === 'roof')).toBe(true);
  });

  it('buildModulePreview returns a compilable structure for a roof, null for a preview-less basement', () => {
    const roof = buildModulePreview('roof', 'gable');
    expect(roof).not.toBeNull();
    expect(roof!.palette!.length).toBeGreaterThan(0);
    expect(roof!.ops!.some((o) => o.op === 'roof')).toBe(true);
    expect(() => compileStructure(roof!)).not.toThrow(); // the pre-expanded ops + palette compile
    // Basements ship no preview spec yet → no gallery preview.
    expect(buildModulePreview('basement', 'full')).toBeNull();
  });
});

describe('selectedGuides: roof/basement guides respect appliesTo', () => {
  it('loads a roof guide when it applies to the chosen structure', () => {
    const guides = selectedGuides({ structureType: 'house', roof: 'gable' });
    expect(guides).toContain('nbt/modules/roof/gable.md');
  });

  it('does NOT load a roof guide for a structure it does not apply to', () => {
    // gable applies to ['house']; on a tower its guide must not ride along.
    const guides = selectedGuides({ structureType: 'tower', roof: 'gable' });
    expect(guides).not.toContain('nbt/modules/roof/gable.md');
  });
});

describe('compose: house roof form + determinism', () => {
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
