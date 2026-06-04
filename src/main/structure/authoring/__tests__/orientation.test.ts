import { describe, expect, it } from 'vitest';
import { mirrorFacing, rotFacing, transformProps } from '../orientation';

describe('rotFacing', () => {
  it('rotates clockwise one quarter-turn', () => {
    expect(rotFacing('north', 1)).toBe('east');
    expect(rotFacing('east', 1)).toBe('south');
  });
  it('wraps around a full turn', () => {
    expect(rotFacing('north', 4)).toBe('north');
  });
  it('normalises negative turns', () => {
    expect(rotFacing('north', -1)).toBe('west');
  });
});

describe('mirrorFacing', () => {
  it('mirrors east/west across the x axis only', () => {
    expect(mirrorFacing('east', 'x')).toBe('west');
    expect(mirrorFacing('north', 'x')).toBe('north');
  });
  it('mirrors north/south across the z axis only', () => {
    expect(mirrorFacing('north', 'z')).toBe('south');
    expect(mirrorFacing('east', 'z')).toBe('east');
  });
});

describe('transformProps', () => {
  it('rewrites facing under a rotate', () => {
    expect(transformProps({ facing: 'north' }, { kind: 'rotate', turns: 1 })).toEqual({ facing: 'east' });
  });
  it('swaps the log axis on an odd quarter-turn but not an even one', () => {
    expect(transformProps({ axis: 'x' }, { kind: 'rotate', turns: 1 })).toEqual({ axis: 'z' });
    expect(transformProps({ axis: 'x' }, { kind: 'rotate', turns: 2 })).toEqual({ axis: 'x' });
  });
  it('mirrors stair corner shapes and door hinges', () => {
    expect(transformProps({ shape: 'inner_left' }, { kind: 'mirror', axis: 'x' })).toEqual({ shape: 'inner_right' });
    expect(transformProps({ hinge: 'left' }, { kind: 'mirror', axis: 'x' })).toEqual({ hinge: 'right' });
  });
  it('rewrites the 0..15 rotation property', () => {
    expect(transformProps({ rotation: '0' }, { kind: 'rotate', turns: 1 })).toEqual({ rotation: '4' });
    expect(transformProps({ rotation: '4' }, { kind: 'mirror', axis: 'x' })).toEqual({ rotation: '12' });
  });
  it('returns undefined props untouched', () => {
    expect(transformProps(undefined, { kind: 'rotate', turns: 1 })).toBeUndefined();
  });
});
