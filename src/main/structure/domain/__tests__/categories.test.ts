import { describe, expect, it } from 'vitest';
import { getModule, getGeometryModule, type GeometryCategory } from '../categories';
import { listModuleCatalog } from '../index';
import type { ModuleCategory } from '../modules';

describe('category dispatch (registry-of-registries)', () => {
  const catalog = listModuleCatalog();

  it('resolves a module by (category, id) for every category', () => {
    const cases: [ModuleCategory, string][] = [
      ['structure', 'classic'],
      ['decoration', 'cozy'],
      ['roof', 'gable'],
      ['basement', 'cellar'],
      ['attic', 'storage'],
      ['room', 'kitchen'],
    ];
    for (const [cat, id] of cases) {
      const m = getModule(cat, id);
      expect(m, `${cat}/${id}`).toBeDefined();
      expect(m!.id).toBe(id);
      expect(m!.category).toBe(cat);
    }
  });

  it('returns undefined for an unknown id', () => {
    expect(getModule('roof', 'nope')).toBeUndefined();
    expect(getGeometryModule('basement', 'nope')).toBeUndefined();
  });

  it('every catalog module is reachable through getModule (dispatch ⇄ catalog parity)', () => {
    const categories: ModuleCategory[] = ['structure', 'decoration', 'roof', 'basement', 'attic', 'room'];
    for (const cat of categories) {
      for (const m of catalog[cat]) {
        expect(getModule(cat, m.id)?.id, `${cat}/${m.id}`).toBe(m.id);
      }
    }
  });

  it('getGeometryModule exposes the build hooks for geometry categories', () => {
    const geom: GeometryCategory[] = ['roof', 'basement', 'attic'];
    for (const cat of geom) {
      const first = catalog[cat][0];
      const m = getGeometryModule(cat, first.id);
      expect(m).toBeDefined();
      // The geometry categories all currently ship a `build()`; the typed accessor exposes it.
      expect(typeof m!.build).toBe('function');
    }
  });
});
