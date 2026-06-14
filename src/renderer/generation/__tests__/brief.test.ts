import { describe, expect, it } from 'vitest';
import type { GenerationCatalog } from '@/shared/types';
import {
  type BuildDetails,
  EMPTY_DETAILS,
  buildBoxSize,
  buildBrief,
  buildRoomPlan,
  buildSelection,
  buildSummary,
  derivedSize,
  effectiveSize,
  floorCount,
  floorRooms,
  formatElapsed,
  hasDetails,
  maxRoomsForStructure,
  previewOverheads,
  resolveDetailParams,
  roomsOnFloor,
} from '../brief';

/** A minimal catalog: a storeyed `house` (floors + attic params), a non-storeyed
 *  structure (no `floors` param), plus one decoration/roof/basement and two rooms. */
const catalog: GenerationCatalog = {
  structure: [
    {
      id: 'house', label: 'House', category: 'structure', description: '', hasPreview: true, group: 'house',
      params: [
        { name: 'floors', kind: 'int', label: 'Floors', default: 1, min: 1, max: 4 },
        { name: 'attic', kind: 'enum', label: 'Attic', default: 'none', options: [
          { value: 'none', label: 'None' }, { value: 'loft', label: 'Loft' },
        ] },
      ],
    },
    // A structure with no `floors` param, to exercise the non-storeyed branches.
    { id: 'monument', label: 'Monument', category: 'structure', description: '', hasPreview: true, params: [] },
  ],
  decoration: [{ id: 'cozy', label: 'Cozy', category: 'decoration', description: '', hasPreview: true }],
  roof: [{ id: 'gable', label: 'Gable', category: 'roof', description: '', hasPreview: true, appliesTo: ['house'] }],
  basement: [{ id: 'cellar', label: 'Cellar', category: 'basement', description: '', hasPreview: true }],
  attic: [{ id: 'loft', label: 'Loft', category: 'attic', description: '', hasPreview: false, appliesTo: ['house'], incompatibleWith: ['flat'] }],
  room: [
    { id: 'living', label: 'Living Room', category: 'room', description: '', hasPreview: false },
    { id: 'kitchen', label: 'Kitchen', category: 'room', description: '', hasPreview: false },
  ],
  // `modern` matches a real SURROUND_MARGINS entry so the box-expansion math is exercised.
  surroundings: [
    { id: 'modern', label: 'Modern', category: 'surroundings', description: '', hasPreview: true, appliesTo: ['house'] },
  ],
  groups: [{ id: 'house', label: 'House' }],
};

const houseModule = catalog.structure[0];
const noFloorsModule = catalog.structure[1];

/** A Details object built on the empty base. */
const details = (over: Partial<BuildDetails>): BuildDetails => ({ ...EMPTY_DETAILS, ...over });

describe('formatElapsed', () => {
  it('formats milliseconds as m:ss with zero-padded seconds', () => {
    expect(formatElapsed(0)).toBe('0:00');
    expect(formatElapsed(5_000)).toBe('0:05');
    expect(formatElapsed(125_000)).toBe('2:05');
  });
});

describe('floorCount', () => {
  it('reads the floors param, defaulting when unset', () => {
    expect(floorCount(houseModule, {})).toBe(1);
    expect(floorCount(houseModule, { floors: 3 })).toBe(3);
  });
  it('is 0 for a structure with no floors param', () => {
    expect(floorCount(noFloorsModule, {})).toBe(0);
    expect(floorCount(undefined, {})).toBe(0);
  });
});

describe('floorRooms', () => {
  it('always returns a 2-slot array padded with empties', () => {
    const d = details({ rooms: [['living']] });
    expect(floorRooms(d, 0)).toEqual(['living', '']);
    expect(floorRooms(d, 5)).toEqual(['', '']);
  });
});

describe('roomsOnFloor', () => {
  it('returns the floor\'s assigned ids, variable-length, empties stripped', () => {
    const d = details({ rooms: [['living', '', 'kitchen']] });
    expect(roomsOnFloor(d, 0)).toEqual(['living', 'kitchen']);
    expect(roomsOnFloor(d, 5)).toEqual([]);
  });
});

