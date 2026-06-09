import { describe, expect, it } from 'vitest';
import { composeStructure, composeModule, composeModulePreview, isKnownStructure, knownStructureNames, type Intern } from '../compose';
import { buildModulePreview, listModuleCatalog, selectedGuides, structureFinalizers, structureFloorPlan } from '../index';
import { moduleAppliesTo } from '@/shared/domain/applies-to';
import { MODULE_SLOTS } from '@/shared/domain/module-slots';
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
    expect(isKnownStructure('classic')).toBe(true);
    // The modern villa, cabin and L-shaped house are all code-built structure types now.
    expect(isKnownStructure('modern')).toBe(true);
    expect(isKnownStructure('cabin')).toBe(true);
    expect(isKnownStructure('l-shaped')).toBe(true);
    expect(isKnownStructure('house')).toBe(false); // 'house' is now the GROUP id, not a structure type
    expect(isKnownStructure('basement')).toBe(false); // basement is its own category, not a structure type
    expect(isKnownStructure('abandoned_house')).toBe(false); // alias retired
    expect(isKnownStructure('castle')).toBe(false);
    expect(knownStructureNames()).toEqual(['classic', 'modern', 'cabin', 'l-shaped', 'farmhouse']);
  });

  it('builds with the default (cozy) decoration and is deterministic for a seed', () => {
    const a = composeStructure('classic', from, house, { seed: 7 }, stubIntern());
    const b = composeStructure('classic', from, house, { seed: 7 }, stubIntern());
    expect(a.length).toBe(b.length);
    expect(a.length).toBeGreaterThan(0);
  });

  it('classic with a flat roof caps flat (no pitched roof op) and compiles', () => {
    const size: [number, number, number] = [12, 16, 12];
    const corner: [number, number, number] = [11, 15, 11];
    const ops = composeStructure('classic', from, corner, { roof: 'flat', attic: 'bedroom' }, stubIntern());
    expect(ops.filter((o) => o.op === 'roof')).toHaveLength(0); // a flat cap is fills/walls, not a `roof` op
    // Compile via a self-interning `template` op (the composed `ops` above reference the
    // stub palette, so they're checked for shape only, not compiled directly).
    expect(() =>
      compileStructure({
        DataVersion: 3955,
        size,
        palette: [{ Name: 'minecraft:air' }],
        ops: [{ op: 'template', name: 'classic', from, to: corner, params: { roof: 'flat', attic: 'bedroom' } }],
      }),
    ).not.toThrow();
  });

  it('classic delegates a pitched-roof attic to the attic module (an extra floored loft)', () => {
    const big: [number, number, number] = [11, 17, 11];
    const withAttic = composeStructure('classic', from, big, { floors: 1, attic: 'bedroom' }, stubIntern());
    const without = composeStructure('classic', from, big, { floors: 1, attic: 'none' }, stubIntern());
    expect(withAttic.filter((o) => o.op === 'roof')).toHaveLength(1); // still one (pitched) roof
    expect(withAttic.length).toBeGreaterThan(without.length); // the attic adds floor + light ops
  });

  it('structureFloorPlan gives the modern villa storeys authoritatively, bottom-up', () => {
    const plan = structureFloorPlan('modern', [36, 15, 20], {});
    expect(plan.map((f) => f.role)).toEqual(['ground', 'upper']);
    expect(plan.map((f) => f.name)).toEqual(['Floor 1', 'Floor 2']);
    // The ranges stack without overlap and the top runs to the build top.
    expect(plan[0].to + 1).toBe(plan[1].from);
    expect(plan[1].to).toBe(14);
  });

  it('structureFloorPlan is empty for a type with no authoritative plan (classic)', () => {
    expect(structureFloorPlan('classic', [11, 13, 9], {})).toEqual([]);
  });

  it('accepts both `decoration` and the legacy `theme` param key', () => {
    const viaDecoration = composeStructure('classic', from, house, { decoration: 'cozy' }, stubIntern());
    const viaTheme = composeStructure('classic', from, house, { theme: 'cozy' }, stubIntern());
    expect(viaDecoration.length).toBe(viaTheme.length);
  });

  it('throws an actionable error on an unknown type or decoration', () => {
    expect(() => composeStructure('castle', from, house, {}, stubIntern())).toThrow(/unknown structure type/);
    expect(() => composeStructure('classic', from, house, { decoration: 'nope' }, stubIntern())).toThrow(/unknown decoration/);
  });

  it('house owns its massing: a single roof, a connected stair core, no doubled roofs', () => {
    const big: [number, number, number] = [14, 20, 14];
    const ops = composeStructure(
      'classic',
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
    const classic = cat.structure.find((m) => m.id === 'classic');
    const names = (classic?.params ?? []).map((p) => p.name);
    expect(names).toEqual(expect.arrayContaining(['floors', 'balcony']));
    expect(names).not.toContain('decay'); // unit params belong to the decoration, not the UI
    // roof + basement + attic are promoted to their own module-category selects, so they no
    // longer appear as the house's own param controls (they stay in the build spec).
    expect(names).not.toContain('roof');
    expect(names).not.toContain('basement');
    expect(names).not.toContain('attic');
    const floors = classic?.params?.find((p) => p.name === 'floors');
    expect(floors).toMatchObject({ kind: 'int', label: 'Floors', min: 1, max: 4 });
  });

  it('every roof/basement/attic/room module is linked to a House member via appliesTo', () => {
    const cat = listModuleCatalog();
    expect(cat.roof.map((m) => m.id)).toEqual(expect.arrayContaining(['gable', 'hip', 'flat']));
    expect(cat.basement.map((m) => m.id)).toEqual(expect.arrayContaining(['cellar', 'crypt', 'cult-temple']));
    expect(cat.attic.map((m) => m.id)).toEqual(expect.arrayContaining(['storage', 'bedroom']));
    expect(cat.room.map((m) => m.id)).toEqual(expect.arrayContaining(['living', 'kitchen', 'library']));
    // Every roof/basement/attic/room module declares the structures it pairs with, and all
    // resolve to the House family — whether tagged by the group id ('house') or by specific
    // members (e.g. a gable applies to classic/cabin/l-shaped, but NOT the flat-roofed modern).
    for (const m of [...cat.roof, ...cat.basement, ...cat.attic, ...cat.room]) {
      expect(m.appliesTo, `${m.id} must declare appliesTo`).toBeTruthy();
      expect(moduleAppliesTo(m.appliesTo, 'classic', 'house'), `${m.id} must apply to a house`).toBe(true);
    }
  });

  it('structure modules declare their finalize passes (modular per-structure code gating)', () => {
    // Classic is a hearth home → stair cleanup + single-chimney; an unknown id contributes nothing.
    expect(structureFinalizers('classic')).toEqual(expect.arrayContaining(['stairs', 'chimney']));
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
    const onClassic = composeModule('roof', 'gable', from, to, { decoration: 'cozy' }, stubIntern(), 'classic');
    const onOther = composeModule('roof', 'gable', from, to, { decoration: 'cozy' }, stubIntern(), 'barn');
    // The classic house adds gable-end vents; a host with no integration adds nothing extra.
    expect(onClassic.length).toBeGreaterThan(generic.length);
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
    const guides = selectedGuides({ structureType: 'classic', roof: 'gable' });
    expect(guides).toContain('nbt/modules/roof/gable.md');
  });

  it('does NOT load a roof guide for a structure it does not apply to', () => {
    // gable applies to ['house']; for any other structure its guide must not ride along.
    const guides = selectedGuides({ structureType: 'barn', roof: 'gable' });
    expect(guides).not.toContain('nbt/modules/roof/gable.md');
  });

  it('lists the code-built archetypes as structure types, all in the House group', () => {
    const cat = listModuleCatalog();
    expect(cat.structure.map((m) => m.id)).toEqual(expect.arrayContaining(['classic', 'modern', 'cabin', 'l-shaped']));
    // The House group families every current structure type, and the catalog ships it.
    expect(cat.groups).toEqual(expect.arrayContaining([{ id: 'house', label: 'House' }]));
    for (const m of cat.structure) expect(m.group, `${m.id} must be in the house group`).toBe('house');
  });

  it('a roof guide loads only for the structures it fits', () => {
    // gable applies to the PITCHED houses (classic/cabin/l-shaped) — it loads for those,
    // but NOT for the flat-roofed modern (which excludes it).
    for (const structureType of ['classic', 'cabin', 'l-shaped']) {
      const guides = selectedGuides({ structureType, roof: 'gable' });
      expect(guides, structureType).toContain('nbt/modules/roof/gable.md');
    }
    expect(selectedGuides({ structureType: 'modern', roof: 'gable' })).not.toContain('nbt/modules/roof/gable.md');
    // The flat roof applies to the whole house group, including modern.
    expect(selectedGuides({ structureType: 'modern', roof: 'flat' })).toContain('nbt/modules/roof/flat.md');
  });

  it('an attic guide loads for the house and rides the conflict with the flat roof', () => {
    expect(selectedGuides({ structureType: 'classic', attic: 'bedroom' })).toContain('nbt/modules/attic/bedroom.md');
    expect(selectedGuides({ structureType: 'classic', attic: 'storage' })).toContain('nbt/modules/attic/storage.md');
  });

  it('the seeded archetypes (modern/cabin/l-shaped) compile from their preview', () => {
    // Their geometry is real code — guard that each composes + compiles without throwing.
    for (const id of ['modern', 'cabin', 'l-shaped']) {
      const a = buildModulePreview('structure', id);
      expect(a, id).not.toBeNull();
      expect(() => compileStructure(a!), id).not.toThrow();
    }
  });
});

