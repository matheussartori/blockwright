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

describe('compose: structure types × decorations', () => {
  it('recognises the registered structure types, rejects unknowns and retired names', () => {
    expect(isKnownStructure('house')).toBe(true);
    expect(isKnownStructure('basement')).toBe(false); // basement is its own category, not a structure type
    expect(isKnownStructure('abandoned_house')).toBe(false); // alias retired
    expect(isKnownStructure('castle')).toBe(false);
    expect(knownStructureNames()).toEqual(['house']);
  });

  it('builds with the default (cozy) decoration and is deterministic for a seed', () => {
    const a = composeStructure('house', from, house, { seed: 7 }, stubIntern());
    const b = composeStructure('house', from, house, { seed: 7 }, stubIntern());
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
  });

  it('every roof/basement/room module is linked to the house via appliesTo', () => {
    const cat = listModuleCatalog();
    expect(cat.roof.map((m) => m.id)).toEqual(expect.arrayContaining(['gable', 'hip']));
    expect(cat.basement.map((m) => m.id)).toEqual(expect.arrayContaining(['cellar', 'crypt', 'cult-temple']));
    expect(cat.room.map((m) => m.id)).toEqual(expect.arrayContaining(['living', 'kitchen', 'library']));
    // Every roof/basement/room module declares the structures it pairs with, and all of
    // them currently include the house (more structure ids can be added later, e.g. a
    // crypt basement gaining 'tower' → ['house','tower']).
    for (const m of [...cat.roof, ...cat.basement, ...cat.room]) {
      expect(m.appliesTo, `${m.id} must declare appliesTo`).toBeTruthy();
      expect(m.appliesTo, `${m.id} must apply to house`).toContain('house');
    }
  });

  it('structure modules declare their finalize passes (modular per-structure code gating)', () => {
    // House is a hearth home → stair cleanup + single-chimney; an unknown id contributes nothing.
    expect(structureFinalizers('house')).toEqual(expect.arrayContaining(['stairs', 'chimney']));
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
    const onOther = composeModule('roof', 'gable', from, to, { decoration: 'cozy' }, stubIntern(), 'barn');
    // The house adds gable-end vents; a host with no integration adds nothing extra.
    expect(onHouse.length).toBeGreaterThan(generic.length);
    expect(onOther.length).toBe(generic.length);
  });

  it('runs a basement module build() (sealed cellar: floor/ceiling, walls, pillars, light)', () => {
    const ops = composeModule('basement', 'cellar', from, to, { decoration: 'cozy' }, stubIntern());
    // The cellar lays floor/ceiling per column as `block` and the walls + pillars as
    // per-column `fill` runs, capping pillars with a `block` light.
    expect(ops.filter((o) => o.op === 'fill').length).toBeGreaterThanOrEqual(2); // walls + pillars
    expect(ops.some((o) => o.op === 'block')).toBe(true); // floor/ceiling + light
  });

  it('throws on an unknown module id', () => {
    expect(() => composeModule('roof', 'nope', from, to, {}, stubIntern())).toThrow(/unknown roof module/);
  });

  it('composeModulePreview gives a roof a host wall box to sit on', () => {
    const ops = composeModulePreview('roof', 'gable', from, to, stubIntern());
    expect(ops.some((o) => o.op === 'walls')).toBe(true); // host walls under the roof
    expect(ops.some((o) => o.op === 'roof')).toBe(true);
  });

  it('buildModulePreview returns a compilable structure for a roof and a basement', () => {
    const roof = buildModulePreview('roof', 'gable');
    expect(roof).not.toBeNull();
    expect(roof!.palette!.length).toBeGreaterThan(0);
    expect(roof!.ops!.some((o) => o.op === 'roof')).toBe(true);
    expect(() => compileStructure(roof!)).not.toThrow(); // the pre-expanded ops + palette compile
    // The cellar ships a preview spec → a gallery preview that compiles.
    const cellar = buildModulePreview('basement', 'cellar');
    expect(cellar).not.toBeNull();
    expect(cellar!.ops!.length).toBeGreaterThan(0);
    expect(() => compileStructure(cellar!)).not.toThrow();
    // Rooms are guidance-only → no gallery preview.
    expect(buildModulePreview('room', 'living')).toBeNull();
  });
});

describe('selectedGuides: roof/basement guides respect appliesTo', () => {
  it('loads a roof guide when it applies to the chosen structure', () => {
    const guides = selectedGuides({ structureType: 'house', roof: 'gable' });
    expect(guides).toContain('nbt/modules/roof/gable.md');
  });

  it('does NOT load a roof guide for a structure it does not apply to', () => {
    // gable applies to ['house']; for any other structure its guide must not ride along.
    const guides = selectedGuides({ structureType: 'barn', roof: 'gable' });
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

  it('delegates the roof to the module — the gable form carries its host-integration vents', () => {
    // The house owns placement but DELEGATES roof geometry to the roof module. Roof form
    // doesn't change the house's other block ops (windows/door/chimney), so the only
    // block-op difference between gable and hip at a fixed seed is the gable module's
    // host integration: a vent at each gable end (+2). Proves the delegate ran build +
    // integration through the seam.
    const big: [number, number, number] = [14, 20, 14];
    const base = { floors: 2, seed: 9 };
    const blocks = (roof: string) =>
      composeStructure('house', from, big, { ...base, roof }, stubIntern()).filter((o) => o.op === 'block').length;
    expect(blocks('gable')).toBe(blocks('hip') + 2);
  });

  it('delegates the below-grade level to the basement module (adds the cellar room)', () => {
    const big: [number, number, number] = [14, 22, 14];
    const base = { floors: 2, seed: 5 };
    const withCellar = composeStructure('house', from, big, { ...base, basement: 'full' }, stubIntern());
    const noCellar = composeStructure('house', from, big, { ...base, basement: 'none' }, stubIntern());
    // The delegated cellar adds a sealed room (floor/ceiling + perimeter walls + a grid of
    // lit support pillars) the no-basement build doesn't have, while the single-roof and
    // stair-core invariants still hold.
    expect(withCellar.length).toBeGreaterThan(noCellar.length);
    expect(withCellar.filter((o) => o.op === 'roof')).toHaveLength(1);
    expect(withCellar.some((o) => o.op === 'stairs')).toBe(true);
  });

  it('the basement "half" variant adds the clerestory the "full" one omits', () => {
    const big: [number, number, number] = [14, 22, 14];
    const base = { floors: 2, seed: 5 };
    const full = composeStructure('house', from, big, { ...base, basement: 'full' }, stubIntern());
    const half = composeStructure('house', from, big, { ...base, basement: 'half' }, stubIntern());
    // Same delegated cellar room; 'half' layers the high clerestory window band on top.
    expect(half.length).toBeGreaterThan(full.length);
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
