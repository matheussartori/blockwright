// Persistent "recently opened worlds" list, capped and stored as JSON in userData. Mirrors
// recent-workspaces.ts but holds WorldRef records (folder + name), de-duplicated by root path.
import { app } from 'electron';
import fs from 'node:fs';
import path from 'node:path';
import type { WorldRef } from '@/shared/types';

const MAX = 10;
let cache: WorldRef[] | null = null;

function storeFile(): string {
  return path.join(app.getPath('userData'), 'recent-worlds.json');
}

function isWorldRef(w: unknown): w is WorldRef {
  return !!w && typeof w === 'object' && typeof (w as WorldRef).root === 'string' && typeof (w as WorldRef).name === 'string';
}

export function getRecentWorlds(): WorldRef[] {
  if (cache) return cache;
  try {
    const data = JSON.parse(fs.readFileSync(storeFile(), 'utf8'));
    cache = Array.isArray(data) ? data.filter(isWorldRef) : [];
  } catch {
    cache = [];
  }
  return cache;
}

function persist(list: WorldRef[]): WorldRef[] {
  cache = list.slice(0, MAX);
  try {
    fs.writeFileSync(storeFile(), JSON.stringify(cache, null, 2));
  } catch {
    // Best-effort: a failed write just means recents won't survive a restart.
  }
  return cache;
}

/** Move `world` to the front of the list (replacing any entry with the same root). */
export function addRecentWorld(world: WorldRef): WorldRef[] {
  return persist([world, ...getRecentWorlds().filter((w) => w.root !== world.root)]);
}

export function removeRecentWorld(root: string): WorldRef[] {
  return persist(getRecentWorlds().filter((w) => w.root !== root));
}

export function clearRecentWorlds(): WorldRef[] {
  return persist([]);
}