describe('compose: exterior finishing styles', () => {
  const big: [number, number, number] = [12, 14, 10];

  it('applies a selected exterior over the structure, adding geometry', () => {
    for (const id of ['farmhouse', 'sakura', 'gothic']) {
      const plain = composeStructure('classic', from, big, { seed: 3 }, stubIntern());
      const styled = composeStructure('classic', from, big, { seed: 3, exterior: id }, stubIntern());
      // The exterior layers its signature volumes on top, so it never emits fewer ops.
      expect(styled.length, id).toBeGreaterThan(plain.length);
    }
  });

  it('rejects an unknown exterior id', () => {
    expect(() => composeStructure('classic', from, big, { exterior: 'nope' }, stubIntern())).toThrow(/unknown exterior/);
  });

  it('compiles each exterior on every pitched house via a template op', () => {
    const size: [number, number, number] = [13, 15, 11];
    const corner: [number, number, number] = [12, 14, 10];
    for (const host of ['classic', 'cabin', 'l-shaped']) {
      for (const exterior of ['farmhouse', 'sakura', 'gothic']) {
        expect(() =>
          compileStructure({
            DataVersion: 3955,
            size,
            palette: [{ Name: 'minecraft:air' }],
            ops: [{ op: 'template', name: host, from, to: corner, params: { exterior } }],
          }),
          `${host}+${exterior}`,
        ).not.toThrow();
      }
    }
  });

  it('previews + loads each exterior guide for the pitched houses, not modern', () => {
    for (const id of ['farmhouse', 'sakura', 'gothic']) {
      expect(buildModulePreview('exterior', id), id).not.toBeNull();
      expect(selectedGuides({ structureType: 'classic', exterior: id }), id).toContain(`nbt/modules/exterior/${id}.md`);
      expect(selectedGuides({ structureType: 'modern', exterior: id }), id).not.toContain(`nbt/modules/exterior/${id}.md`);
    }
  });
});

