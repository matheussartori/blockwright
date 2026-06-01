// Mod-workspace lifecycle: detecting a mod's resources root + namespace from a
// chosen folder, and applying it as an extra asset source for resolution.
import fs from 'node:fs';
import path from 'node:path';
import type { Workspace } from '@/shared/types';
import {
  clearJsonCache,
  getActiveWorkspace,
  setActiveWorkspace,
} from './structure/content-pack';
import { clearModelCache } from './structure/model-loader';
import { addRecentWorkspace, removeRecentWorkspace } from './recent-workspaces';
import { notifyRecentWorkspaces, notifyWorkspace, openDirectoryDialog } from './window';

// A picked folder may be the project root (Gradle layout) or the resources dir.
const RESOURCE_CANDIDATES = ['src/main/resources', ''];

/** Inspect a chosen directory for a mod's resources root + asset namespace. */
export function detectWorkspace(dir: string): Workspace | null {
  for (const sub of RESOURCE_CANDIDATES) {
    const root = sub ? path.join(dir, sub) : dir;
    const assets = path.join(root, 'assets');
    if (!fs.existsSync(assets)) continue;
    const namespace = fs
      .readdirSync(assets, { withFileTypes: true })
      .find((e) => e.isDirectory() && e.name !== 'minecraft')?.name;
    if (!namespace) continue;
    return { name: path.basename(dir), root, namespace };
  }
  return null;
}

/** Make `ws` (or null) the active workspace and invalidate cached assets.
 *  Opening one records it in the recent-workspaces list. */
export function applyWorkspace(ws: Workspace | null): void {
  setActiveWorkspace(ws);
  clearJsonCache();
  clearModelCache();
  if (ws) {
    addRecentWorkspace(ws);
    notifyRecentWorkspaces();
  }
  notifyWorkspace();
}

/** Apply a known workspace (from a recents entry or a detected mod), validating
 *  it still exists on disk; a stale entry is dropped and null is returned. */
export function activateWorkspace(ws: Workspace): Workspace | null {
  if (!fs.existsSync(path.join(ws.root, 'assets', ws.namespace))) {
    removeRecentWorkspace(ws.root);
    notifyRecentWorkspaces();
    return null;
  }
  applyWorkspace(ws);
  return ws;
}

/** Detect whether a structure file lives inside a mod project, so opening a
 *  loose `.nbt` can offer to load its workspace. Mod structures sit at
 *  `<resources>/data/<namespace>/structure/...nbt`, with assets in the same root. */
export function detectWorkspaceForFile(filePath: string): Workspace | null {
  const parts = filePath.split(path.sep);
  let idx = -1;
  for (let i = parts.length - 4; i >= 0; i--) {
    if (parts[i] === 'data' && parts[i + 2] === 'structure') {
      idx = i;
      break;
    }
  }
  if (idx < 0) return null;

  const namespace = parts[idx + 1];
  const root = parts.slice(0, idx).join(path.sep);
  // Confirm it's really a mod: the same namespace must own assets, not just data.
  if (!fs.existsSync(path.join(root, 'assets', namespace))) return null;

  // Nicer display name: the project folder, unwrapping the Gradle resources nesting.
  const projectRoot = root.endsWith(path.join('src', 'main', 'resources'))
    ? path.dirname(path.dirname(path.dirname(root)))
    : root;
  return { name: path.basename(projectRoot), root, namespace };
}

/** List the `.nbt` structures a workspace ships under `data/<namespace>/structure`,
 *  sorted by name. Returns absolute paths; empty when there's no workspace/folder. */
export function listWorkspaceStructures(ws: Workspace | null): string[] {
  if (!ws) return [];
  const dir = path.join(ws.root, 'data', ws.namespace, 'structure');
  const out: string[] = [];
  const walk = (d: string): void => {
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(d, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      const full = path.join(d, e.name);
      if (e.isDirectory()) walk(full);
      else if (e.isFile() && e.name.endsWith('.nbt')) out.push(full);
    }
  };
  walk(dir);
  return out.sort((a, b) => a.localeCompare(b));
}

export interface OpenResult {
  workspace: Workspace | null;
  error?: string;
}

/** Prompt for a folder and activate it as a workspace; reports a detection error. */
export async function promptOpenWorkspace(): Promise<OpenResult> {
  const dir = await openDirectoryDialog();
  if (!dir) return { workspace: getActiveWorkspace() }; // canceled — unchanged

  const ws = detectWorkspace(dir);
  if (!ws) {
    return {
      workspace: getActiveWorkspace(),
      error: 'No mod assets found there. Pick a mod project (or its resources folder) that contains assets/<namespace>.',
    };
  }
  applyWorkspace(ws);
  return { workspace: ws };
}
