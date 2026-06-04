// The post-processing pipeline: run a sequence of passes over the resolved block
// list, threading the (possibly growing) palette through and accumulating the
// fixes/warnings each pass reports.
import type { AuthoringBlock, AuthoringPaletteEntry } from '../types';
import type { Pass, PassContext, PassResult } from './types';

export type { Pass, PassContext, PassResult } from './types';
export { carveStairwells } from './carve-stairwells';
export { connectBlocks, connFamily } from './connect-blocks';
export { fillInteriorAir } from './fill-air';
export { fixPlacement } from './placement';

export function runPasses(
  blocks: AuthoringBlock[],
  palette: AuthoringPaletteEntry[],
  ctx: PassContext,
  passes: Pass[],
): PassResult {
  let curBlocks = blocks;
  let curPalette = palette;
  const fixes: string[] = [];
  const warnings: string[] = [];
  for (const pass of passes) {
    const r = pass(curBlocks, curPalette, ctx);
    curBlocks = r.blocks;
    curPalette = r.palette;
    if (r.fixes?.length) fixes.push(...r.fixes);
    if (r.warnings?.length) warnings.push(...r.warnings);
  }
  return { blocks: curBlocks, palette: curPalette, fixes, warnings };
}
