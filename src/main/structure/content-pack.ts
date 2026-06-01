// Filesystem layer for the extracted Minecraft content pack: locating it on
// disk and reading its JSON assets (with a small in-process cache).
import { app } from 'electron';
import fs from 'node:fs';
import path from 'node:path';

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

export function assetsDir(): string {
  return path.join(contentDir(), 'assets', 'minecraft');
}

export function texturesDir(): string {
  return path.join(assetsDir(), 'textures');
}

export function textureFile(key: string): string {
  return path.join(texturesDir(), `${key}.png`);
}

export function hasContent(): boolean {
  return fs.existsSync(path.join(assetsDir(), 'blockstates'));
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
