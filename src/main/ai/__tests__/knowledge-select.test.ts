import { describe, expect, it } from 'vitest';
import { coreGuideIncluded, includedModuleGuides, isComplexBuild, isConditionalCore, isModuleGuide } from '../knowledge-select';

const COMPLEX = 'nbt/08-complex-structures.md';

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

describe('conditional core — complex-structures gate', () => {
  it('marks 08-complex-structures as a conditional core guide (others are always-on)', () => {
    expect(isConditionalCore(COMPLEX)).toBe(true);
    expect(isConditionalCore('nbt/10-design-principles.md')).toBe(false);
    expect(isConditionalCore('nbt/00-volumetric-ops.md')).toBe(false);
  });

  it('always includes always-on core guides regardless of build', () => {
    expect(coreGuideIncluded('nbt/00-volumetric-ops.md', '', undefined)).toBe(true);
    expect(coreGuideIncluded('nbt/10-design-principles.md', 'a tiny hut', undefined)).toBe(true);
  });

  it('drops complex-structures for a clearly simple build', () => {
    expect(isComplexBuild('a small cozy hut', undefined)).toBe(false);
    expect(coreGuideIncluded(COMPLEX, 'a small cozy hut', undefined)).toBe(false);
    expect(isComplexBuild('', { structureType: 'classic', decoration: 'cozy' })).toBe(false);
  });

  it('keeps complex-structures when the selection signals complexity', () => {
    expect(isComplexBuild('', { structureType: 'classic', basement: 'cellar' })).toBe(true);
    expect(isComplexBuild('', { structureType: 'classic', rooms: ['living', 'kitchen'] })).toBe(true);
    expect(isComplexBuild('', { structureType: 'gothic' })).toBe(true);
    expect(coreGuideIncluded(COMPLEX, '', { basement: 'cellar' })).toBe(true);
  });

  it('keeps complex-structures when the prompt implies scale / rooms / below-grade', () => {
    expect(isComplexBuild('a large stone mansion', undefined)).toBe(true);
    expect(isComplexBuild('a house with a basement', undefined)).toBe(true);
    expect(isComplexBuild('a keep with several rooms and two floors', undefined)).toBe(true);
    expect(isComplexBuild('an L-shaped manor with a wing', undefined)).toBe(true);
  });
});
