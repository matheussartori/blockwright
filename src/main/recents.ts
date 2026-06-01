// Persistent "recently opened" list, capped at MAX_RECENTS and stored as JSON
// in the app's userData dir. Most-recent first; paths are de-duplicated.
import { app } from 'electron';
import fs from 'node:fs';
import path from 'node:path';

const MAX_RECENTS = 10;
let cache: string[] | null = null;

function storeFile(): string {
  return path.join(app.getPath('userData'), 'recent-files.json');
}

export function getRecents(): string[] {
  if (cache) return cache;
  try {
    const data = JSON.parse(fs.readFileSync(storeFile(), 'utf8'));
    cache = Array.isArray(data) ? data.filter((p) => typeof p === 'string') : [];
  } catch {
    cache = [];
  }
  return cache;
}

function persist(list: string[]): string[] {
  cache = list.slice(0, MAX_RECENTS);
  try {
    fs.writeFileSync(storeFile(), JSON.stringify(cache, null, 2));
  } catch {
    // Best-effort: a failed write just means recents won't survive a restart.
  }
  return cache;
}

/** Move `filePath` to the front of the list (adding it if new). */
export function addRecent(filePath: string): string[] {
  return persist([filePath, ...getRecents().filter((p) => p !== filePath)]);
}

export function removeRecent(filePath: string): string[] {
  return persist(getRecents().filter((p) => p !== filePath));
}

export function clearRecents(): string[] {
  return persist([]);
}
