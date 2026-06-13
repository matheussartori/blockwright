// The code-built STARTING SHELL seed. The model can't reliably invent a silhouette from
// prose alone (the modern villa: flat roofs, stacked offset volumes, glass curtain walls,
// a pool; the farmhouse: an L plan + cross-gable + wraparound veranda) — so a FRESH build
// with a selected structure type is seeded with that type's OWN compiled geometry; the
// model then keeps that exterior and only furnishes / details it (see `shellPreamble`).
// Gated by the structure type's `seedShell` flag — every house type opts in (the classic
// included: its variety comes from the seeded shell itself, not from free-form). Free-form
// remains the path for a build with NO structure selected.
import fs from 'node:fs';
import path from 'node:path';
import { getStructureType } from '../structure/domain';
import { readAuthoring, writeStructureFile } from '../structure/authoring';
import { isAir } from '../structure/authoring/palette';
import type { AuthoringStructure } from '../structure/authoring/types';
import type { ShellLockCell } from '../structure/authoring/passes';
import { shellPreamble } from './seed';

/** A sensible default shell box when the user didn't pick an explicit size. */
const DEFAULT_SIZE: [number, number, number] = [15, 13, 13];

/** Options for {@link buildShellSeed} — the structured Details picks that shape the
 *  code-built starting shell. */
export interface ShellSeedOptions {
  /** The selected structure-type id (undefined → no structure, no seed). */
  structureType?: string;
  /** The selected decoration id (the shell's materials); defaults to the type's own kit. */
  decoration?: string;
  /** The build box [W, H, D]; defaults to {@link DEFAULT_SIZE}. */
  size?: [number, number, number];
  /** The selected roof-module id (gable/hip/flat), threaded so the shell honours it. */
  roof?: string;
  /** The selected basement-module id (cellar/crypt/cult-temple), threaded so the shell
   *  digs the chosen below-grade vault — composed centrally by `composeStructure`. */
  basement?: string;
  /** The selected surroundings-module id, threaded so the shell wraps the house in its
   *  yard ring (the `size` already includes the ring margins — see
   *  `shared/domain/surroundings.ts`; the type insets its massing by the same margins). */
  surroundings?: string;
  /** The user's explicit per-side surroundings ring margins in cells (the composer's manual
   *  yard-size control), threaded so the shell grows its yard to exactly this footprint. */
  surroundSizing?: { side: number; front: number; back: number };
  /** The user's explicit per-floor storey heights (slab-to-slab, bottom-up), threaded so
   *  the shell's storey ladder lays its decks at exactly those heights. */
  floorHeights?: number[];
}

/** The result of {@link buildShellSeed}: the model-facing preamble plus the protected
 *  shell cells the compile pass re-asserts on every emit. */
export interface ShellSeed {
  /** The {@link shellPreamble} wrapping the compiled shell's authoring JSON, or ''. */
  preamble: string;
  /** The solid shell cells to LOCK against deletion — EVERY seeded shell is locked
   *  (the unlocked-seed experiment failed: the model emits furniture-only deltas and
   *  the shell vanishes, the sakura "skeleton" defect). Threaded into every emit's
   *  compile as `CompileOptions.lockCells`; `preserveShell` restores any cell the
   *  model deleted. Undefined only when there is no shell at all. */
  lockCells?: ShellLockCell[];
}

/**
 * Build the starting-shell seed for a fresh build, or an empty preamble when the selected
 * structure type doesn't opt into shell-seeding (so the caller falls back to free-form).
 *
 * @param opts - The {@link ShellSeedOptions} (structure/decoration/size/roof).
 * @param dir - A scratch dir to compile the shell into (the session dir).
 * @returns A {@link ShellSeed}: the preamble plus the locked shell cells.
 */
export async function buildShellSeed(opts: ShellSeedOptions, dir: string): Promise<ShellSeed> {
  const { structureType, decoration, size, roof, basement, surroundings, surroundSizing, floorHeights } = opts;
  const type = structureType ? getStructureType(structureType) : undefined;
  if (!type || !type.seedShell) return { preamble: '' };

  const [W, H, D] = size ?? DEFAULT_SIZE;
  const params: Record<string, unknown> = {};
  if (decoration) params.decoration = decoration;
  // The roof-module id doubles as the structure's `roof` param value (gable/hip/flat), so
  // a Details roof pick (e.g. flat) flows straight into the seeded shell's massing.
  if (roof) params.roof = roof;
  // The basement-module id rides in as `params.basement`; composeStructure reserves the
  // bottom of the box for it and ladders it to the ground floor (central, per-type-free).
  if (basement && basement !== 'none') params.basement = basement;
  // The surroundings-module id doubles as the structure's `surroundings` param value, so
  // the type insets its massing and delegates the yard ring around it.
  if (surroundings && surroundings !== 'none') params.surroundings = surroundings;
  // The user's per-axis yard scale rides in as a raw param; composeStructure sanitizes it
  // and threads it into the type's house/yard split + the surroundings module delegation.
  if (surroundSizing && surroundings && surroundings !== 'none') params.surroundSizing = surroundSizing;
  // The user's per-floor heights ride in as a raw array param; composeStructure sanitizes
  // them and the type's storey ladder lays its decks at exactly those heights.
  if (floorHeights?.length) params.floorHeights = floorHeights;
  const authoring: AuthoringStructure = {
    DataVersion: 3955,
    size: [W, H, D],
    palette: [{ Name: 'minecraft:air' }],
    ops: [{ op: 'template', name: structureType!, from: [0, 0, 0], to: [W - 1, H - 1, D - 1], params }],
  };

  try {
    // Compile the template → real .nbt → read it back as expanded authoring JSON (the
    // same path the open-file seed uses), so the model sees plain geometry, not a
    // `template` op it might not preserve.
    fs.mkdirSync(dir, { recursive: true });
    const file = path.join(dir, 'shell.nbt');
    await writeStructureFile(authoring, file, { structureType });
    const expanded = await readAuthoring(file);
    // The compiled shell becomes the protected cell set (every solid block): the
    // `preserveShell` compile pass restores any of these the model deletes, so the
    // exterior survives even an emit that carries only furniture. Every seeded shell
    // is locked — a seed that's only context gets ignored (the model "keeps" the
    // exterior by not re-emitting it, and the whole shell vanishes).
    const lockCells = shellLockCells(expanded);
    return { preamble: shellPreamble(JSON.stringify(expanded)), lockCells };
  } catch {
    return { preamble: '' }; // never block generation on a shell-seed failure — fall back to free-form
  }
}

/** Project a compiled shell into its protected cells: every SOLID block, as a
 *  position + palette entry the lock pass can re-intern into the model's palette. */
function shellLockCells(shell: AuthoringStructure): ShellLockCell[] {
  const palette = shell.palette ?? [];
  const cells: ShellLockCell[] = [];
  for (const b of shell.blocks ?? []) {
    const entry = palette[b.state];
    if (!entry || isAir(entry.Name)) continue;
    cells.push({ pos: b.pos, entry });
  }
  return cells;
}
