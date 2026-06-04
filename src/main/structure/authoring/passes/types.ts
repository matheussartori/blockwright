// The post-processing pass contract. After op expansion (resolveBlocks) the block
// list is run through a sequence of passes that repair / refine it the way vanilla
// placement would: open stairwells, derive connection blockstates, fix invalid
// placements, air-fill interiors. Each pass is a pure (blocks, palette) → result
// transform; new quality passes plug in by implementing this and registering in
// the pipeline (see ./index.ts) — no other code changes.
import type { Vec3 } from '../geometry';
import type { AuthoringBlock, AuthoringPaletteEntry } from '../types';

export interface PassContext {
  size: Vec3;
}

export interface PassResult {
  blocks: AuthoringBlock[];
  palette: AuthoringPaletteEntry[];
  /** Auto-applied changes, surfaced to the user/model as an informational summary. */
  fixes?: string[];
  /** Issues left for the model to fix on the next emit (geometry untouched). */
  warnings?: string[];
}

export type Pass = (
  blocks: AuthoringBlock[],
  palette: AuthoringPaletteEntry[],
  ctx: PassContext,
) => PassResult;
