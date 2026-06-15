// Where the Minecraft content pack lives on disk. Blockwright does NOT ship the
// vanilla assets (Mojang's EULA covers their redistribution), so the user points
// it at their OWN extraction — typically the `assets`/`data` they unpacked from a
// Minecraft version jar, or any folder laid out like a content pack. The choice is
// persisted as a tiny JSON in userData (cf. output-dir.ts); `BW_CONTENT` overrides.
//
// Resolution order: `BW_CONTENT` env → the user's saved folder → (dev only) the
// repo's own `content/` if present → none. With no pack, asset lookups simply miss
// and blocks render as deterministic flat colors (fallback-color.ts).
import { app } from 'electron';
import fs from 'node:fs';
import path from 'node:path';

let cache: string | null | undefined; // undefined = not loaded; null = explicitly none.

function storeFile(): string {
  return path.join(app.getPath('userData'), 'content-dir.json');
}

/** A non-existent sentinel path for "no content pack configured", so callers that
 *  build `<dir>/assets/...` paths get an absolute path that simply fails existsSync
 *  (never a stray relative lookup against the cwd). */
function noContentSentinel(): string {
  return path.join(app.getPath('userData'), '__no_content__');
}

/** The repo's bundled content pack — only used in dev (it isn't shipped). */
function devRepoContent(): string | null {
  if (app.isPackaged) return null;
  for (const c of [path.join(app.getAppPath(), 'content'), path.join(process.cwd(), 'content')]) {
    if (fs.existsSync(c)) return c;
  }
  return null;
}

/** The configured content-pack folder, or null if none is set/available. */
export function getContentDir(): string | null {
  if (process.env.BW_CONTENT) return process.env.BW_CONTENT;
  if (cache !== undefined) return cache ?? devRepoContent();
  try {
    const data = JSON.parse(fs.readFileSync(storeFile(), 'utf8')) as { dir?: unknown };
    if (data && typeof data.dir === 'string' && data.dir) return (cache = data.dir);
  } catch {
    /* not set yet */
  }
  cache = null;
  return devRepoContent();
}

/** Persist the user's chosen content-pack folder. Returns the stored path. */
export function setContentDir(dir: string): string {
  cache = dir;
  try {
    fs.writeFileSync(storeFile(), JSON.stringify({ dir }, null, 2));
  } catch {
    // Best-effort: a failed write just means the choice won't survive a restart.
  }
  return dir;
}

/** The folder all asset roots resolve under: the configured pack, or a sentinel
 *  non-existent path when none is set (so lookups miss cleanly). */
export function resolvedContentDir(): string {
  return getContentDir() ?? noContentSentinel();
}

/** Whether a usable content pack is configured (its `assets/minecraft` exists). */
export function hasContentPack(): boolean {
  const dir = getContentDir();
  return !!dir && fs.existsSync(path.join(dir, 'assets', 'minecraft'));
}
