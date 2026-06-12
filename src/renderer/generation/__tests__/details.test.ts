import { describe, expect, it } from 'vitest';
import { EMPTY_DETAILS, MIN_STOREY_H, ROOMS_PER_FLOOR, type BuildDetails } from '../brief';
import {
  SIZE_MAX,
  SIZE_MIN,
  addRoom,
  assignRoom,
  removeRoomAt,
  setDetailField,
  setDetailParam,
  setDetailSize,
  setFloorHeight,
  setHeightMode,
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

describe('setHeightMode / setFloorHeight', () => {
  it("clears per-floor heights when switching back to 'total'", () => {
    const d = details({ floorHeights: [6, 5] });
    expect(setHeightMode(d, 'total', undefined).floorHeights).toBeNull();
  });

  it("seeds per-floor heights from the size when switching to 'floors'", () => {
    // No struct → floorCount falls to 1; a uniform storey is seeded from the box.
    const d = details({ structureType: 'house', size: { w: 9, d: 9, h: 12 } });
    const next = setHeightMode(d, 'floors', undefined);
    expect(next.floorHeights).not.toBeNull();
    expect(next.floorHeights?.every((h) => h >= MIN_STOREY_H)).toBe(true);
  });

  it('linked edit moves every floor; unlinked edits one', () => {
    const d = details({ floorHeights: [5, 5, 5] });
    expect(setFloorHeight(d, 1, 8, true).floorHeights).toEqual([8, 8, 8]);
    expect(setFloorHeight(d, 1, 8, false).floorHeights).toEqual([5, 8, 5]);
  });

  it('clamps a floor height and is a no-op without per-floor heights', () => {
    expect(setFloorHeight(details({ floorHeights: [5] }), 0, 999, false).floorHeights).toEqual([32]);
    expect(setFloorHeight(EMPTY_DETAILS, 0, 8, false)).toBe(EMPTY_DETAILS);
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
