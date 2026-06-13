import { describe, expect, it } from 'vitest';
import { EMPTY_DETAILS, MIN_FLOOR_H, ROOMS_PER_FLOOR, type BuildDetails } from '../brief';
import {
  SIZE_MAX,
  SIZE_MIN,
  addRoom,
  assignRoom,
  removeRoomAt,
  setBandHeight,
  setBasementArea,
  setBasementLevelHeight,
  setBasementLevels,
  setDetailField,
  setDetailParam,
  setDetailSize,
  setFloorHeight,
  setSurroundSize,
} from '../details';

const details = (over: Partial<BuildDetails>): BuildDetails => ({ ...EMPTY_DETAILS, ...over });

describe('setDetailField', () => {
  it('switching structure clears params, size, heights, roof, basement and rooms', () => {
    const d = details({
      structureType: 'house',
      params: { floors: 2 },
      size: { w: 10, d: 10, h: 12 },
      floorHeights: [5, 6],
      roof: 'gable',
      basement: 'cellar',
      rooms: [['kitchen', '']],
    });
    const next = setDetailField(d, 'structureType', 'tower');
    expect(next).toMatchObject({
      structureType: 'tower',
      params: {},
      size: null,
      floorHeights: null,
      roof: '',
      basement: '',
      rooms: [],
    });
  });

  it('pairs the decoration the chosen module DECLARES (registry-driven, no hardcoded map)', () => {
    const modernModule = {
      id: 'modern', label: 'Modern house', category: 'structure', description: '',
      hasPreview: true, pairedDecoration: 'modern',
    } as const;
    const next = setDetailField(details({ structureType: 'house' }), 'structureType', 'modern', modernModule);
    expect(next).toMatchObject({ structureType: 'modern', decoration: 'modern' });
    // A module with no declared pairing leaves the decoration free.
    const plain = setDetailField(details({}), 'structureType', 'classic', { ...modernModule, id: 'classic', pairedDecoration: undefined });
    expect(plain.decoration).toBe('');
  });

  it('choosing a basement preserves an explicit size (no auto-reset)', () => {
    const d = details({ structureType: 'house', size: { w: 9, d: 9, h: 9 } });
    const next = setDetailField(d, 'basement', 'cellar');
    expect(next.basement).toBe('cellar');
    expect(next.size).toEqual({ w: 9, d: 9, h: 9 });
  });

  it('setting decoration or roof leaves other fields untouched', () => {
    const d = details({ structureType: 'house', size: { w: 9, d: 9, h: 9 }, roof: 'gable' });
    const deco = setDetailField(d, 'decoration', 'cozy');
    expect(deco).toMatchObject({ decoration: 'cozy', structureType: 'house', size: d.size, roof: 'gable' });
    const roof = setDetailField(d, 'roof', 'hip');
    expect(roof).toMatchObject({ roof: 'hip', size: d.size });
  });

  it('does not mutate the input', () => {
    const d = details({ structureType: 'house', params: { floors: 2 } });
    const snapshot = JSON.stringify(d);
    setDetailField(d, 'structureType', 'tower');
    expect(JSON.stringify(d)).toBe(snapshot);
  });
});

describe('assignRoom', () => {
  it('grows the grid to the floor and pads the edited row to ROOMS_PER_FLOOR', () => {
    const next = assignRoom(EMPTY_DETAILS, 2, 1, 'kitchen');
    expect(next.rooms).toHaveLength(3); // floors 0,1,2
    // Only the edited row is padded; intermediate rows stay empty (floorRooms pads on read).
    expect(next.rooms[2]).toHaveLength(ROOMS_PER_FLOOR);
    expect(next.rooms[2][1]).toBe('kitchen');
    expect(next.rooms[2][0]).toBe('');
  });

  it('clears a slot with an empty value', () => {
    const d = assignRoom(EMPTY_DETAILS, 0, 0, 'living');
    const cleared = assignRoom(d, 0, 0, '');
    expect(cleared.rooms[0][0]).toBe('');
  });

  it('does not mutate the input rooms grid', () => {
    const d = details({ rooms: [['living', '']] });
    const snapshot = JSON.stringify(d.rooms);
    assignRoom(d, 0, 1, 'kitchen');
    expect(JSON.stringify(d.rooms)).toBe(snapshot);
  });
});

