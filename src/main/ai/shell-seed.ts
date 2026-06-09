// The code-built STARTING SHELL seed. Some archetypes have a silhouette the model can't
// reliably invent from prose alone (the modern villa: flat roofs, stacked offset volumes,
// glass curtain walls, a pool). For those, a FRESH build is seeded with the structure
// type's OWN compiled geometry — the model then keeps that exterior and only furnishes /
// details it (see `shellPreamble`). Gated by the structure type's `seedShell` flag, so the
// house stays free-form and only an opted-in type stamps a starting shell.
import fs from 'node:fs';
import path from 'node:path';
import { getStructureType } from '../structure/domain';
import { readAuthoring, writeStructureFile } from '../structure/authoring';
import type { AuthoringStructure } from '../structure/authoring/types';
import { shellPreamble } from './seed';

/** A sensible default shell box when the user didn't pick an explicit size. */
const DEFAULT_SIZE: [number, number, number] = [15, 13, 13];

/**
 * Build the starting-shell seed preamble for a fresh build, or '' when the selected
 * structure type doesn't opt into shell-seeding (so the caller falls back to free-form).
 *
 * @param structureType - The selected structure-type id (undefined → no seed).
 * @param decoration - The selected decoration id (the shell's materials); defaults to the
 *   type's own kit when omitted.
 * @param size - The build box [W, H, D] (defaults to {@link DEFAULT_SIZE} when omitted).
 * @param dir - A scratch dir to compile the shell into (the session dir).
 * @param roof - The selected roof-module id (e.g. `'flat'`), threaded into the shell so the
 *   seeded silhouette honours the Details roof pick. Omit → the type's default roof.
 * @returns The {@link shellPreamble} wrapping the compiled shell's authoring JSON, or ''.
 */
export async function buildShellSeed(
  structureType: string | undefined,
  decoration: string | undefined,
  size: [number, number, number] | undefined,
  dir: string,
  roof?: string,
): Promise<string> {
  const type = structureType ? getStructureType(structureType) : undefined;
  if (!type?.seedShell) return '';

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
    return shellPreamble(JSON.stringify(expanded));
  } catch {
    return ''; // never block generation on a shell-seed failure — fall back to free-form
  }
}
