import { describe, expect, it } from 'vitest';
import { EMPTY_DETAILS, ROOMS_PER_FLOOR, type BuildDetails } from '../brief';
import {
  SIZE_MAX,
  SIZE_MIN,
  assignRoom,
  setDetailField,
  setDetailParam,
  setDetailSize,
} from '../details';

const details = (over: Partial<BuildDetails>): BuildDetails => ({ ...EMPTY_DETAILS, ...over });

describe('setDetailField', () => {
  it('switching structure clears params, size, roof, basement and rooms', () => {
    const d = details({
      structureType: 'house',
      params: { floors: 2 },
      size: { w: 10, d: 10, h: 12 },
      roof: 'gable',
      basement: 'cellar',
      rooms: [['kitchen', '']],
    });
    const next = setDetailField(d, 'structureType', 'tower');
    expect(next).toMatchObject({
      structureType: 'tower',
      params: {},
      size: null,
      roof: '',
      basement: '',
      rooms: [],
    });
  });

  it('pairs the Modern decoration when the modern house is chosen', () => {
    const next = setDetailField(details({ structureType: 'house' }), 'structureType', 'modern');
    expect(next).toMatchObject({ structureType: 'modern', decoration: 'modern' });
  });

  it('choosing a basement re-derives the size (clears manual override)', () => {
    const d = details({ structureType: 'house', size: { w: 9, d: 9, h: 9 } });
    const next = setDetailField(d, 'basement', 'cellar');
    expect(next.basement).toBe('cellar');
    expect(next.size).toBeNull();
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

describe('setDetailParam', () => {
  it('merges the param and clears the size override', () => {
    const d = details({ params: { decoration: 'cozy' }, size: { w: 9, d: 9, h: 9 } });
    const next = setDetailParam(d, 'floors', 3);
    expect(next.params).toEqual({ decoration: 'cozy', floors: 3 });
    expect(next.size).toBeNull();
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
