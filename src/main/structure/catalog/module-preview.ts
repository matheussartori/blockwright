// Build the 3D preview for a generation module (the module gallery). It composes the
// module's representative structure (via the same `template`-op pipeline generation
// uses), compiles it to a real `.nbt`, and loads it back as StructureData so the
// renderer can draw it with the normal mesh pipeline — exactly like `previewBlock`
// does for a single block. Results are cached per module (the previews are static).
import { app } from 'electron';
import fs from 'node:fs';
import path from 'node:path';
import type { ModuleCategory, StructureData } from '@/shared/types';
import { buildModulePreview } from '../domain';
import { writeStructureFile } from '../authoring';
import { loadStructure } from '../io/load-structure';

const cache = new Map<string, StructureData>();

/** Where compiled preview `.nbt`s are cached on disk. */
function previewDir(): string {
  const base = app.isPackaged ? app.getPath('userData') : app.getAppPath();
  return path.join(base, app.isPackaged ? 'module-previews' : '.module-previews');
}

/** Compose + compile + load a module's representative build. Throws if the module has
 *  no preview (e.g. the scaffolded basement/roof modules). */
export async function previewModule(category: ModuleCategory, id: string): Promise<StructureData> {
  const key = `${category}:${id}`;
  const cached = cache.get(key);
  if (cached) return cached;

  const authoring = buildModulePreview(category, id);
  if (!authoring) throw new Error(`no preview available for module ${key}`);

  const dir = previewDir();
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `${category}-${id}.nbt`);
  await writeStructureFile(authoring, file);
  const data = await loadStructure(file);
  cache.set(key, data);
  return data;
}
