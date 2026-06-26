import { describe, expect, it } from 'vitest';
import { composeStructure, composeModule, composeModulePreview, isKnownStructure, knownStructureNames, type Intern } from '../compose';
import { buildModulePreview, listModuleCatalog, selectedGuides, structureFinalizers, structureFloorPlan } from '../index';
import { moduleAppliesTo } from '@/shared/domain/applies-to';
import { MODULE_SLOTS } from '@/shared/domain/module-slots';
import { compileStructure } from '../../authoring';
import { resolveBlocks } from '../../authoring/ops';

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
    // The modern villa, sakura cottage and gothic manor are all code-built structure types now.
    expect(isKnownStructure('modern')).toBe(true);
    expect(isKnownStructure('sakura')).toBe(true);
    expect(isKnownStructure('gothic')).toBe(true);
    expect(isKnownStructure('cabin')).toBe(false); // retired
    expect(isKnownStructure('l-shaped')).toBe(false); // retired
    expect(isKnownStructure('house')).toBe(false); // 'house' is now the GROUP id, not a structure type
    expect(isKnownStructure('basement')).toBe(false); // basement is its own category, not a structure type
    expect(isKnownStructure('abandoned_house')).toBe(false); // alias retired
    expect(isKnownStructure('castle')).toBe(false);
    expect(knownStructureNames()).toEqual(['classic', 'modern', 'farmhouse', 'sakura', 'gothic', 'tower-classic', 'haunted-tower']);
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

  it('structureFloorPlan covers EVERY storeyed type now (classic included) — and is empty for unknowns', () => {
    // classic gained an authoritative plan with the shared plan()/floors() pattern; the
    // ROOF band is appended last so the roof reads as its own level (not lumped with the
    // storeys), and its `to` reaches the box top.
    const classic = structureFloorPlan('classic', [11, 13, 9], { floors: 2 });
    expect(classic.map((f) => f.role)).toEqual(['ground', 'upper', 'roof']);
    expect(classic[classic.length - 1].to).toBe(12); // the roof band ends at the box top (y1)
    // A basement pick prepends the below-grade level.
    const withCellar = structureFloorPlan('classic', [11, 18, 9], { floors: 2, basement: 'cellar' });
    expect(withCellar.map((f) => f.role)).toEqual(['basement', 'ground', 'upper', 'roof']);
    // MULTI-LEVEL basement: the per-level heights MUST drive the plan (one basement band per
    // level) so `grade` (the first non-basement floor's `from`) sits ABOVE the whole basement.
    // The bug: omitting `basementHeights` reserved a single default level → grade far too low →
    // the real basement levels read as above-grade storeys → stairwell pass thrashed (the
    // "escada estourando a parede / 2 lances por andar" defect).
    const multi = structureFloorPlan('classic', [20, 48, 16], { floors: 2, basement: 'cellar', basementHeights: [7, 7, 7, 7] });
    expect(multi.filter((f) => f.role === 'basement')).toHaveLength(4);
    const grade = multi.find((f) => f.role !== 'basement')!.from;
    expect(grade).toBe(28); // 4×7 below grade (footprint == house → no extra ceiling layer)
    // A CENTRAL-basement type (gothic owns no basement param) now reports the basement +
    // storeys + roof too — not everything-above-the-cellar as one "roof" band.
    const goth = structureFloorPlan('gothic', [16, 24, 14], { floors: 2, basement: 'crypt' });
    expect(goth.map((f) => f.role)).toEqual(['basement', 'ground', 'upper', 'roof']);
    expect(goth[0].from).toBe(0); // basement starts at the box bottom
    // The sakura's visible stone base reads as its basement-grade level.
    const sak = structureFloorPlan('sakura', [13, 14, 11], { floors: 2 });
    expect(sak[0].role).toBe('basement');
    expect(structureFloorPlan('castle', [9, 9, 9], {})).toEqual([]);
  });

  it('haunted-tower basement descent ladder surfaces in the USABLE interior, not inside a wall', () => {
    // The bug: the central descent ladder was placed at the raw `box+1` corner, which for the
    // haunted tower (a flared plinth insets the shaft one cell) is SOLID WALL — so the ladder
    // came out buried in the base, reachable only by breaking blocks ("escada dentro da parede").
    const size: [number, number, number] = [15, 40, 15];
    const corner: [number, number, number] = [14, 39, 14];
    const params = { decoration: 'cursed', floors: 4, basement: 'cellar' };
    const { blocks, palette } = resolveBlocks({
      DataVersion: 3955, size, palette: [{ Name: 'minecraft:air' }],
      ops: [{ op: 'template', name: 'haunted-tower', from, to: corner, params }],
    });
    const nameAt = new Map<string, string>();
    for (const b of blocks) nameAt.set(`${b.pos[0]},${b.pos[1]},${b.pos[2]}`, palette[b.state]?.Name ?? '');
    const isLadder = (n?: string): boolean => !!n && n.endsWith('ladder');

    const grade = structureFloorPlan('haunted-tower', size, params).find((f) => f.role !== 'basement')!.from;
    // The descent is the ladder column running BELOW grade.
    const descent = blocks.filter((b) => isLadder(palette[b.state]?.Name) && b.pos[1] < grade);
    expect(descent.length).toBeGreaterThan(0);
    const lx = descent[0].pos[0], lz = descent[0].pos[2];
    expect(descent.every((b) => b.pos[0] === lx && b.pos[2] === lz)).toBe(true); // one clean column
    // Strictly INSIDE the tier-0 wall ring — never on the buried box+1 corner.
    expect(lx).toBeGreaterThan(1);
    expect(lz).toBeLessThan(size[2] - 2);

    // It surfaces into a REAL room: open (non-solid) cells at the ground walk level, flooded
    // from the ladder's step-off cell, reach a sizable area — not a 1-cell pocket in the wall.
    const walkY = grade + 1;
    const open = (x: number, z: number): boolean => {
      if (x < 0 || z < 0 || x >= size[0] || z >= size[2]) return false;
      const n = nameAt.get(`${x},${walkY},${z}`);
      return !n || isLadder(n); // absent (air) or a passable ladder cell
    };
    const seen = new Set<string>();
    const stack: [number, number][] = [[lx, lz - 1]]; // step off toward -z (the ladder faces north)
    while (stack.length) {
      const [x, z] = stack.pop() as [number, number];
      const k = `${x},${z}`;
      if (seen.has(k) || !open(x, z)) continue;
      seen.add(k);
      stack.push([x + 1, z], [x - 1, z], [x, z + 1], [x, z - 1]);
    }
    expect(seen.size).toBeGreaterThan(10); // a walkable room, not a buried niche
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
      { floors: 2, basement: 'cellar', attic: 'storage', balcony: 'front' },
      stubIntern(),
    );
    const roofs = ops.filter((o) => o.op === 'roof');
    const stairs = ops.filter((o) => o.op === 'stairs');
    expect(roofs).toHaveLength(1); // exactly one roof — never the doubled-roof bug
    // ground→floor2 = 1 above-grade flight (the attic is reached by a ladder, so a stair
    // flight never pierces the roof; the basement is reached by the central descent ladder).
    expect(stairs.length).toBeGreaterThanOrEqual(1);
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
    // members (e.g. a gable applies to classic/farmhouse/sakura/gothic, but NOT the flat modern).
    for (const m of [...cat.roof, ...cat.basement, ...cat.attic, ...cat.room]) {
      expect(m.appliesTo, `${m.id} must declare appliesTo`).toBeTruthy();
      expect(moduleAppliesTo(m.appliesTo, 'classic', 'house'), `${m.id} must apply to a house`).toBe(true);
    }
  });

  it('structure modules declare their finalize passes (modular per-structure code gating)', () => {
    // Classic is a hearth home → the single-chimney fix; an unknown id contributes nothing.
    expect(structureFinalizers('classic')).toEqual(['chimney']);
    expect(structureFinalizers('modern')).toEqual([]); // no chimney on the villa
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

  it('the gothic shell keeps an entrance door + a ground floor (regression: the central tower bay must not bury the door)', () => {
    const W = 29, H = 17, D = 18;
    const resolved = resolveBlocks({
      DataVersion: 3955,
      size: [W, H, D],
      palette: [{ Name: 'minecraft:air' }],
      ops: [{ op: 'template', name: 'gothic', from: [0, 0, 0], to: [W - 1, H - 1, D - 1], params: { decoration: 'gothic', floors: 2 } }],
    });
    const doors = resolved.blocks.filter((b) => resolved.palette[b.state]?.Name?.includes('_door'));
    expect(doors.length).toBeGreaterThanOrEqual(2); // a full door = lower + upper half
    const ground = resolved.blocks.filter((b) => b.pos[1] === 0 && resolved.palette[b.state]?.Name !== 'minecraft:air');
    expect(ground.length).toBeGreaterThan(W * D * 0.5); // a real ground-floor slab, not a sparse base
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

  it('lists the code-built archetypes as structure types, grouped by family', () => {
    const cat = listModuleCatalog();
    expect(cat.structure.map((m) => m.id)).toEqual(
      expect.arrayContaining(['classic', 'modern', 'farmhouse', 'sakura', 'gothic', 'tower-classic']),
    );
    // The catalog ships the registered families; each type names a registered group.
    expect(cat.groups).toEqual(expect.arrayContaining([
      { id: 'house', label: 'House' },
      { id: 'tower', label: 'Tower' },
    ]));
    const groupIds = new Set(cat.groups.map((g) => g.id));
    for (const m of cat.structure) {
      expect(groupIds.has(m.group ?? ''), `${m.id} must name a registered group`).toBe(true);
    }
    // The keep belongs to the tower family.
    expect(cat.structure.find((m) => m.id === 'tower-classic')?.group).toBe('tower');
  });

  it('a roof guide loads only for the structures it fits', () => {
    // gable applies to every house type — including modern (which defaults to flat but can
    // take a low pitch) — so its guide loads when picked.
    for (const structureType of ['classic', 'farmhouse', 'sakura', 'gothic', 'modern']) {
      const guides = selectedGuides({ structureType, roof: 'gable' });
      expect(guides, structureType).toContain('nbt/modules/roof/gable.md');
    }
    // hip is offered on the pitched houses + modern, but NOT sakura (gable-identity).
    expect(selectedGuides({ structureType: 'sakura', roof: 'hip' })).not.toContain('nbt/modules/roof/hip.md');
    // The flat roof applies to the whole house group, including modern.
    expect(selectedGuides({ structureType: 'modern', roof: 'flat' })).toContain('nbt/modules/roof/flat.md');
  });

  it('an attic guide loads for the house and rides the conflict with the flat roof', () => {
    expect(selectedGuides({ structureType: 'classic', attic: 'bedroom' })).toContain('nbt/modules/attic/bedroom.md');
    expect(selectedGuides({ structureType: 'classic', attic: 'storage' })).toContain('nbt/modules/attic/storage.md');
  });

  it('the seeded archetypes (modern/farmhouse/sakura/gothic) compile from their preview', () => {
    // Their geometry is real code — guard that each composes + compiles without throwing.
    for (const id of ['modern', 'farmhouse', 'sakura', 'gothic']) {
      const a = buildModulePreview('structure', id);
      expect(a, id).not.toBeNull();
      expect(() => compileStructure(a!), id).not.toThrow();
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
      structureType: 'classic', decoration: 'cozy', roof: 'gable', basement: 'cellar',
    });
    expect(guides).toEqual(expect.arrayContaining([
      'nbt/modules/structure/classic.md',
      'nbt/modules/decoration/cozy.md',
      'nbt/modules/roof/gable.md',
      'nbt/modules/basement/cellar.md',
    ]));
  });
});

describe('compose: explicit per-floor storey heights (the shared ladder)', () => {
  const big: [number, number, number] = [13, 19, 13]; // a 14×20×14 box

  it('classic lays its upper slab at EXACTLY the requested ground-floor height', () => {
    const ops = composeStructure('classic', from, big, { floors: 2, seed: 3, floorHeights: [7, 4] }, stubIntern());
    // The storey slab fill for floor 2 sits at y = 7 (the ground storey's slab-to-slab height).
    const slabAt = (y: number) =>
      ops.some((o) => o.op === 'fill' && o.from[1] === y && o.to[1] === y && o.from[0] === 1 && o.to[0] === 12);
    expect(slabAt(7)).toBe(true);
    // The uniform default for this box would land it at 6 — prove the heights moved it.
    const uniform = composeStructure('classic', from, big, { floors: 2, seed: 3 }, stubIntern());
    expect(uniform.some((o) => o.op === 'fill' && o.from[1] === 6 && o.to[1] === 6 && o.from[0] === 1)).toBe(true);
  });

  it('keeps the build deterministic and the single-roof invariant under explicit heights', () => {
    const p = { floors: 2, seed: 3, floorHeights: [7, 4] };
    const a = composeStructure('classic', from, big, p, stubIntern());
    const b = composeStructure('classic', from, big, p, stubIntern());
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
    expect(a.filter((o) => o.op === 'roof')).toHaveLength(1);
  });

  it('structureFloorPlan honours floorHeights for the modern villa', () => {
    const plan = structureFloorPlan('modern', [36, 15, 20], { floorHeights: [7, 4] });
    expect(plan.map((f) => [f.from, f.to])).toEqual([
      [0, 6], // ground storey = 7 cells, exactly as asked
      [7, 14],
    ]);
  });

  it('structureFloorPlan honours floorHeights for the farmhouse', () => {
    const plan = structureFloorPlan('farmhouse', [17, 16, 13], { floorHeights: [6, 4] });
    expect(plan[0]).toMatchObject({ from: 0, to: 5 });
    expect(plan[1].from).toBe(6);
  });

  it('every seeded archetype compiles with explicit floorHeights (the shell-seed path)', () => {
    for (const id of ['modern', 'farmhouse', 'sakura', 'gothic']) {
      expect(() =>
        compileStructure({
          DataVersion: 3955,
          size: [17, 18, 15],
          palette: [{ Name: 'minecraft:air' }],
          ops: [{
            op: 'template', name: id, from: [0, 0, 0], to: [16, 17, 14],
            params: { floors: 2, floorHeights: [7, 4] },
          }],
        }), id,
      ).not.toThrow();
    }
  });

  it('ignores an unusable floorHeights value instead of throwing', () => {
    expect(() =>
      composeStructure('classic', from, big, { floors: 2, floorHeights: 'tall' }, stubIntern()),
    ).not.toThrow();
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

  it('delegates the below-grade level to the SELECTED basement module (adds the vault room)', () => {
    const big: [number, number, number] = [14, 22, 14];
    const base = { floors: 2, seed: 5 };
    // The Details "Basement" pick rides in as the MODULE id (cellar/crypt/cult-temple) —
    // the same namespace the other archetypes' central path uses — and classic delegates
    // the vault to exactly that module (the fix for "picked Cellar, got no basement"
    // because the param's old none/full/half enum rejected the module id).
    const withCellar = composeStructure('classic', from, big, { ...base, basement: 'cellar' }, stubIntern());
    const noCellar = composeStructure('classic', from, big, { ...base, basement: 'none' }, stubIntern());
    // The delegated cellar adds a sealed room (floor/ceiling + perimeter walls + a grid of
    // lit support pillars) the no-basement build doesn't have, while the single-roof and
    // stair-core invariants still hold.
    expect(withCellar.length).toBeGreaterThan(noCellar.length);
    expect(withCellar.filter((o) => o.op === 'roof')).toHaveLength(1);
    expect(withCellar.some((o) => o.op === 'stairs')).toBe(true);
  });

  it('honours a different basement MODULE pick (crypt) for classic', () => {
    const big: [number, number, number] = [14, 22, 14];
    const base = { floors: 2, seed: 5 };
    // A crypt is a different module with its own geometry, so it must delegate distinctly
    // from the cellar (not silently fall back to one fixed vault).
    const crypt = composeStructure('classic', from, big, { ...base, basement: 'crypt' }, stubIntern());
    const cellar = composeStructure('classic', from, big, { ...base, basement: 'cellar' }, stubIntern());
    expect(crypt.length).toBeGreaterThan(0);
    expect(cellar.length).toBeGreaterThan(0);
    expect(crypt.length).not.toBe(cellar.length);
  });

  it('composes a basement CENTRALLY for a seeded archetype that has no basement param (gothic)', () => {
    // gothic declares no `basement` param, so composeStructure reserves the bottom of the
    // box for the SELECTED basement module and ladders it to the ground floor — the fix
    // for "I picked a crypt but the locked gothic shell built none".
    const big: [number, number, number] = [16, 22, 14];
    const base = { decoration: 'gothic', floors: 2, seed: 5 };
    const withCrypt = composeStructure('gothic', from, big, { ...base, basement: 'crypt' }, stubIntern());
    const noCrypt = composeStructure('gothic', from, big, { ...base, basement: 'none' }, stubIntern());
    // The vault + its descent ladder add ops the no-basement build doesn't have.
    expect(withCrypt.length).toBeGreaterThan(noCrypt.length);
    // The chosen module (crypt) composes differently from another (cellar) — proves the
    // SELECTED id is built, not a hardcoded one.
    const withCellar = composeStructure('gothic', from, big, { ...base, basement: 'cellar' }, stubIntern());
    expect(JSON.stringify(withCrypt)).not.toBe(JSON.stringify(withCellar));
  });

  it('house params are deterministic for the same box + params + seed', () => {
    const big: [number, number, number] = [12, 18, 12];
    const p = { floors: 2, basement: 'cellar', attic: 'bedroom', balcony: 'side', seed: 3 };
    const a = composeStructure('classic', from, big, p, stubIntern());
    const b = composeStructure('classic', from, big, p, stubIntern());
    expect(JSON.stringify(a)).toBe(JSON.stringify(b)); // byte-identical for a fixed seed
  });

  it('the seed varies the shell across runs (different windows/corners/roof), still a single roof', () => {
    const big: [number, number, number] = [14, 20, 14];
    const base = { floors: 2, basement: 'cellar', attic: 'storage', balcony: 'front' };
    const shapes = new Set<string>();
    for (let seed = 1; seed <= 16; seed++) {
      const ops = composeStructure('classic', from, big, { ...base, seed }, stubIntern());
      expect(ops.filter((o) => o.op === 'roof')).toHaveLength(1); // invariant holds for every seed
      shapes.add(JSON.stringify(ops));
    }
    expect(shapes.size).toBeGreaterThan(1); // not every run is the same shell
  });
});
