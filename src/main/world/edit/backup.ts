// Region-granular backups — enforced, not optional (only RETENTION is configurable). Before the
// first byte of a save session touches disk, every file about to be rewritten (block region +
// its `poi/` and `entities/` counterparts) is copied to `<save>/blockwright-backups/<id>/`,
// preserving its path relative to the save root, with a manifest for one-click restore.
// Neither reference tool (Amulet / MCASelector) does this; it's the product claim.
import { promises as fs } from 'node:fs';
import path from 'node:path';

export const BACKUP_DIR = 'blockwright-backups';
const MANIFEST = 'manifest.json';

export interface BackupSet {
  id: string;
  createdMs: number;
  /** Save-root-relative paths of the files in this set. */
  files: string[];
  /** Total size of the backed-up files, in bytes. */
  bytes: number;
}

/** Backup-set id from a timestamp: filesystem-safe, lexicographically time-ordered. */
export function backupIdFor(nowMs: number): string {
  return new Date(nowMs).toISOString().replace(/[:.]/g, '-');
}

/**
 * Copy the given files into a new backup set under the save root.
 *
 * @param root     The save folder.
 * @param absPaths Absolute paths of files to back up; each must live INSIDE the save root
 *   (throws otherwise — a backup that escapes the world folder is a caller bug). Paths that
 *   don't exist are skipped (e.g. a chunk with no `poi/` counterpart).
 * @param nowMs    Timestamp for the set id (defaults to now).
 * @returns The manifest of what was actually copied.
 */
export async function createBackup(root: string, absPaths: string[], nowMs = Date.now()): Promise<BackupSet> {
  const id = backupIdFor(nowMs);
  const dir = path.join(root, BACKUP_DIR, id);
  const files: string[] = [];
  let bytes = 0;
  for (const abs of absPaths) {
    const rel = path.relative(root, abs);
    if (rel.startsWith('..') || path.isAbsolute(rel)) {
      throw new Error(`backup source escapes the save folder: ${abs}`);
    }
    let stat;
    try {
      stat = await fs.stat(abs);
    } catch {
      continue; // absent counterpart (no poi/entities file for this region) — nothing to back up
    }
    const dest = path.join(dir, rel);
    await fs.mkdir(path.dirname(dest), { recursive: true });
    await fs.copyFile(abs, dest);
    files.push(rel);
    bytes += stat.size;
  }
  const set: BackupSet = { id, createdMs: nowMs, files, bytes };
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(path.join(dir, MANIFEST), JSON.stringify(set, null, 2));
  return set;
}

/** Every backup set under the save, newest first. Sets without a readable manifest are skipped. */
export async function listBackups(root: string): Promise<BackupSet[]> {
  const base = path.join(root, BACKUP_DIR);
  let ids: string[];
  try {
    ids = await fs.readdir(base);
  } catch {
    return [];
  }
  const out: BackupSet[] = [];
  for (const id of ids) {
    try {
      const raw = await fs.readFile(path.join(base, id, MANIFEST), 'utf8');
      const set = JSON.parse(raw) as BackupSet;
      if (set && Array.isArray(set.files)) out.push({ ...set, id });
    } catch {
      /* not a valid set — skip */
    }
  }
  out.sort((a, b) => b.createdMs - a.createdMs);
  return out;
}

/**
 * Restore a backup set: copy every file in its manifest back over the save. Files are validated
 * to stay inside the save root. Throws if the set doesn't exist.
 */
export async function restoreBackup(root: string, id: string): Promise<BackupSet> {
  const dir = path.join(root, BACKUP_DIR, id);
  const raw = await fs.readFile(path.join(dir, MANIFEST), 'utf8');
  const set = JSON.parse(raw) as BackupSet;
  for (const rel of set.files) {
    if (rel.startsWith('..') || path.isAbsolute(rel)) throw new Error(`backup manifest entry escapes the save: ${rel}`);
    const src = path.join(dir, rel);
    const dest = path.join(root, rel);
    await fs.mkdir(path.dirname(dest), { recursive: true });
    await fs.copyFile(src, dest);
  }
  return { ...set, id };
}

/** Delete one backup set. */
export async function deleteBackup(root: string, id: string): Promise<void> {
  await fs.rm(path.join(root, BACKUP_DIR, id), { recursive: true, force: true });
}

/** Retention: keep the newest `keep` sets, delete the rest. Returns the ids deleted. */
export async function pruneBackups(root: string, keep: number): Promise<string[]> {
  const sets = await listBackups(root);
  const excess = sets.slice(Math.max(0, keep));
  for (const set of excess) await deleteBackup(root, set.id);
  return excess.map((s) => s.id);
}
