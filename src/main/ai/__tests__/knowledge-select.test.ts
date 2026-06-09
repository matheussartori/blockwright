import { describe, expect, it } from 'vitest';
import { includedModuleGuides, isModuleGuide } from '../knowledge-select';

const HOUSE = 'nbt/modules/structure/classic.md';
const COZY = 'nbt/modules/decoration/cozy.md';

describe('isModuleGuide', () => {
  it('distinguishes core guides from module guides', () => {
    expect(isModuleGuide('nbt/00-volumetric-ops.md')).toBe(false);
    expect(isModuleGuide('nbt/10-design-principles.md')).toBe(false);
    expect(isModuleGuide(HOUSE)).toBe(true);
    expect(isModuleGuide(COZY)).toBe(true);
  });
});

describe('includedModuleGuides — prompt keyword fallback (no selection)', () => {
  it('adds no module guides — no module currently declares keywords', () => {
    // The keyword fallback is still wired (promptGuides), but no module declares
    // `keywords` right now, so a free-text prompt pulls no module guide on its own.
    expect(includedModuleGuides('a tall wizard tower').size).toBe(0);
    expect(includedModuleGuides('a cozy stone house with a porch').size).toBe(0);
  });
});

describe('includedModuleGuides — explicit selection', () => {
  it('includes the selected structure + decoration guides', () => {
    const set = includedModuleGuides('', { structureType: 'classic', decoration: 'cozy' });
    expect(set).toContain(HOUSE);
    expect(set).toContain(COZY);
  });

  it('ignores an unknown selection id without throwing', () => {
    expect(includedModuleGuides('', { structureType: 'castle' }).size).toBe(0);
  });

  it('loads a selected roof/basement guide, and ONLY the selected one', () => {
    const set = includedModuleGuides('', { structureType: 'classic', roof: 'gable', basement: 'cellar' });
    expect(set).toContain('nbt/modules/roof/gable.md');
    expect(set).toContain('nbt/modules/basement/cellar.md');
    // The roof/basement the user did NOT pick must not ride along.
    expect(set).not.toContain('nbt/modules/roof/hip.md');
    expect(set).not.toContain('nbt/modules/basement/crypt.md');
  });

  it('loads a guide for each selected interior room, and only those', () => {
    const set = includedModuleGuides('', { structureType: 'classic', rooms: ['living', 'kitchen'] });
    expect(set).toContain('nbt/modules/room/living.md');
    expect(set).toContain('nbt/modules/room/kitchen.md');
    expect(set).not.toContain('nbt/modules/room/library.md');
  });

  it('does not pull any roof/basement guide for a plain prompt with no selection', () => {
    const set = includedModuleGuides('a cozy stone house with a porch');
    expect([...set].some((p) => p.startsWith('nbt/modules/roof/'))).toBe(false);
    expect([...set].some((p) => p.startsWith('nbt/modules/basement/'))).toBe(false);
  });
});
