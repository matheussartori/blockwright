// Filesystem layer for assets, resolved per namespace across two roots: the
// bundled vanilla content pack (the "minecraft" namespace) and, when one is
// open, a mod workspace that supplies its own namespace (e.g. "theplacebeyond").
import { app } from 'electron';
import fs from 'node:fs';
import path from 'node:path';
import type { Workspace } from '@/shared/types';

let activeWorkspace: Workspace | null = null;

export function setActiveWorkspace(ws: Workspace | null): void {
  activeWorkspace = ws;
}

export function getActiveWorkspace(): Workspace | null {
  return activeWorkspace;
}

/** Locate the content pack: an explicit override, bundled resource, or repo root. */
export function contentDir(): string {
  if (process.env.BW_CONTENT) return process.env.BW_CONTENT;
  const candidates = app.isPackaged
    ? [path.join(process.resourcesPath, 'content')]
    : [
        path.join(app.getAppPath(), 'content'),
        path.join(process.cwd(), 'content'),
      ];
  return candidates.find((c) => fs.existsSync(c)) ?? candidates[0];
}

/** The resources root that owns a namespace: the workspace for its own namespace,
 *  otherwise the bundled content pack. */
function rootFor(namespace: string): string {
  if (activeWorkspace && namespace === activeWorkspace.namespace) {
    return activeWorkspace.root;
  }
  return contentDir();
}

export function assetsDir(namespace = 'minecraft'): string {
  return path.join(rootFor(namespace), 'assets', namespace);
}

/** The `data/<namespace>` dir owning a namespace (workspace for its own, else
 *  the bundled pack) — where worldgen pools and structures live. */
export function dataDir(namespace = 'minecraft'): string {
  return path.join(rootFor(namespace), 'data', namespace);
}

export function texturesDir(namespace = 'minecraft'): string {
  return path.join(assetsDir(namespace), 'textures');
}

/** Resolve a "namespace/path" texture key to its file + the root it must stay within. */
export function resolveTextureFile(key: string): { file: string; root: string } | null {
  const slash = key.indexOf('/');
  if (slash < 0) return null;
  const namespace = key.slice(0, slash);
  const rest = key.slice(slash + 1);
  const root = texturesDir(namespace);
  return { file: path.join(root, `${rest}.png`), root };
}

export function hasContent(): boolean {
  return fs.existsSync(path.join(assetsDir('minecraft'), 'blockstates'));
}

// --- JSON loading with a small cache -----------------------------------------

const jsonCache = new Map<string, unknown>();

export function loadJson(file: string): unknown {
  if (jsonCache.has(file)) return jsonCache.get(file);
  let data: unknown;
  try {
    data = JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    data = null;
  }
  jsonCache.set(file, data);
  return data;
}

export function clearJsonCache(): void {
  jsonCache.clear();
}