describe('maxRoomsForStructure', () => {
  it('uses the structure\'s declared cap', () => {
    expect(maxRoomsForStructure({ ...houseModule, maxRoomsPerFloor: 3 })).toBe(3);
  });
  it('falls back to the generic default (2) when undeclared', () => {
    expect(maxRoomsForStructure(houseModule)).toBe(2);
    expect(maxRoomsForStructure(undefined)).toBe(2);
  });
});

describe('resolveDetailParams', () => {
  it('merges the user picks over each param default', () => {
    expect(resolveDetailParams(details({ params: { floors: 2 } }), houseModule)).toEqual({
      floors: 2,
      attic: 'none',
    });
  });
  it('is empty for no structure', () => {
    expect(resolveDetailParams(EMPTY_DETAILS, undefined)).toEqual({});
  });
});

describe('derivedSize', () => {
  it('uses a tall default for a non-storeyed structure', () => {
    expect(derivedSize(noFloorsModule, {})).toEqual({ w: 9, d: 9, h: 16 });
  });
  it('grows the height with floors, basement, and attic', () => {
    const base = derivedSize(houseModule, { floors: 1 });
    const tall = derivedSize(houseModule, { floors: 3, basement: 'cellar', attic: 'loft' });
    expect(tall.h).toBeGreaterThan(base.h);
  });
});

describe('effectiveSize', () => {
  it('prefers an explicit size override', () => {
    const d = details({ structureType: 'house', size: { w: 20, d: 21, h: 22 } });
    expect(effectiveSize(d, houseModule)).toEqual({ w: 20, d: 21, h: 22 });
  });
  it('folds the selected basement back into the derived size', () => {
    const withBasement = effectiveSize(details({ structureType: 'house', basement: 'cellar' }), houseModule);
    const without = effectiveSize(details({ structureType: 'house' }), houseModule);
    expect(withBasement.h).toBeGreaterThan(without.h);
  });
  it('a FLAT roof pick drops the pitch reserve from the derived height', () => {
    const flat = effectiveSize(details({ structureType: 'house', roof: 'flat', params: { floors: 2 } }), houseModule);
    const pitched = effectiveSize(details({ structureType: 'house', roof: 'gable', params: { floors: 2 } }), houseModule);
    // 11×11 footprint: pitched reserves floor(11/2)+1 = 6; flat needs only a deck + parapet (2).
    expect(pitched.h - flat.h).toBe(4);
  });
  it('derives the total height from explicit per-floor heights + the roof-aware overhead', () => {
    const d = details({ structureType: 'house', roof: 'flat', params: { floors: 2 }, floorHeights: [7, 4] });
    expect(effectiveSize(d, houseModule).h).toBe(7 + 4 + 2); // storeys + flat deck/parapet
  });
  it('keeps SHELL semantics — a surroundings pick never inflates the user-facing size', () => {
    const d = details({ structureType: 'house', surroundings: 'modern', size: { w: 15, d: 13, h: 13 } });
    expect(effectiveSize(d, houseModule)).toEqual({ w: 15, d: 13, h: 13 });
  });
});

describe('previewOverheads', () => {
  it('zeroes the basement/attic bands when neither slot is picked', () => {
    const ov = previewOverheads(details({ structureType: 'house' }), houseModule);
    expect(ov.basement).toBe(0);
    expect(ov.attic).toBe(0);
    expect(ov.roof).toBeGreaterThan(0); // a pitched reserve is always paid
  });
  it('a picked attic is the TOPMOST band — it engulfs the whole roof zone', () => {
    const d = details({ structureType: 'house', basement: 'cellar', attic: 'loft' });
    const ov = previewOverheads(d, houseModule);
    expect(ov.basement).toBe(5);
    // 11×11 derived footprint: pitched reserve floor(11/2)+1 = 6; attic band = 6 + 2.
    expect(ov.attic).toBe(8);
    expect(ov.roof).toBe(0); // nothing sits above the attic
  });
  it('honours the user-sized basement/attic bands', () => {
    const d = details({ structureType: 'house', basement: 'cellar', attic: 'loft', basementHeights: [7], atticH: 5 });
    const ov = previewOverheads(d, houseModule);
    expect(ov.basement).toBe(7);
    expect(ov.basementLevels).toEqual([7]);
    expect(ov.attic).toBe(5);
    expect(ov.roof).toBe(0);
  });
  it('sums the per-level depths for a multi-level basement', () => {
    const d = details({ structureType: 'house', basement: 'cellar', basementHeights: [6, 7] });
    const ov = previewOverheads(d, houseModule);
    expect(ov.basement).toBe(13);
    expect(ov.basementLevels).toEqual([6, 7]);
  });
  it('custom bands drive the per-floor total height', () => {
    const base = details({ structureType: 'house', params: { floors: 2 }, basement: 'cellar', floorHeights: [5, 5] });
    const sized = { ...base, basementHeights: [8] };
    expect(effectiveSize(sized, houseModule).h - effectiveSize(base, houseModule).h).toBe(3);
  });
});

