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
import { notifyWorkspace, openDirectoryDialog } from './window';

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

/** Make `ws` (or null) the active workspace and invalidate cached assets. */
export function applyWorkspace(ws: Workspace | null): void {
  setActiveWorkspace(ws);
  clearJsonCache();
  clearModelCache();
  notifyWorkspace();
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
