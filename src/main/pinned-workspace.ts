// The PINNED workspace: one Workspace record persisted in userData that
// auto-activates at every launch, until the user unpins it, pins another, or
// closes the workspace. Mirrors recent-workspaces.ts' storage pattern but holds
// a single entry — the "I'm living in this mod for a while" convenience.
import { app } from 'electron';
import fs from 'node:fs';
import path from 'node:path';
import type { Workspace } from '@/shared/types';

let cache: Workspace | null | undefined;

function storeFile(): string {
  return path.join(app.getPath('userData'), 'pinned-workspace.json');
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

export function getPinnedWorkspace(): Workspace | null {
  if (cache !== undefined) return cache;
  try {
    const data = JSON.parse(fs.readFileSync(storeFile(), 'utf8'));
    cache = isWorkspace(data) ? { ...data, minecraftVersion: data.minecraftVersion ?? null } : null;
  } catch {
    cache = null;
  }
  return cache;
}

/** Persist `ws` as the pinned workspace (null unpins). Returns the new value. */
export function setPinnedWorkspace(ws: Workspace | null): Workspace | null {
  cache = ws;
  try {
    if (ws) fs.writeFileSync(storeFile(), JSON.stringify(ws, null, 2));
    else fs.rmSync(storeFile(), { force: true });
  } catch {
    // Best-effort: a failed write just means the pin won't survive a restart.
  }
  return cache;
}