describe('module slots stay in lock-step with the catalog', () => {
  it('every single-select slot resolves to a catalog array (so the generic loops work)', () => {
    const cat = listModuleCatalog() as unknown as Record<string, unknown[]>;
    for (const slot of MODULE_SLOTS) {
      expect(Array.isArray(cat[slot.key]), `catalog.${slot.key}`).toBe(true);
    }
  });

  it('selectedGuides loads one guide per picked slot, gated by appliesTo', () => {
    const guides = selectedGuides({
      structureType: 'classic', decoration: 'cozy', roof: 'gable', basement: 'cellar', exterior: 'gothic',
    });
    expect(guides).toEqual(expect.arrayContaining([
      'nbt/modules/structure/classic.md',
      'nbt/modules/decoration/cozy.md',
      'nbt/modules/roof/gable.md',
      'nbt/modules/exterior/gothic.md',
    ]));
  });
});

describe('compose: house roof form + determinism', () => {
  it('the roof param forces the roof form (overriding the seeded pick)', () => {
    const big: [number, number, number] = [14, 20, 14];
    const base = { floors: 1, seed: 4 };
    const roofOf = (roof: string) => {
      const ops = composeStructure('classic', from, big, { ...base, roof }, stubIntern());
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
      composeStructure('classic', from, big, { ...base, roof }, stubIntern()).filter((o) => o.op === 'block').length;
    expect(blocks('gable')).toBe(blocks('hip') + 2);
  });

  it('delegates the below-grade level to the basement module (adds the cellar room)', () => {
    const big: [number, number, number] = [14, 22, 14];
    const base = { floors: 2, seed: 5 };
    const withCellar = composeStructure('classic', from, big, { ...base, basement: 'full' }, stubIntern());
    const noCellar = composeStructure('classic', from, big, { ...base, basement: 'none' }, stubIntern());
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
    const full = composeStructure('classic', from, big, { ...base, basement: 'full' }, stubIntern());
    const half = composeStructure('classic', from, big, { ...base, basement: 'half' }, stubIntern());
    // Same delegated cellar room; 'half' layers the high clerestory window band on top.
    expect(half.length).toBeGreaterThan(full.length);
  });

  it('house params are deterministic for the same box + params + seed', () => {
    const big: [number, number, number] = [12, 18, 12];
    const p = { floors: 2, basement: 'half', attic: 'finished', balcony: 'side', seed: 3 };
    const a = composeStructure('classic', from, big, p, stubIntern());
    const b = composeStructure('classic', from, big, p, stubIntern());
    expect(JSON.stringify(a)).toBe(JSON.stringify(b)); // byte-identical for a fixed seed
  });

  it('the seed varies the shell across runs (different windows/corners/roof), still a single roof', () => {
    const big: [number, number, number] = [14, 20, 14];
    const base = { floors: 2, basement: 'full', attic: 'storage', balcony: 'front' };
    const shapes = new Set<string>();
    for (let seed = 1; seed <= 16; seed++) {
      const ops = composeStructure('classic', from, big, { ...base, seed }, stubIntern());
      expect(ops.filter((o) => o.op === 'roof')).toHaveLength(1); // invariant holds for every seed
      shapes.add(JSON.stringify(ops));
    }
    expect(shapes.size).toBeGreaterThan(1); // not every run is the same shell
  });
});