describe('buildBoxSize', () => {
  it('is the effective size when no surroundings ring is picked', () => {
    const d = details({ structureType: 'house', size: { w: 15, d: 13, h: 13 } });
    expect(buildBoxSize(d, houseModule)).toEqual({ w: 15, d: 13, h: 13 });
  });
  it('expands the shell footprint by the ring margins (modern: +8 W, +12 D), height untouched', () => {
    const d = details({ structureType: 'house', surroundings: 'modern', size: { w: 15, d: 13, h: 13 } });
    expect(buildBoxSize(d, houseModule)).toEqual({ w: 23, d: 25, h: 13 });
  });
  it('grows W/D to fit an enlarged basement footprint (the house stays its size, centered)', () => {
    const d = details({ structureType: 'house', basement: 'cellar', basementArea: { w: 21, d: 9 }, size: { w: 15, d: 13, h: 13 } });
    const box = buildBoxSize(d, houseModule);
    expect(box.w).toBe(21); // grew to the basement width
    expect(box.d).toBe(13); // basement depth 9 < house 13 → unchanged
  });
});

describe('buildBrief', () => {
  it('is empty when no structure is picked', () => {
    expect(buildBrief(EMPTY_DETAILS, catalog)).toBe('');
  });
  it('names the structure, decoration, roof, basement, and forbids templates', () => {
    const out = buildBrief(
      details({ structureType: 'house', decoration: 'cozy', roof: 'gable', basement: 'cellar' }),
      catalog,
    );
    expect(out).toContain('Build a House');
    expect(out).toContain('"Cozy"');
    expect(out).toContain('Gable roof');
    expect(out).toContain('Cellar');
    expect(out).toContain('Do NOT use a `template` op');
  });
  it('emits the storey-height line whenever per-floor heights are set — EQUAL heights too', () => {
    const out = buildBrief(
      details({ structureType: 'house', params: { floors: 2 }, floorHeights: [5, 5] }),
      catalog,
    );
    expect(out).toContain('Storey heights');
    expect(out).toContain('floor 1 = 5 blocks (slab at y=0)');
    expect(out).toContain('floor 2 = 5 blocks (slab at y=5)');
    expect(out).toContain('respect these heights exactly');
  });
  it('omits the storey-height line in total-height mode (floorHeights null)', () => {
    const out = buildBrief(details({ structureType: 'house', params: { floors: 2 } }), catalog);
    expect(out).not.toContain('Storey heights');
  });
  it('with a surroundings pick, distinguishes the building SHELL from the larger box', () => {
    const out = buildBrief(
      details({ structureType: 'house', surroundings: 'modern', size: { w: 15, d: 13, h: 13 } }),
      catalog,
    );
    expect(out).toContain('building shell of roughly 15×13×13');
    expect(out).toContain('inside a 23×13×25 box');
    expect(out).toContain('Surroundings: a "Modern" yard');
    expect(out).toContain('OPEN-AIR');
  });
});

