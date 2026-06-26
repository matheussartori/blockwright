// Rename a generated project IN PLACE: a library build lands in one nicely-named
// FOLDER (see output-dir.ts) — `<slug>-<id>/` holding `<slug>-<id>.nbt`, a
// `generation.log` and `versions/vN.nbt`. The folder + main file inherit a slug
// from the prompt, which often reads like a Claude suggestion; this lets the user
// give the project a clean name BEFORE exporting (the export dialogs seed their
// filename from this `.nbt`'s basename), without leaving the app.
//
// We rename the folder and the latest `<name>.nbt` inside it; the kept versions and
// the log keep their (name-free) filenames and ride along inside the renamed folder.
import fs from 'node:fs';
import path from 'node:path';
import type { RenameProjectResult } from '@/shared/types';

// Characters Windows/macOS reject in a path segment. Kept as a RegExp constant so the
// (escaped backslash) class is declared once and stays readable.
const ILLEGAL_PATH_CHARS = /[\\/:*?"<>|]/g;

/** Turn a user-typed name into a safe, readable folder/file stem: keep letters,
 *  digits, spaces and the gentle punctuation a project name wants, but strip the
 *  filesystem-illegal characters and any trailing dots/spaces Windows rejects.
 *  Unlike `sanitizeResourceName` this keeps case + spaces — it's a human-facing
 *  library folder, not a Minecraft id. */
export function sanitizeProjectName(name: string): string {
  return name
    .replace(ILLEGAL_PATH_CHARS, ' ')
    .replace(/\s+/g, ' ') // collapse whitespace (incl. tabs/newlines)
    .trim()
    .replace(/[. ]+$/g, '') // no trailing dot/space (Windows)
    .slice(0, 64)
    .trim();
}

/** A folder is a Blockwright project iff it directly holds the file being renamed
 *  and the library layout's tell-tales (a `versions/` subdir or a `generation.log`).
 *  This gate keeps the rename from ever touching an arbitrary user folder, wherever
 *  the (re-configurable) library root lives. */
function looksLikeProject(dir: string, file: string): boolean {
  if (!fs.existsSync(file)) return false;
  return fs.existsSync(path.join(dir, 'versions')) || fs.existsSync(path.join(dir, 'generation.log'));
}

/**
 * Rename the project that owns `currentFile` (its library `<name>.nbt`).
 *
 * @param currentFile - The project's latest `.nbt`, i.e. `<projectDir>/<stem>.nbt`.
 * @param newName - The user's desired name; sanitized for the filesystem.
 * @returns On success, the new folder + `.nbt` path + sanitized name; otherwise a
 *   reason. Refuses if the name is empty, the target already exists, or the folder
 *   doesn't look like a Blockwright project (never renames an arbitrary directory).
 */
export function renameProject(currentFile: string, newName: string): RenameProjectResult {
  const safe = sanitizeProjectName(newName);
  if (!safe) return { ok: false, error: 'Please enter a project name.' };

  const oldDir = path.dirname(currentFile);
  const oldStem = path.basename(currentFile).replace(/\.nbt$/i, '');
  if (!looksLikeProject(oldDir, currentFile)) {
    return { ok: false, error: 'This file is not a Blockwright project that can be renamed.' };
  }

  try {
    const parent = path.dirname(oldDir);
    let dir = oldDir;
    // Rename the folder unless the name is unchanged (only a case/whitespace tweak on
    // a case-insensitive FS still resolves to the same path → skip the folder move).
    if (path.basename(oldDir) !== safe) {
      const target = path.join(parent, safe);
      if (path.resolve(target) !== path.resolve(oldDir) && fs.existsSync(target)) {
        return { ok: false, error: `A project named “${safe}” already exists.` };
      }
      fs.renameSync(oldDir, target);
      dir = target;
    }
    // Rename the latest `<oldStem>.nbt` → `<safe>.nbt` inside the (possibly moved) folder.
    const oldFile = path.join(dir, `${oldStem}.nbt`);
    const file = path.join(dir, `${safe}.nbt`);
    if (oldStem !== safe && fs.existsSync(oldFile)) fs.renameSync(oldFile, file);

    return { ok: true, dir, file, name: safe };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}
