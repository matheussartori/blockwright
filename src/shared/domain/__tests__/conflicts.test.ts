import { describe, expect, it } from 'vitest';
import { modulesConflict } from '../conflicts';

describe('modulesConflict', () => {
  const flat = { id: 'flat', incompatibleWith: ['storage', 'bedroom'] };
  const attic = { id: 'bedroom', incompatibleWith: ['flat'] };
  const gable = { id: 'gable' };

  it('is true when either side lists the other (symmetric)', () => {
    expect(modulesConflict(flat, attic)).toBe(true);
    expect(modulesConflict(attic, flat)).toBe(true);
  });

  it('resolves a one-sided declaration in both directions', () => {
    const oneSided = { id: 'storage' }; // no list, but flat lists 'storage'
    expect(modulesConflict(flat, oneSided)).toBe(true);
    expect(modulesConflict(oneSided, flat)).toBe(true);
  });

  it('is false for compatible modules and for self', () => {
    expect(modulesConflict(gable, attic)).toBe(false);
    expect(modulesConflict(flat, flat)).toBe(false);
    expect(modulesConflict({ id: 'a' }, { id: 'b' })).toBe(false);
  });
});
