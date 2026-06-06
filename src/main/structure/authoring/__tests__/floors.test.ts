import { describe, it, expect } from 'vitest';
import { gradeFromFloors } from '../floors';

describe('gradeFromFloors', () => {
  it('returns undefined when there are no floors', () => {
    expect(gradeFromFloors(undefined)).toBeUndefined();
    expect(gradeFromFloors([])).toBeUndefined();
  });

  it('grade is the lowest non-basement `from` (just above the basement)', () => {
    const floors = [
      { role: 'basement' as const, from: 0, to: 4 },
      { role: 'ground' as const, from: 5, to: 9 },
      { role: 'upper' as const, from: 10, to: 14 },
    ];
    expect(gradeFromFloors(floors)).toBe(5);
  });

  it('treats an unmarked storey (no role) as above grade', () => {
    const floors = [
      { role: 'basement' as const, from: 0, to: 3 },
      { from: 4, to: 8 }, // no role → above grade
    ];
    expect(gradeFromFloors(floors)).toBe(4);
  });

  it('grade is one above the highest basement when every floor is a basement', () => {
    const floors = [
      { role: 'basement' as const, from: 0, to: 4 },
      { role: 'basement' as const, from: 5, to: 9 },
    ];
    expect(gradeFromFloors(floors)).toBe(10);
  });

  it('with no basement, grade is the lowest floor `from`', () => {
    const floors = [
      { role: 'ground' as const, from: 0, to: 5 },
      { role: 'upper' as const, from: 6, to: 10 },
    ];
    expect(gradeFromFloors(floors)).toBe(0);
  });
});
