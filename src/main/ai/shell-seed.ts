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
import type { AuthoringStructure } from '../structure/authoring/types';
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
  /** The selected exterior-style id, threaded into the template so a seeded shell also
   *  carries the chosen finish's skin. (It does NOT force a seed — that's `seedShell`.) */
  exterior?: string;
}

/**
 * Build the starting-shell seed preamble for a fresh build, or '' when the selected
 * structure type doesn't opt into shell-seeding (so the caller falls back to free-form).
 *
 * @param opts - The {@link ShellSeedOptions} (structure/decoration/size/roof/exterior).
 * @param dir - A scratch dir to compile the shell into (the session dir).
 * @returns The {@link shellPreamble} wrapping the compiled shell's authoring JSON, or ''.
 */
export async function buildShellSeed(opts: ShellSeedOptions, dir: string): Promise<string> {
  const { structureType, decoration, size, roof, exterior } = opts;
  const type = structureType ? getStructureType(structureType) : undefined;
  if (!type?.seedShell) return '';

  const [W, H, D] = size ?? DEFAULT_SIZE;
  const params: Record<string, unknown> = {};
  if (decoration) params.decoration = decoration;
  // The roof-module id doubles as the structure's `roof` param value (gable/hip/flat), so
  // a Details roof pick (e.g. flat) flows straight into the seeded shell's massing.
  if (roof) params.roof = roof;
  if (exterior) params.exterior = exterior;
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
    return shellPreamble(JSON.stringify(expanded));
  } catch {
    return ''; // never block generation on a shell-seed failure — fall back to free-form
  }
}
