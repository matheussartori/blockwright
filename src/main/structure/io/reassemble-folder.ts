// The electron-FREE core of "Open Jigsaw Assembly": locate a split's manifest + piece
// `.nbt`s under a folder and stitch them back into one structure buffer. Kept apart from
// the dialog/temp-file shell (export/reassemble.ts) so the folder discovery + merge are
// unit-testable without electron. Also the shared core the "Reimport from World" flow reuses.
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { parseSplitManifest, SPLIT_MANIFEST_FILE, type SplitManifest } from '@/shared/domain/split';
import { encodeMergedNbt, reassemble } from './merge-structure';
import { DEFAULT_DATA_VERSION } from '../mc-data-version';

export type ReassembleError = 'no_manifest' | 'no_pieces';

export interface ReassembledBuffer {
  ok: true;
  buffer: Buffer;
  /** The structure's base name (from the manifest) — names the opened document. */
  name: string;
  /** How many pieces were missing on disk (a hole-y result if > 0). */
  missing: number;
}

/** Find the reassembly manifest under `dir`: the root first, then a bounded breadth-first
 *  walk (an Export to World datapack nests it; a loose assembly keeps it at the root). */
export async function findManifest(dir: string, maxDepth = 4): Promise<SplitManifest | null> {
  const root = path.join(dir, SPLIT_MANIFEST_FILE);
  if (fs.existsSync(root)) return readManifest(root);
  let frontier = [{ d: dir, depth: 0 }];
  while (frontier.length) {
    const next: { d: string; depth: number }[] = [];
    for (const { d, depth } of frontier) {
      for (const e of await readDir(d)) {
        const full = path.join(d, e.name);
        if (e.isFile() && e.name === SPLIT_MANIFEST_FILE) {
          const m = await readManifest(full);
          if (m) return m;
        } else if (e.isDirectory() && depth < maxDepth) {
          next.push({ d: full, depth: depth + 1 });
        }
      }
    }
    frontier = next;
  }
  return null;
}

async function readManifest(file: string): Promise<SplitManifest | null> {
  try {
    return parseSplitManifest(JSON.parse(await fsp.readFile(file, 'utf8')));
  } catch {
    return null;
  }
}

async function readDir(d: string): Promise<fs.Dirent[]> {
  try {
    return await fsp.readdir(d, { withFileTypes: true });
  } catch {
    return [];
  }
}

/** Index every `.nbt` under `dir` by basename (no extension) → its path, so a piece can be
 *  found by canonical name (`p_i_j_k`) wherever the structure folder sits. First match wins. */
export async function indexNbt(dir: string, maxDepth = 6): Promise<Map<string, string>> {
  const index = new Map<string, string>();
  let frontier = [{ d: dir, depth: 0 }];
  while (frontier.length) {
    const next: { d: string; depth: number }[] = [];
    for (const { d, depth } of frontier) {
      for (const e of await readDir(d)) {
        const full = path.join(d, e.name);
        if (e.isFile() && e.name.toLowerCase().endsWith('.nbt')) {
          const stem = e.name.replace(/\.nbt$/i, '');
          if (!index.has(stem)) index.set(stem, full);
        } else if (e.isDirectory() && depth < maxDepth) {
          next.push({ d: full, depth: depth + 1 });
        }
      }
    }
    frontier = next;
  }
  return index;
}

/** Stitch a manifest + a piece index into a `.nbt` buffer (the shared tail of both flows). */
async function mergeWithManifest(manifest: SplitManifest, index: Map<string, string>): Promise<ReassembledBuffer | { ok: false; error: ReassembleError }> {
  const { raw, missing } = await reassemble(manifest, (name) => index.get(name) ?? null);
  if (raw.blocks.length === 0) return { ok: false, error: 'no_pieces' };
  return { ok: true, buffer: encodeMergedNbt(raw, manifest.dataVersion ?? DEFAULT_DATA_VERSION), name: manifest.base, missing: missing.length };
}

/** Reassemble the assembly rooted at `dir` into a gzipped `.nbt` buffer (electron-free).
 *  Returns an error code the shell translates: no manifest, or every piece missing. */
export async function reassembleFolderToBuffer(dir: string): Promise<ReassembledBuffer | { ok: false; error: ReassembleError }> {
  const manifest = await findManifest(dir);
  if (!manifest) return { ok: false, error: 'no_manifest' };
  return mergeWithManifest(manifest, await indexNbt(dir));
}

/** Reassemble from a Minecraft SAVE folder after the player edited + re-SAVEd the pieces with
 *  the editing scaffold (Phase 3b). The manifest rides in the editing datapack; the EDITED
 *  pieces live in `<save>/generated/<ns>/structures/<base>/` — we index ONLY that folder, so the
 *  player's saved edits win over the original (unedited) pieces shipped in the datapack. */
export async function reassembleWorldToBuffer(saveDir: string): Promise<ReassembledBuffer | { ok: false; error: ReassembleError }> {
  const manifest = await findManifest(saveDir);
  if (!manifest) return { ok: false, error: 'no_manifest' };
  const piecesDir = path.join(saveDir, 'generated', manifest.namespace, 'structures', manifest.base);
  return mergeWithManifest(manifest, await indexNbt(piecesDir));
}
