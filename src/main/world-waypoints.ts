// Persistent per-world camera waypoints, stored as one JSON map in userData keyed by the
// world's root path (its own store rather than a field on recent-worlds — waypoints must
// survive a world falling off the capped recents list). The renderer owns the edit UX and
// round-trips the whole list per world; main just persists it.
import { app } from 'electron';
import fs from 'node:fs';
import path from 'node:path';
import type { WorldWaypoint } from '@/shared/types';

let cache: Record<string, WorldWaypoint[]> | null = null;

function storeFile(): string {
  return path.join(app.getPath('userData'), 'world-waypoints.json');
}

function isWaypoint(w: unknown): w is WorldWaypoint {
  if (!w || typeof w !== 'object') return false;
  const wp = w as WorldWaypoint;
  return (
    typeof wp.name === 'string' &&
    typeof wp.dimension === 'string' &&
    Array.isArray(wp.pos) &&
    wp.pos.length === 3 &&
    wp.pos.every((n) => typeof n === 'number')
  );
}

function load(): Record<string, WorldWaypoint[]> {
  if (cache) return cache;
  try {
    const data = JSON.parse(fs.readFileSync(storeFile(), 'utf8')) as Record<string, unknown>;
    cache = {};
    for (const [root, list] of Object.entries(data)) {
      if (Array.isArray(list)) cache[root] = list.filter(isWaypoint);
    }
  } catch {
    cache = {};
  }
  return cache;
}

export function getWorldWaypoints(root: string): WorldWaypoint[] {
  return load()[root] ?? [];
}

/** Replace a world's waypoint list (an empty list removes the world's record). */
export function setWorldWaypoints(root: string, waypoints: WorldWaypoint[]): WorldWaypoint[] {
  const all = load();
  const clean = waypoints.filter(isWaypoint);
  if (clean.length) all[root] = clean;
  else delete all[root];
  try {
    fs.writeFileSync(storeFile(), JSON.stringify(all, null, 2));
  } catch {
    // Best-effort: a failed write just means waypoints won't survive a restart.
  }
  return clean;
}
