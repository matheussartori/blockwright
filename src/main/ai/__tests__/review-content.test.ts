import { describe, expect, it } from 'vitest';
import { buildReviewContent, type ReviewContentInput } from '../review-content';
import type { GenerateImage } from '@/shared/types';

const img = (data: string): GenerateImage => ({ data, mediaType: 'image/png' });

const base: ReviewContentInput = {
  version: 1,
  size: [9, 8, 7],
  blockCount: 123,
  paletteLen: 4,
  fixes: [],
  warnings: [],
  shot: { images: [img('shotA')] },
};

const text = (blocks: ReturnType<typeof buildReviewContent>) =>
  blocks.filter((b) => b.type === 'text').map((b) => (b as { text: string }).text).join('\n');

describe('buildReviewContent', () => {
  it('always opens with the compiled-status line (size, blocks, palette indices)', () => {
    const blocks = buildReviewContent(base);
    expect(blocks[0]).toMatchObject({ type: 'text' });
    expect(text(blocks)).toContain('Compiled and rendered as v1 (9×8×7, 123 blocks)');
    // paletteLen 4 → indices 0..3 and patch entries start at 4.
    expect(text(blocks)).toContain('indices 0..3');
    expect(text(blocks)).toContain('start at index 4');
  });

  it('includes fix and warning notes only when present', () => {
    expect(text(buildReviewContent(base))).not.toContain('auto-corrected');
    const withNotes = buildReviewContent({ ...base, fixes: ['moved torch'], warnings: ['floating bars'] });
    expect(text(withNotes)).toContain('auto-corrected unsupported block placements: moved torch');
    expect(text(withNotes)).toContain('PLACEMENT WARNINGS');
    expect(text(withNotes)).toContain('floating bars');
  });

  it('appends the screenshots as image blocks', () => {
    const blocks = buildReviewContent({ ...base, shot: { images: [img('a'), img('b')] } });
    const images = blocks.filter((b) => b.type === 'image') as { data: string }[];
    expect(images.map((i) => i.data)).toEqual(['a', 'b']);
    expect(text(blocks)).toContain('YOUR build v1 follows');
  });

  it('shows the reference target only when BOTH a reference and shots exist', () => {
    const noRef = buildReviewContent(base);
    expect(text(noRef)).not.toContain('TARGET');
    const withRef = buildReviewContent({ ...base, referenceImages: [img('ref')] });
    expect(text(withRef)).toContain('TARGET');
    const refImg = (withRef.filter((b) => b.type === 'image') as { data: string }[]).map((i) => i.data);
    expect(refImg).toEqual(['ref', 'shotA']); // reference first, then the build
    // A reference with no shots → no TARGET block (nothing to compare against).
    const refNoShots = buildReviewContent({ ...base, referenceImages: [img('ref')], shot: {} });
    expect(text(refNoShots)).not.toContain('TARGET');
  });

  it('falls back to a render-unavailable note when there are no shots', () => {
    expect(text(buildReviewContent({ ...base, shot: { error: 'timeout' } }))).toContain('Preview render unavailable: timeout');
    expect(text(buildReviewContent({ ...base, shot: {} }))).toContain('No preview available');
  });
});