describe('addRoom / removeRoomAt (planner model)', () => {
  it('appends a room, growing the grid to the floor', () => {
    const next = addRoom(EMPTY_DETAILS, 2, 'kitchen', 3);
    expect(next.rooms).toHaveLength(3); // floors 0,1,2
    expect(next.rooms[2]).toEqual(['kitchen']);
    expect(next.rooms[0]).toEqual([]);
  });

  it('allows duplicates up to the cap, then stops', () => {
    let d = addRoom(EMPTY_DETAILS, 0, 'bedroom', 2);
    d = addRoom(d, 0, 'bedroom', 2);
    expect(d.rooms[0]).toEqual(['bedroom', 'bedroom']);
    const full = addRoom(d, 0, 'library', 2);
    expect(full.rooms[0]).toEqual(['bedroom', 'bedroom']); // no-op when full
  });

  it('ignores an empty id', () => {
    expect(addRoom(EMPTY_DETAILS, 0, '', 3)).toBe(EMPTY_DETAILS);
  });

  it('removes the room at an index and normalises padded rows', () => {
    const d = details({ rooms: [['living', '', 'kitchen']] });
    const next = removeRoomAt(d, 0, 0);
    expect(next.rooms[0]).toEqual(['kitchen']); // '' stripped, living removed
  });

  it('does not mutate the input rooms grid', () => {
    const d = details({ rooms: [['living']] });
    const snapshot = JSON.stringify(d.rooms);
    addRoom(d, 0, 'kitchen', 3);
    removeRoomAt(d, 0, 0);
    expect(JSON.stringify(d.rooms)).toBe(snapshot);
  });
});

describe('setDetailParam', () => {
  it('merges the param and PRESERVES the explicit size (no reset)', () => {
    const d = details({ params: { decoration: 'cozy' }, size: { w: 9, d: 9, h: 9 } });
    const next = setDetailParam(d, 'floors', 3);
    expect(next.params).toEqual({ decoration: 'cozy', floors: 3 });
    expect(next.size).toEqual({ w: 9, d: 9, h: 9 });
  });

  it('resizes the per-floor heights when the floor count changes (copies the top storey)', () => {
    const d = details({ floorHeights: [6, 5] });
    expect(setDetailParam(d, 'floors', 4).floorHeights).toEqual([6, 5, 5, 5]);
    expect(setDetailParam(d, 'floors', 1).floorHeights).toEqual([6]);
  });

  it('leaves per-floor heights untouched for a non-floor param', () => {
    const d = details({ floorHeights: [6, 5] });
    expect(setDetailParam(d, 'balcony', 'front').floorHeights).toEqual([6, 5]);
  });
});

describe('setFloorHeight', () => {
  it('linked edit moves every floor; unlinked edits one', () => {
    const d = details({ floorHeights: [5, 5, 5] });
    expect(setFloorHeight(d, 1, 8, true).floorHeights).toEqual([8, 8, 8]);
    expect(setFloorHeight(d, 1, 8, false).floorHeights).toEqual([5, 8, 5]);
  });

  it('clamps a floor height and is a no-op without per-floor heights', () => {
    expect(setFloorHeight(details({ floorHeights: [5] }), 0, 999, false).floorHeights).toEqual([32]);
    expect(setFloorHeight(EMPTY_DETAILS, 0, 8, false)).toBe(EMPTY_DETAILS);
  });

  it('never lets a floor go under the 5-block rule', () => {
    expect(setFloorHeight(details({ floorHeights: [6] }), 0, 3, false).floorHeights).toEqual([MIN_FLOOR_H]);
  });
});

describe('setBandHeight', () => {
  it('sizes the picked attic band, clamped to the 5-block rule', () => {
    const d = details({ attic: 'storage' });
    expect(setBandHeight(d, 'attic', 8).atticH).toBe(8);
    expect(setBandHeight(d, 'attic', 3).atticH).toBe(MIN_FLOOR_H);
  });
  it('is a no-op when the attic slot is not picked', () => {
    expect(setBandHeight(EMPTY_DETAILS, 'attic', 8)).toBe(EMPTY_DETAILS);
  });
  it('a cleared attic drops its custom band height', () => {
    const d = details({ attic: 'storage', atticH: 8 });
    expect(setDetailField(d, 'attic', '').atticH).toBeNull();
  });
});

