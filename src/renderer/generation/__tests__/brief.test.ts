import { describe, expect, it } from 'vitest';
import type { GenerationCatalog } from '@/shared/types';
import {
  type BuildDetails,
  EMPTY_DETAILS,
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
  resolveDetailParams,
  roomsOnFloor,
} from '../brief';

/** A minimal catalog: a storeyed `house` (floors + attic params), a non-storeyed
 *  structure (no `floors` param), plus one decoration/roof/basement and two rooms. */
const catalog: GenerationCatalog = {
  structure: [
    {
      id: 'house', label: 'House', category: 'structure', description: '', hasPreview: true,
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
  exterior: [{ id: 'farmhouse', label: 'Farmhouse', category: 'exterior', description: '', hasPreview: true, appliesTo: ['house'] }],
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
});

describe('hasDetails', () => {
  it('is false for the empty state and true once anything is picked', () => {
    expect(hasDetails(EMPTY_DETAILS)).toBe(false);
    expect(hasDetails(details({ decoration: 'cozy' }))).toBe(true);
    expect(hasDetails(details({ rooms: [['living']] }))).toBe(true);
  });
});
