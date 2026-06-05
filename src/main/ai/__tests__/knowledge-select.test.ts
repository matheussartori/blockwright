import { describe, expect, it } from 'vitest';
import { includedModuleGuides, isModuleGuide } from '../knowledge-select';

const TOWER = 'nbt/modules/structure/tower.md';
const HOUSE = 'nbt/modules/structure/house.md';
const COZY = 'nbt/modules/decoration/cozy.md';

describe('isModuleGuide', () => {
  it('distinguishes core guides from module guides', () => {
    expect(isModuleGuide('nbt/00-volumetric-ops.md')).toBe(false);
    expect(isModuleGuide('nbt/10-design-principles.md')).toBe(false);
    expect(isModuleGuide(TOWER)).toBe(true);
    expect(isModuleGuide(COZY)).toBe(true);
  });
});

describe('includedModuleGuides — prompt keyword fallback (no selection)', () => {
  it('pulls the tower guide when the prompt asks for a tower (EN or PT)', () => {
    expect(includedModuleGuides('a tall wizard tower')).toContain(TOWER);
    expect(includedModuleGuides('uma torre de pedra')).toContain(TOWER);
    expect(includedModuleGuides('a church with a steeple')).toContain(TOWER);
  });

  it('includes no module guides for a plain, unmatched prompt', () => {
    expect(includedModuleGuides('a cozy stone house with a porch').size).toBe(0);
    expect(includedModuleGuides('keep the existing rooms and add a porch')).not.toContain(TOWER);
  });
});

describe('includedModuleGuides — explicit selection', () => {
  it('includes the selected structure + decoration guides', () => {
    const set = includedModuleGuides('', { structureType: 'tower', decoration: 'cozy' });
    expect(set).toContain(TOWER);
    expect(set).toContain(COZY);
    expect(set).not.toContain(HOUSE);
  });

  it('includes the house guide when house is selected', () => {
    expect(includedModuleGuides('', { structureType: 'house' })).toContain(HOUSE);
  });

  it('ignores an unknown selection id without throwing', () => {
    expect(includedModuleGuides('', { structureType: 'castle' }).size).toBe(0);
  });

  it('loads a selected roof/basement guide, and ONLY the selected one', () => {
    const set = includedModuleGuides('', { structureType: 'house', roof: 'gable', basement: 'full' });
    expect(set).toContain('nbt/modules/roof/gable.md');
    expect(set).toContain('nbt/modules/basement/full.md');
    // The roof/basement the user did NOT pick must not ride along.
    expect(set).not.toContain('nbt/modules/roof/hip.md');
    expect(set).not.toContain('nbt/modules/basement/half.md');
  });

  it('does not pull any roof/basement guide for a plain prompt with no selection', () => {
    const set = includedModuleGuides('a cozy stone house with a porch');
    expect([...set].some((p) => p.startsWith('nbt/modules/roof/'))).toBe(false);
    expect([...set].some((p) => p.startsWith('nbt/modules/basement/'))).toBe(false);
  });
});