describe('basement sizing', () => {
  it('picking a basement seeds a single default level; clearing it drops the sizing', () => {
    const picked = setDetailField(EMPTY_DETAILS, 'basement', 'cellar');
    expect(picked.basementHeights).toHaveLength(1);
    const cleared = setDetailField(picked, 'basement', '');
    expect(cleared.basementHeights).toBeNull();
    expect(cleared.basementArea).toBeNull();
  });
  it('setBasementLevels grows/shrinks the per-level heights, capped at 4', () => {
    const d = details({ basement: 'cellar', basementHeights: [6] });
    expect(setBasementLevels(d, 3).basementHeights).toEqual([6, 6, 6]);
    expect(setBasementLevels(d, 9).basementHeights).toHaveLength(4);
    expect(setBasementLevels(details({ basement: 'cellar', basementHeights: [6, 7, 8] }), 1).basementHeights).toEqual([6]);
  });
  it('setBasementLevelHeight clamps to the 5-block rule and respects the link', () => {
    const d = details({ basement: 'cellar', basementHeights: [6, 6] });
    expect(setBasementLevelHeight(d, 0, 3, false).basementHeights).toEqual([MIN_FLOOR_H, 6]);
    expect(setBasementLevelHeight(d, 0, 9, true).basementHeights).toEqual([9, 9]);
  });
  it('setBasementArea stores an explicit footprint, clamped', () => {
    const d = details({ basement: 'cellar', basementHeights: [5] });
    expect(setBasementArea(d, 'w', 20, { w: 11, d: 11 }).basementArea).toEqual({ w: 20, d: 11 });
    expect(setBasementArea(d, 'w', SIZE_MAX + 99, { w: 11, d: 11 }).basementArea?.w).toBe(SIZE_MAX);
  });
  it('the basement reducers are a no-op when no basement is picked', () => {
    expect(setBasementLevels(EMPTY_DETAILS, 3)).toBe(EMPTY_DETAILS);
    expect(setBasementArea(EMPTY_DETAILS, 'w', 20, { w: 11, d: 11 })).toBe(EMPTY_DETAILS);
  });
});

describe('setSurroundSize', () => {
  it('stores the explicit per-side cell margins (clamped)', () => {
    const d = details({ surroundings: 'garden' });
    expect(setSurroundSize(d, { side: 10, front: 14, back: 8 }).surroundSizing).toEqual({ side: 10, front: 14, back: 8 });
  });
  it('clamps each margin to the allowed cell range', () => {
    const d = details({ surroundings: 'garden' });
    expect(setSurroundSize(d, { side: 999, front: 0, back: 14 }).surroundSizing).toEqual({ side: 32, front: 2, back: 14 });
  });
  it('null clears the override (back to the auto ring)', () => {
    const d = details({ surroundings: 'garden', surroundSizing: { side: 10, front: 10, back: 10 } });
    expect(setSurroundSize(d, null).surroundSizing).toBeNull();
  });
  it('is a no-op when no surroundings ring is picked', () => {
    expect(setSurroundSize(EMPTY_DETAILS, { side: 8, front: 8, back: 8 })).toBe(EMPTY_DETAILS);
  });
  it('clearing the surroundings slot drops the yard override', () => {
    const d = details({ surroundings: 'garden', surroundSizing: { side: 8, front: 8, back: 8 } });
    expect(setDetailField(d, 'surroundings', 'none').surroundSizing).toBeNull();
  });
});

describe('setDetailSize', () => {
  const base = { w: 9, d: 9, h: 9 };
  it('seeds the box from base on the first edit and sets the axis', () => {
    const next = setDetailSize(EMPTY_DETAILS, 'h', 14, base);
    expect(next.size).toEqual({ w: 9, d: 9, h: 14 });
  });

  it('clamps to [SIZE_MIN, SIZE_MAX]', () => {
    expect(setDetailSize(EMPTY_DETAILS, 'w', 999, base).size?.w).toBe(SIZE_MAX);
    expect(setDetailSize(EMPTY_DETAILS, 'w', 0, base).size?.w).toBe(SIZE_MIN);
  });

  it('keeps the other axes of an existing explicit size', () => {
    const d = details({ size: { w: 12, d: 8, h: 20 } });
    const next = setDetailSize(d, 'd', 10, base);
    expect(next.size).toEqual({ w: 12, d: 10, h: 20 });
  });
});
