// Filesystem layer for assets, resolved per namespace across two roots: the
// bundled vanilla content pack (the "minecraft" namespace) and, when one is
// open, a mod workspace that supplies its own namespace (e.g. "theplacebeyond").
import { app } from 'electron';
import fs from 'node:fs';
import path from 'node:path';
import type { Workspace } from '@/shared/types';
import { detectMcVersion } from '../mc-version-detect';

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

/** The Minecraft version of the active content pack, read from its `version.json`
 *  (or `pack.mcmeta` format). Loose vanilla files are gated on this rather than a
 *  hardcoded version, so pointing BW_CONTENT at another extraction Just Works. */
export function contentPackVersion(): string | null {
  return detectMcVersion(contentDir());
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

// A block ID is valid iff the content pack has a blockstate JSON for it (every
// placeable block has one). Namespace-aware like assets: `minecraft:` resolves in
// the vanilla pack, a mod namespace in the active workspace. Cached so repeated
// validation of the same palette is cheap.
const knownBlockCache = new Map<string, boolean>();

/** Whether `name` (`[namespace:]id`) is a real block in the resolvable content. */
export function isKnownBlock(name: string): boolean {
  const colon = name.indexOf(':');
  const namespace = colon >= 0 ? name.slice(0, colon) : 'minecraft';
  const id = colon >= 0 ? name.slice(colon + 1) : name;
  const key = `${namespace}:${id}`;
  const hit = knownBlockCache.get(key);
  if (hit !== undefined) return hit;
  const ok = fs.existsSync(path.join(assetsDir(namespace), 'blockstates', `${id}.json`));
  knownBlockCache.set(key, ok);
  return ok;
}

/** The subset of `names` that aren't real blocks (typos / wrong variant), deduped
 *  in input order — so the generator can reject them with actionable feedback
 *  instead of shipping a flat fallback-coloured block that's missing in-game. */
export function unknownBlockIds(names: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const name of names) {
    if (seen.has(name) || isKnownBlock(name)) continue;
    seen.add(name);
    out.push(name);
  }
  return out;
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
  knownBlockCache.clear(); // a workspace change adds/removes valid block IDs
}
