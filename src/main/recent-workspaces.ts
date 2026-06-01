// Persistent "recently opened workspaces" list, capped and stored as JSON in the
// app's userData dir. Mirrors recents.ts but holds whole Workspace records (so
// they can be reopened without re-picking) de-duplicated by their root path.
import { app } from 'electron';
import fs from 'node:fs';
import path from 'node:path';
import type { Workspace } from '@/shared/types';

const MAX = 10;
let cache: Workspace[] | null = null;

function storeFile(): string {
  return path.join(app.getPath('userData'), 'recent-workspaces.json');
}

function isWorkspace(w: unknown): w is Workspace {
  return (
    !!w &&
    typeof w === 'object' &&
    typeof (w as Workspace).name === 'string' &&
    typeof (w as Workspace).root === 'string' &&
    typeof (w as Workspace).namespace === 'string'
  );
}

export function getRecentWorkspaces(): Workspace[] {
  if (cache) return cache;
  try {
    const data = JSON.parse(fs.readFileSync(storeFile(), 'utf8'));
    cache = Array.isArray(data) ? data.filter(isWorkspace) : [];
  } catch {
    cache = [];
  }
  return cache;
}

function persist(list: Workspace[]): Workspace[] {
  cache = list.slice(0, MAX);
  try {
    fs.writeFileSync(storeFile(), JSON.stringify(cache, null, 2));
  } catch {
    // Best-effort: a failed write just means recents won't survive a restart.
  }
  return cache;
}

/** Move `ws` to the front of the list (replacing any entry with the same root). */
export function addRecentWorkspace(ws: Workspace): Workspace[] {
  return persist([ws, ...getRecentWorkspaces().filter((w) => w.root !== ws.root)]);
}

export function removeRecentWorkspace(root: string): Workspace[] {
  return persist(getRecentWorkspaces().filter((w) => w.root !== root));
}

export function clearRecentWorkspaces(): Workspace[] {
  return persist([]);
}
