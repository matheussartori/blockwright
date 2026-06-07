// Builds the content blocks returned to the model after each emit so it can REVIEW
// its own build: a compiled-status line, any auto-fix / warning notes, the reference
// image(s) it was given (the target), and the rendered screenshots of the version it
// just produced. Pure — extracted from generate.ts's onEmit so the (provider-neutral)
// review framing is unit-tested in isolation. The orchestrator appends the design-pass
// gate text after this.
import type { GenerateImage } from '@/shared/types';
import type { NeutralBlock } from './providers/types';

/** Inputs for {@link buildReviewContent}: the compiled build's facts, the compiler's
 *  fixes/warnings, the reference images (if any), and the render result. */
export interface ReviewContentInput {
  version: number;
  /** Build box [W, H, D]. */
  size: [number, number, number];
  blockCount: number;
  /** Number of palette entries (the model is told where appended patch entries start). */
  paletteLen: number;
  /** Placement fixes the compiler auto-applied this round (may be empty). */
  fixes: string[];
  /** Placement warnings the model must correct itself (may be empty). */
  warnings: string[];
  /** Reference image(s) the user supplied as the target (may be empty/undefined). */
  referenceImages?: GenerateImage[];
  /** The render of this version: screenshots for review, or an error if it failed. */
  shot: { images?: GenerateImage[]; error?: string };
}

/** Assemble the review content blocks for one emit (everything before the design-pass
 *  gate text, which the orchestrator appends).
 *  @param input - See {@link ReviewContentInput}.
 *  @returns The ordered text/image blocks to return to the model. */
export function buildReviewContent(input: ReviewContentInput): NeutralBlock[] {
  const { version, size, blockCount, paletteLen, fixes, warnings, referenceImages, shot } = input;
  const haveShots = !!shot.images && shot.images.length > 0;
  const haveRef = !!referenceImages && referenceImages.length > 0;

  const content: NeutralBlock[] = [
    {
      type: 'text',
      text:
        `Compiled and rendered as v${version} (${size.join('×')}, ${blockCount} blocks). ` +
        `Palette has ${paletteLen} entries (indices 0..${Math.max(paletteLen - 1, 0)}); ` +
        `in a patch, new palette entries you add start at index ${paletteLen}.`,
    },
  ];

  if (fixes.length) {
    content.push({
      type: 'text',
      text:
        `The compiler auto-corrected unsupported block placements: ${fixes.join('; ')}. ` +
        'Place these blocks on a valid support in future emits so they no longer need fixing.',
    });
  }
  if (warnings.length) {
    content.push({
      type: 'text',
      text: `PLACEMENT WARNINGS (not auto-fixed — you must correct these): ${warnings.join(' ')}`,
    });
  }

  if (haveRef && haveShots) {
    content.push({
      type: 'text',
      text: 'TARGET — the reference image(s) you were given. This is the goal; compare every facet of your build against it:',
    });
    for (const img of referenceImages!) content.push({ type: 'image', data: img.data, mediaType: img.mediaType });
  }

  if (haveShots) {
    content.push({
      type: 'text',
      text:
        `YOUR build v${version} follows: first the orbited EXTERIOR angles, then a VERTICAL ` +
        'CROSS-SECTION (front half clipped away, viewed straight on) showing storey heights and how floors ' +
        'stack, then top-down FLOOR-PLAN cutaways (the roof clipped away) so you can review each INTERIOR — ' +
        'room layout, faux furniture, lighting, and circulation. Review them against the focused goal for ' +
        'this design pass below.',
    });
    for (const img of shot.images!) content.push({ type: 'image', data: img.data, mediaType: img.mediaType });
  } else {
    content.push({
      type: 'text',
      text: shot.error ? `(Preview render unavailable: ${shot.error})` : '(No preview available.)',
    });
  }

  return content;
}
