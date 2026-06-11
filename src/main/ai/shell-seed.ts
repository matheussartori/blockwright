// The code-built STARTING SHELL seed. Some archetypes have a silhouette the model can't
// reliably invent from prose alone (the modern villa: flat roofs, stacked offset volumes,
// glass curtain walls, a pool; the farmhouse: an L plan + cross-gable + wraparound veranda).
// For those, a FRESH build is seeded with the structure type's OWN compiled geometry — the
// model then keeps that exterior and only furnishes / details it (see `shellPreamble`).
// Gated by the structure type's `seedShell` flag, so a plain house stays free-form and only
// an opted-in type stamps a starting shell.
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
}

/** The result of {@link buildShellSeed}: the model-facing preamble plus — for a
 *  `lockShell` type only — the protected shell cells the compile pass re-asserts. */
export interface ShellSeed {
  /** The {@link shellPreamble} wrapping the compiled shell's authoring JSON, or ''. */
  preamble: string;
  /** The solid shell cells to LOCK against deletion (only for a `lockShell` type, else
   *  undefined → no lock). Threaded into every emit's compile as `CompileOptions.lockCells`. */
  lockCells?: ShellLockCell[];
}

/**
 * Build the starting-shell seed for a fresh build, or an empty preamble when the selected
 * structure type doesn't opt into shell-seeding (so the caller falls back to free-form).
 *
 * @param opts - The {@link ShellSeedOptions} (structure/decoration/size/roof).
 * @param dir - A scratch dir to compile the shell into (the session dir).
 * @returns A {@link ShellSeed}: the preamble, plus the lock cells for a `lockShell` type.
 */
export async function buildShellSeed(opts: ShellSeedOptions, dir: string): Promise<ShellSeed> {
  const { structureType, decoration, size, roof } = opts;
  const type = structureType ? getStructureType(structureType) : undefined;
  if (!type?.seedShell) return { preamble: '' };

  const [W, H, D] = size ?? DEFAULT_SIZE;
  const params: Record<string, unknown> = {};
  if (decoration) params.decoration = decoration;
  // The roof-module id doubles as the structure's `roof` param value (gable/hip/flat), so
  // a Details roof pick (e.g. flat) flows straight into the seeded shell's massing.
  if (roof) params.roof = roof;
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
    // A LOCKED type's compiled shell becomes the protected cell set (every solid block):
    // the compile pass restores any of these the model deletes, so the exterior survives.
    const lockCells = type.lockShell ? shellLockCells(expanded) : undefined;
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
