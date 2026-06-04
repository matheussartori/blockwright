import { describe, expect, it } from 'vitest';
import { PHASES } from '../phases';
import { maxRoundsFor, MIN_ROUNDS, roundsForVolume } from '../rounds';

describe('roundsForVolume', () => {
  it('scales the cap up with build volume', () => {
    expect(roundsForVolume(500)).toBe(4);
    expect(roundsForVolume(2000)).toBe(5);
    expect(roundsForVolume(10000)).toBe(6);
    expect(roundsForVolume(50000)).toBe(7);
  });
});

describe('maxRoundsFor', () => {
  it('floors to the design-pass sequence + audit headroom', () => {
    expect(MIN_ROUNDS).toBe(PHASES.length + 2);
    expect(maxRoundsFor(0, null)).toBe(MIN_ROUNDS); // volume unknown → floor
    expect(maxRoundsFor(500, null)).toBe(MIN_ROUNDS); // small build's 4 is below the floor
  });

  it('uses the volume cap when it exceeds the floor', () => {
    expect(maxRoundsFor(50000, null)).toBe(Math.max(7, MIN_ROUNDS));
  });

  it('honours the env override, still floored', () => {
    expect(maxRoundsFor(50000, 3)).toBe(MIN_ROUNDS); // 3 < floor → floor
    expect(maxRoundsFor(500, 20)).toBe(20); // explicit high override wins
  });
});
