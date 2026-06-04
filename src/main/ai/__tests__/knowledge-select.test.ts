import { describe, expect, it } from 'vitest';
import { relevantGuides } from '../knowledge-select';

const FILES = [
  '00-volumetric-ops.md', '03-blocks-and-blockstates.md', '05-building-houses.md',
  '10-design-principles.md', '12-exterior-and-facade-detailing.md', '14-towers.md', 'README.md',
];

describe('relevantGuides', () => {
  it('drops the towers guide for a non-tower prompt', () => {
    const r = relevantGuides(FILES, 'a cozy stone house with a basement');
    expect(r).not.toContain('14-towers.md');
  });

  it('keeps the towers guide when the prompt asks for a tower (EN or PT)', () => {
    expect(relevantGuides(FILES, 'a tall wizard tower')).toContain('14-towers.md');
    expect(relevantGuides(FILES, 'uma torre de pedra')).toContain('14-towers.md');
    expect(relevantGuides(FILES, 'a church with a steeple')).toContain('14-towers.md');
  });

  it('always keeps the core guides', () => {
    const core = FILES.filter((f) => f !== '14-towers.md');
    const r = relevantGuides(FILES, 'anything at all');
    for (const f of core) expect(r).toContain(f);
  });

  it('does not match unrelated substrings (e.g. "keep" the rooms)', () => {
    expect(relevantGuides(FILES, 'keep the existing rooms and add a porch')).not.toContain('14-towers.md');
  });
});
