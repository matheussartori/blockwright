// The post-processing pipeline: run a sequence of passes over the resolved block
// list, threading the (possibly growing) palette through and accumulating the
// fixes/warnings each pass reports.
import type { AuthoringBlock, AuthoringPaletteEntry } from '../types';
import { carveStairwells } from './carve-stairwells';
import { fixChimney } from './chimney';
import { connectBlocks } from './connect-blocks';
import { fillInteriorAir } from './fill-air';
import { fixCirculation } from './fix-circulation';
import { fixDoors } from './fix-doors';
import { fixPlacement } from './placement';
import { insetStairs } from './stairs';
import { stairsToLadder } from './stairs-to-ladder';
import type { Pass, PassContext, PassResult } from './types';

export type { Pass, PassContext, PassResult } from './types';
export { carveStairwells } from './carve-stairwells';
export { fixChimney } from './chimney';
export { connectBlocks, connFamily } from './connect-blocks';
export { computeEnvelope } from './envelope';
export { fillInteriorAir } from './fill-air';
export { fixCirculation } from './fix-circulation';
export { fixDoors } from './fix-doors';
export { fixPlacement } from './placement';
export { insetStairs } from './stairs';
export { stairsToLadder } from './stairs-to-ladder';

/** Plain-language intent for each pass, used by the AI Console play-by-play so the
 *  code-side fine-tuning reads as "what is being repaired right now". Keyed by the
 *  pass reference (robust to bundler renaming, unlike `fn.name`). */
const PASS_LABELS = new Map<Pass, string>([
  [insetStairs, 'Inset stairs: nudging a flight pressed against the shell into the open interior'],
  [stairsToLadder, 'Ladder fallback: turning a flight that can\'t fit with clearance into a flush wall ladder'],
  [carveStairwells, 'Stairwells: opening headroom above each flight and clearing the bottom landing'],
  [fixDoors, 'Doors: mirroring hinges and aligning the two door halves'],
  [connectBlocks, 'Connections: deriving fence/pane/wall/bar sides from their neighbours'],
  [fixPlacement, 'Placement: repairing blocks sitting on an invalid support'],
  [fixCirculation, 'Circulation: removing broken ladders and capping orphan floor holes'],
  [fixChimney, 'Chimney: completing the flue / dropping a floating cap / keeping a single chimney'],
  [fillInteriorAir, 'Interior: clearing trapped air inside each column without gouging terrain'],
]);

/** Run `passes` in order over the resolved blocks, threading each pass's output
 *  (blocks + possibly-grown palette) into the next and accumulating their
 *  fixes/warnings into the final result. When `ctx.log` is set, reports each pass's
 *  intent (and the concrete fixes/warnings it produced) as the code-fix play-by-play. */
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
    ctx.log?.(PASS_LABELS.get(pass) ?? 'Fine-tuning pass');
    const r = pass(curBlocks, curPalette, ctx);
    curBlocks = r.blocks;
    curPalette = r.palette;
    if (r.fixes?.length) {
      fixes.push(...r.fixes);
      for (const f of r.fixes) ctx.log?.(`  ↳ ${f}`);
    }
    if (r.warnings?.length) {
      warnings.push(...r.warnings);
      for (const w of r.warnings) ctx.log?.(`  ⚠ ${w}`);
    }
  }
  return { blocks: curBlocks, palette: curPalette, fixes, warnings };
}
