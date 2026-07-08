// The user's browsable structure library. The emit→render→review loop writes
// churny `vN.nbt` versions to a hidden scratch dir (see session.ts); on top of
// that we mirror each session's build into ONE nicely-named FOLDER here, so the
// library reads as a project per build, not a soup of files:
//
//   <outputDir>/
//     cozy-oak-cottage/
//       cozy-oak-cottage.nbt   ← the latest clean build (folder basename)
//       generation.log         ← that build's AI play-by-play (see gen-log.ts)
//       versions/
//         v1.nbt  v2.nbt  …    ← every emitted version, kept
//
// The root folder is user-configurable in Settings ▸ AI; default is `Blockwright`
// under the OS Documents dir. Persisted as a tiny JSON in userData (cf. recents.ts);
// `BW_OUTPUT_DIR` overrides.
import { app } from 'electron';
import { randomBytes } from 'node:crypto';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { getLibraryRetention } from './credentials';

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

/** A session's reserved library folder: the per-build dir (`<outputDir>/<slug>/`)
 *  and the latest clean file inside it (`<dir>/<slug>.nbt`). Both `null` when the
 *  folder couldn't be created (so the session doesn't keep retrying). */
export interface LibraryMirror {
  /** The per-build folder, or null if it couldn't be created. */
  dir: string | null;
  /** The latest clean `<slug>.nbt` inside `dir`, or null. */
  latest: string | null;
}

/** Pick a `<slug>-<id>/` folder in the library root (the prompt slug plus a short
 *  random id, so the folder is unique-by-construction and reads like a project name
 *  — `haunted-house-4-floors-a3f9c1`), creating it and its `versions/` subdir.
 *  Stable per session: the caller stores the result and reuses it so later versions
 *  add to the same folder. Returns `{dir:null}` if the folder can't be created. */
export function reserveLibraryDir(slug: string): LibraryMirror {
  const root = getOutputDir();
  try {
    fs.mkdirSync(root, { recursive: true });
    // Append a 6-char random id for a collision-free, readable folder name; loop
    // only on the astronomically unlikely clash.
    let name = `${slug}-${randomBytes(3).toString('hex')}`;
    while (fs.existsSync(path.join(root, name))) name = `${slug}-${randomBytes(3).toString('hex')}`;
    const dir = path.join(root, name);
    fs.mkdirSync(path.join(dir, 'versions'), { recursive: true });
    return { dir, latest: path.join(dir, `${name}.nbt`) };
  } catch {
    return { dir: null, latest: null };
  }
}

/**
 * Best-effort mirror of a freshly-compiled version into the user's library folder:
 * copies the scratch `vN.nbt` to `<dir>/versions/vN.nbt` (kept) AND overwrites the
 * latest clean `<dir>/<slug>.nbt`. The scratch `vN.nbt` stays the source of truth,
 * so a failed copy never aborts generation.
 *
 * @param mirror - The session's reserved folder: `undefined` to reserve one from the
 *   prompt slug on this first call, otherwise the stored {@link LibraryMirror} to add to
 *   (a `dir:null` mirror means a prior reservation failed — don't retry).
 * @param prompt - The user's prompt, slugified into the folder name on first use.
 * @param nbtPath - The scratch `vN.nbt` to copy into the library.
 * @param version - The version number (names the kept `versions/vN.nbt`).
 * @returns The {@link LibraryMirror} to persist back on the session — never `undefined`,
 *   so the folder is reserved at most once per session.
 */
export async function mirrorToLibrary(
  mirror: LibraryMirror | undefined,
  prompt: string,
  nbtPath: string,
  version: number,
): Promise<LibraryMirror> {
  const target = mirror === undefined ? reserveLibraryDir(slugify(prompt)) : mirror;
  if (target.dir && target.latest) {
    try {
      await fsp.copyFile(nbtPath, path.join(target.dir, 'versions', `v${version}.nbt`));
      await fsp.copyFile(nbtPath, target.latest);
      pruneLibraryVersions(path.join(target.dir, 'versions'), getLibraryRetention());
    } catch {
      /* library mirror failed — keep going on the scratch version */
    }
  }
  return target;
}

/** Library retention (Settings ▸ AI): keep only the newest `keep` `vN.nbt`s in a
 *  build's `versions/` folder (0 = keep all). Best-effort, sorted by version number. */
function pruneLibraryVersions(versionsDir: string, keep: number): void {
  if (keep <= 0) return;
  try {
    const versions = fs
      .readdirSync(versionsDir)
      .map((name) => ({ name, n: Number(/^v(\d+)\.nbt$/.exec(name)?.[1] ?? NaN) }))
      .filter((v) => Number.isFinite(v.n))
      .sort((a, b) => b.n - a.n);
    for (const v of versions.slice(keep)) fs.rmSync(path.join(versionsDir, v.name), { force: true });
  } catch {
    /* best-effort — retention never breaks a run */
  }
}
