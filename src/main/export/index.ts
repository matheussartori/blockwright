// Export a generated structure into the active mod workspace: copy the `.nbt` into the
// version-correct structure folder and (optionally) write the four worldgen JSON files
// that make Minecraft spawn it. `planExport` is the live preview the dialog shows as the
// user edits (the file tree + any problems); `runExport` performs the writes. The file
// list + the non-fs checks come from the shared `worldgen` helpers, so the preview and
// the writes can't drift; main only adds the disk-aware bits (exists / source-missing).
//
// When the structure exceeds the size limit, it can't load as a single `.nbt` (a Structure
// Block tops out at 48³), so instead of one file we cut it into a JIGSAW assembly (many
// piece `.nbt`s + per-edge template pools) that reassembles voxel-perfectly in-world —
// `splitToJigsaw` builds that whole file set.
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import {
  plannedFiles,
  structureFolder,
  validateOptions,
  validateSplit,
  type ValidationIssue,
} from '@/shared/domain/worldgen';
import { splitPlan } from '@/shared/domain/split';
import type { WorkspaceExportPlan, WorkspaceExportRequest, WorkspaceExportResult, PlannedFile } from '@/shared/types';
import { getActiveWorkspace } from '../structure/assets/content-pack';
import { readRaw } from '../structure/io/convert';
import { splitToJigsaw } from '../structure/io/split-structure';
import { DEFAULT_DATA_VERSION } from '../structure/mc-data-version';
import { jsonFor } from './worldgen-json';
import { writeSplitFiles } from './write-split';

/** Compute the dialog's live preview: the target workspace, the files that would be
 *  written (with overwrite flags), and the problems to surface. Never throws. */
export function planExport(req: WorkspaceExportRequest): WorkspaceExportPlan {
  const ws = getActiveWorkspace();
  if (!ws) return { workspace: null, files: [], issues: [{ level: 'error', code: 'no_workspace' }] };

  const split = splitPlan(req.size, req.nbtLimit);
  const specs = plannedFiles(ws.namespace, req.name, ws.minecraftVersion, req.worldgen, split);
  const files: PlannedFile[] = specs.map((s) => ({ ...s, exists: fs.existsSync(path.join(ws.root, s.rel)) }));

  const issues: ValidationIssue[] = [...validateOptions(req.name, req.worldgen), ...validateSplit(split)];
  if (!req.sourcePath || !fs.existsSync(req.sourcePath)) issues.push({ level: 'error', code: 'source_missing' });
  if (structureFolder(ws.minecraftVersion) === 'structures') issues.push({ level: 'warning', code: 'legacy_folder' });
  for (const f of files) if (f.exists) issues.push({ level: 'warning', code: 'overwrite', detail: f.rel });

  return {
    workspace: { name: ws.name, namespace: ws.namespace, version: ws.minecraftVersion },
    files,
    issues,
  };
}

/** Write the structure + worldgen files into the workspace. Overwrites existing files
 *  (the dialog has already warned). Returns the written paths + a folder to reveal. */
export async function runExport(req: WorkspaceExportRequest): Promise<WorkspaceExportResult> {
  const ws = getActiveWorkspace();
  if (!ws) return { ok: false, written: [], errorCode: 'no_workspace' };
  if (!req.sourcePath || !fs.existsSync(req.sourcePath)) return { ok: false, written: [], errorCode: 'source_missing' };

  const split = splitPlan(req.size, req.nbtLimit);
  const errors = [...validateOptions(req.name, req.worldgen), ...validateSplit(split)].filter((i) => i.level === 'error');
  if (errors.length) return { ok: false, written: [], errorCode: 'invalid', detail: errors.map((e) => e.code).join(',') };

  try {
    const written = split.oversized
      ? await writeSplit(req, ws.root, ws.namespace, ws.minecraftVersion, split)
      : await writeSingle(req, ws.root, ws.namespace, ws.minecraftVersion);
    const revealPath = path.join(ws.root, 'data', ws.namespace, structureFolder(ws.minecraftVersion));
    return { ok: true, written, revealPath };
  } catch (e) {
    return { ok: false, written: [], errorCode: 'write_failed', detail: e instanceof Error ? e.message : String(e) };
  }
}

/** The original single-piece export: copy the `.nbt` + write the worldgen JSON. */
async function writeSingle(req: WorkspaceExportRequest, root: string, namespace: string, version: string | null): Promise<string[]> {
  const specs = plannedFiles(namespace, req.name, version, req.worldgen);
  const written: string[] = [];
  for (const spec of specs) {
    const abs = path.join(root, spec.rel);
    await fsp.mkdir(path.dirname(abs), { recursive: true });
    if (spec.kind === 'nbt') {
      await fsp.copyFile(req.sourcePath, abs);
    } else {
      await fsp.writeFile(abs, JSON.stringify(jsonFor(spec.kind, namespace, req.name, req.worldgen), null, 2) + '\n');
    }
    written.push(spec.rel);
  }
  return written;
}

/** The oversized export: cut the structure into a jigsaw assembly and write every piece +
 *  pool + the structure/structure_set/biome JSON. */
async function writeSplit(
  req: WorkspaceExportRequest,
  root: string,
  namespace: string,
  version: string | null,
  split: ReturnType<typeof splitPlan>,
): Promise<string[]> {
  const raw = await readRaw(req.sourcePath);
  const { files } = splitToJigsaw(raw, split, { namespace, base: req.name, version, worldgen: req.worldgen, dataVersion: DEFAULT_DATA_VERSION });
  return writeSplitFiles(files, root);
}
