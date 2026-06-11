// The post-processing pass contract. After op expansion (resolveBlocks) the block
// list is run through a sequence of passes that repair / refine it the way vanilla
// placement would: open stairwells, derive connection blockstates, fix invalid
// placements, air-fill interiors. Each pass is a pure (blocks, palette) → result
// transform; new quality passes plug in by implementing this and registering in
// the pipeline (see ./index.ts) — no other code changes.
import type { Vec3 } from '../geometry';
import type { AuthoringBlock, AuthoringPaletteEntry } from '../types';

/** One cell of the code-built starting SHELL that a `lockShell` structure type insists
 *  on keeping (its floor decks, roof, walls, tower, …). `preserveShell` restores any of
 *  these the model deleted (left as air), so a locked exterior can't be gutted by the AI. */
export interface ShellLockCell {
  pos: Vec3;
  entry: AuthoringPaletteEntry;
}

export interface PassContext {
  size: Vec3;
  /** The selected structure-type id (e.g. `'classic'`) when the build came from a
   *  structure module, else undefined. Lets structure-scoped passes gate themselves —
   *  but the gating itself is driven by the module's declared finalizers (see
   *  `compile.ts`), so a pass receives this only for its own geometry decisions. */
  structureType?: string;
  /** The ground-floor y ("grade"), from the build's labelled storeys (see
   *  `gradeFromFloors`). The air-fill keeps below-grade exterior as structure_void
   *  and clears at/above-grade exterior to air. Undefined = no floors declared, so
   *  nothing is treated as below grade (every exterior pocket fills with air). */
  grade?: number;
  /** Optional sink for the per-pass play-by-play (the AI Console dock). When set,
   *  `runPasses` reports each pass's intent + any fixes/warnings through it. Left
   *  undefined for non-AI compiles (catalog/module previews) so they stay quiet. */
  log?: (message: string) => void;
  /** The protected SHELL cells for a `lockShell` structure (gothic) — `preserveShell`
   *  re-asserts any of these the model deleted, so the code-built exterior survives the
   *  AI's edits. Undefined/empty for every other build → `preserveShell` no-ops. */
  lockCells?: ShellLockCell[];
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