describe('buildRoomPlan', () => {
  it('lists only floors that have rooms assigned, one line per room', () => {
    const d = details({ structureType: 'house', params: { floors: 2 }, rooms: [['living', 'kitchen'], []] });
    const out = buildRoomPlan(d, catalog);
    expect(out).toContain('Floor 1 · Living Room');
    expect(out).toContain('Floor 1 · Kitchen');
    expect(out).not.toContain('Floor 2');
  });
  it('is empty for a non-storeyed structure', () => {
    expect(buildRoomPlan(details({ structureType: 'monument' }), catalog)).toBe('');
  });
  it('scales the tier + preset to the room area', () => {
    // A room with snug + grand presets; pick by the build size.
    const withPresets: GenerationCatalog = {
      ...catalog,
      room: [
        {
          id: 'living', label: 'Living Room', category: 'room', description: '', hasPreview: false,
          presets: [
            { id: 'living-snug', label: 'Sitting nook', scale: 'snug', summary: 'small', furnishings: ['a small hearth'] },
            { id: 'living-grand', label: 'Great room', scale: 'grand', summary: 'big', furnishings: ['two zones'] },
          ],
        },
      ],
    };
    const big = buildRoomPlan(
      details({ structureType: 'house', size: { w: 16, d: 16, h: 12 }, rooms: [['living']] }),
      withPresets,
    );
    expect(big).toContain('grand space');
    expect(big).toContain('Great room');
    expect(big).toContain('two zones');

    const small = buildRoomPlan(
      details({ structureType: 'house', size: { w: 6, d: 6, h: 10 }, rooms: [['living']] }),
      withPresets,
    );
    expect(small).toContain('snug space');
    expect(small).toContain('Sitting nook');
  });
});

describe('buildSummary', () => {
  it('returns undefined when no structure is picked', () => {
    expect(buildSummary(EMPTY_DETAILS, catalog)).toBeUndefined();
  });
  it('produces a label card with per-floor rooms', () => {
    const d = details({ structureType: 'house', decoration: 'cozy', params: { floors: 2 }, rooms: [['living'], ['kitchen']] });
    const card = buildSummary(d, catalog)!;
    expect(card.structure).toBe('House');
    expect(card.decoration).toBe('Cozy');
    expect(card.floors).toEqual([
      { name: 'Floor 1', rooms: ['Living Room'] },
      { name: 'Floor 2', rooms: ['Kitchen'] },
    ]);
  });
  it('carries the structure family group + per-floor storey heights', () => {
    const d = details({ structureType: 'house', params: { floors: 2 }, floorHeights: [6, 5] });
    const card = buildSummary(d, catalog)!;
    expect(card.group).toBe('House'); // disambiguates a House "Classic" from a Tower "Classic"
    expect(card.floors).toEqual([
      { name: 'Floor 1', height: 6, rooms: [] },
      { name: 'Floor 2', height: 5, rooms: [] },
    ]);
  });
});

describe('buildSelection', () => {
  it('omits empty fields and dedupes rooms across floors', () => {
    const d = details({ structureType: 'house', rooms: [['living', ''], ['living', 'kitchen']] });
    // The effective build size is threaded along (for shell-seeded structures).
    expect(buildSelection(d, catalog)).toMatchObject({ structureType: 'house', rooms: ['living', 'kitchen'] });
    expect(buildSelection(d, catalog).size).toHaveLength(3);
  });
  it('omits rooms entirely when none are set', () => {
    expect(buildSelection(details({ structureType: 'house' }), catalog).rooms).toBeUndefined();
  });
  it('sends the build size only alongside a structure', () => {
    expect(buildSelection(details({ structureType: 'house' }), catalog).size).toHaveLength(3);
    // No structure picked → size is moot and must not drag a shell into a free-form build.
    expect(buildSelection(details({ structureType: '' }), catalog).size).toBeUndefined();
  });
  it('threads the EXPANDED box (shell + surroundings margins) as the selection size', () => {
    const d = details({ structureType: 'house', surroundings: 'modern', size: { w: 15, d: 13, h: 13 } });
    const sel = buildSelection(d, catalog);
    expect(sel.surroundings).toBe('modern');
    expect(sel.size).toEqual([23, 13, 25]); // [W, H, D] — the shell seed compiles at this box
  });
  it('threads the per-floor heights only alongside a structure', () => {
    const d = details({ structureType: 'house', params: { floors: 2 }, floorHeights: [7, 4] });
    expect(buildSelection(d, catalog).floorHeights).toEqual([7, 4]);
    expect(buildSelection(details({ structureType: 'house' }), catalog).floorHeights).toBeUndefined();
    expect(buildSelection(details({ floorHeights: [7, 4] }), catalog).floorHeights).toBeUndefined();
  });
});

describe('hasDetails', () => {
  it('is false for the empty state and true once anything is picked', () => {
    expect(hasDetails(EMPTY_DETAILS)).toBe(false);
    expect(hasDetails(details({ decoration: 'cozy' }))).toBe(true);
    expect(hasDetails(details({ rooms: [['living']] }))).toBe(true);
  });
});
