// The user's browsable structure library. The emit→render→review loop writes
// churny `vN.nbt` versions to a hidden scratch dir (see session.ts); on top of
// that we mirror each session's current build to ONE nicely-named file here
// (`<slug-from-prompt>.nbt`), so opening the folder shows a real library —
// `cozy-cottage.nbt`, not `v7.nbt`. The folder is user-configurable in
// Settings ▸ AI; default is `Blockwright` under the OS Documents dir. Persisted
// as a tiny JSON in userData (cf. recents.ts); `BW_OUTPUT_DIR` overrides.
import { app } from 'electron';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';

let cache: string | null = null;

function storeFile(): string {
  return path.join(app.getPath('userData'), 'output-dir.json');
}

/** The default library folder: `Blockwright` under the OS Documents dir. */
export function defaultOutputDir(): string {
  return path.join(app.getPath('documents'), 'Blockwright');
}

/** The configured (or default) folder where finished structures are saved. */
export function getOutputDir(): string {
  if (cache) return cache;
  if (process.env.BW_OUTPUT_DIR) return (cache = process.env.BW_OUTPUT_DIR);
  try {
    const data = JSON.parse(fs.readFileSync(storeFile(), 'utf8'));
    if (data && typeof data.dir === 'string' && data.dir) return (cache = data.dir);
  } catch {
    /* not set yet — fall through to the default */
  }
  return (cache = defaultOutputDir());
}

/** Persist a new library folder. Returns the stored path. */
export function setOutputDir(dir: string): string {
  cache = dir;
  try {
    fs.writeFileSync(storeFile(), JSON.stringify({ dir }, null, 2));
  } catch {
    // Best-effort: a failed write just means the choice won't survive a restart.
  }
  return dir;
}

// Filler words stripped so the slug captures the subject, not the request verbs.
const STOPWORDS = new Set([
  'a', 'an', 'the', 'with', 'and', 'of', 'for', 'to', 'in', 'on', 'me',
  'make', 'build', 'create', 'generate', 'please', 'some', 'small', 'big',
]);

/** Turn a prompt into a safe, readable file stem (`Build me a cozy oak cottage`
 *  → `cozy-oak-cottage`). Empty/garbage input falls back to `structure`. */
export function slugify(prompt: string): string {
  const words = prompt
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .split(/\s+/)
    .filter((w) => w && !STOPWORDS.has(w));
  const slug = words.slice(0, 5).join('-').slice(0, 48).replace(/-+$/g, '');
  return slug || 'structure';
}

/** Pick a free `<slug>.nbt` (then `-2`, `-3`, …) in the library folder, creating
 *  the folder if needed. Stable per session: the caller stores the result and
 *  reuses it so later versions overwrite the same file. Returns null if the
 *  folder can't be created. */
export function reserveLibraryPath(slug: string): string | null {
  const dir = getOutputDir();
  try {
    fs.mkdirSync(dir, { recursive: true });
  } catch {
    return null;
  }
  let candidate = path.join(dir, `${slug}.nbt`);
  for (let n = 2; fs.existsSync(candidate); n++) candidate = path.join(dir, `${slug}-${n}.nbt`);
  return candidate;
}

/**
 * Best-effort mirror of a freshly-compiled version into the user's library as one
 * clean `<slug>.nbt` file. The scratch `vN.nbt` stays the source of truth, so a
 * failed copy never aborts generation.
 *
 * @param libraryPath - The session's current library path: `undefined` to reserve one
 *   from the prompt slug on this first call, a string to overwrite, or `null` when a
 *   prior reservation failed (don't retry).
 * @param prompt - The user's prompt, slugified into the library filename on first use.
 * @param nbtPath - The scratch `vN.nbt` to copy into the library.
 * @returns The library path to persist back on the session (a string once reserved, or
 *   `null` if the folder couldn't be created) — never `undefined`, so the slug is
 *   reserved at most once per session.
 */
export async function mirrorToLibrary(
  libraryPath: string | null | undefined,
  prompt: string,
  nbtPath: string,
): Promise<string | null> {
  const target = libraryPath === undefined ? reserveLibraryPath(slugify(prompt)) : libraryPath;
  if (target) {
    try {
      await fsp.copyFile(nbtPath, target);
    } catch {
      /* library mirror failed — keep going on the scratch version */
    }
  }
  return target;
}
