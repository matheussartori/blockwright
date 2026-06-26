// Persist the in-memory split files (piece `.nbt` buffers + worldgen JSON) under a root dir.
// Shared by every export path (workspace / loose folder / world datapack) so the write loop
// — mkdir + buffer-or-json — lives once.
import fsp from 'node:fs/promises';
import path from 'node:path';
import type { SplitFile } from '../structure/io/split-structure';

/** Write each split file under `root` (creating parent dirs). Returns the written rel paths. */
export async function writeSplitFiles(files: SplitFile[], root: string): Promise<string[]> {
  const written: string[] = [];
  for (const f of files) {
    const abs = path.join(root, f.rel);
    await fsp.mkdir(path.dirname(abs), { recursive: true });
    if ('buffer' in f) await fsp.writeFile(abs, f.buffer);
    else await fsp.writeFile(abs, JSON.stringify(f.json, null, 2) + '\n');
    written.push(f.rel);
  }
  return written;
}
