// Filesystem layer for assets, resolved per namespace across two roots: the
// bundled vanilla content pack (the "minecraft" namespace) and, when one is
// open, a mod workspace that supplies its own namespace (e.g. "theplacebeyond").
import fs from 'node:fs';
import path from 'node:path';
import type { Workspace } from '@/shared/types';
import { detectMcVersion } from '../../mc-version-detect';
import { resolvedContentDir } from './content-dir';

let activeWorkspace: Workspace | null = null;

/** Set the active mod workspace (the asset source for its own namespace). Callers
 *  clear the model/JSON caches separately so stale resolutions don't linger. */
export function setActiveWorkspace(ws: Workspace | null): void {
  activeWorkspace = ws;
}

export function getActiveWorkspace(): Workspace | null {
  return activeWorkspace;
}

/** The content pack's root folder, resolved from the user's configuration
 *  (see content-dir.ts). The vanilla pack is NOT shipped — the user points
 *  Blockwright at their own extraction — so this can be a non-existent sentinel
 *  when none is set, and asset lookups then miss into the flat-color fallback. */
export function contentDir(): string {
  return resolvedContentDir();
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

/** The `assets/<namespace>` dir owning a namespace (workspace for its own, else
 *  the bundled pack) — where models, textures and blockstates live. */
export function assetsDir(namespace = 'minecraft'): string {
  return path.join(rootFor(namespace), 'assets', namespace);
}

/** The `data/<namespace>` dir owning a namespace (workspace for its own, else
 *  the bundled pack) — where worldgen pools and structures live. */
export function dataDir(namespace = 'minecraft'): string {
  return path.join(rootFor(namespace), 'data', namespace);
}

/** The `textures` dir for a namespace (under its assetsDir). */
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

/** Whether a usable vanilla content pack is present (probes for its blockstates dir);
 *  resolution falls back to flat colors when false. */
export function hasContent(): boolean {
  return fs.existsSync(path.join(assetsDir('minecraft'), 'blockstates'));
}

// A block ID is valid iff the content pack has a blockstate JSON for it (every
// placeable block has one). Namespace-aware like assets: `minecraft:` resolves in
// the vanilla pack, a mod namespace in the active workspace. Cached so repeated
// validation of the same palette is cheap.
const knownBlockCache = new Map<string, boolean>();

/** Whether a namespace's blocks can be VERIFIED — i.e. its `blockstates` dir exists. When it
 *  doesn't (no content pack / no workspace for that namespace), we can't tell a real block from
 *  a typo, so callers must not flag its ids as unknown. */
const canVerifyCache = new Map<string, boolean>();
function canVerifyNamespace(namespace: string): boolean {
  const hit = canVerifyCache.get(namespace);
  if (hit !== undefined) return hit;
  const ok = fs.existsSync(path.join(assetsDir(namespace), 'blockstates'));
  canVerifyCache.set(namespace, ok);
  return ok;
}

/** Whether `name` (`[namespace:]id`) is a real block in the resolvable content. Returns true
 *  for an UNVERIFIABLE namespace (no assets to check against) — absence of proof isn't proof
 *  of absence, so generation still works with no content pack (blocks just render flat). */
export function isKnownBlock(name: string): boolean {
  const colon = name.indexOf(':');
  const namespace = colon >= 0 ? name.slice(0, colon) : 'minecraft';
  const id = colon >= 0 ? name.slice(colon + 1) : name;
  if (!canVerifyNamespace(namespace)) return true;
  const key = `${namespace}:${id}`;
  const hit = knownBlockCache.get(key);
  if (hit !== undefined) return hit;
  const ok = fs.existsSync(path.join(assetsDir(namespace), 'blockstates', `${id}.json`));
  knownBlockCache.set(key, ok);
  return ok;
}

/** The subset of `names` that aren't real blocks (typos / wrong variant), deduped
 *  in input order — so the generator can reject them with actionable feedback
 *  instead of shipping a flat fallback-coloured block that's missing in-game. Only blocks
 *  whose namespace is VERIFIABLE are flagged, so a pack-less first run still generates. */
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

/** Read + parse a JSON asset (blockstate/model), memoised by absolute path; returns
 *  `null` (also cached) on a missing/invalid file. Cleared by `clearJsonCache` when
 *  the active workspace changes. */
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

/** Drop the cached JSON + known-block results — call after a workspace change so
 *  resolutions and block-ID validation pick up the new asset source. */
export function clearJsonCache(): void {
  jsonCache.clear();
  knownBlockCache.clear(); // a workspace change adds/removes valid block IDs
  canVerifyCache.clear(); // …and can change whether a namespace is verifiable at all
}
