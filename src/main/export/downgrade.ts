// The datapack DOWNGRADER (v2.3 §1.4) — the upgrader's mirror, for the direction no tool
// owns: Litematica's official answer is "edit the version field by hand", Amulet drops
// renamed/new blocks as unknown. Over the active workspace, against an EXPLICIT older target:
// re-stamp DataVersion down, undo block-id renames (lossless), swap blocks the target doesn't
// have for curated same-shape stand-ins (or `structure_void`), and report every change and
// every loss — with one hard rule the upgrader doesn't need: the ORIGINAL FILE IS NEVER
// TOUCHED; each downgrade lands as a sibling copy suffixed with the target version.
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import zlib from 'node:zlib';
import * as nbt from 'prismarine-nbt';
import { mcVersionAtLeast, mcVersionRank } from '@/shared/mc-version';
import type { UpgradeEntry, Workspace, WorkspaceDowngradeReport } from '@/shared/types';
import { getActiveWorkspace } from '../structure/assets/content-pack';
import { dataVersionFor } from '../structure/mc-data-version';
import { downgradeBlockId, STRUCTURE_VOID } from '../structure/mc-block-versions';

/** Every entry code the downgrader can emit (i18n-guarded as `downgrade.entry.<code>`). */
export const DOWNGRADE_CODES = [
  'copy_written',
  'dataversion_restamped',
  'id_renamed',
  'block_substituted',
  'block_voided',
  'unreadable_nbt',
  'target_unsupported',
  'no_workspace',
] as const;
export type DowngradeCode = (typeof DOWNGRADE_CODES)[number];

/** The registry floor — below 1.18.2 the DataVersion table (and the block knowledge) ends. */
const FLOOR_VERSION = '1.18.2';

type TagNode = { type: string; value: unknown };
type TagCompound = Record<string, TagNode>;

/** Recursively list files under `dir` with an extension (empty when dir is missing). */
function listFiles(dir: string, ext: string): string[] {
  if (!fs.existsSync(dir)) return [];
  const out: string[] = [];
  const walk = (d: string): void => {
    for (const entry of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, entry.name);
      if (entry.isDirectory()) walk(p);
      else if (entry.name.endsWith(ext)) out.push(p);
    }
  };
  walk(dir);
  return out;
}

/** Every palette-entry list in a structure root: the single `palette`, or each list of the
 *  multi-variant `palettes` (both exist in the wild; vanilla writes one or the other). */
function paletteEntryLists(root: TagCompound): TagCompound[][] {
  const lists: TagCompound[][] = [];
  const single = root.palette;
  if (single?.type === 'list') {
    const inner = single.value as { type?: string; value?: unknown };
    if (inner?.type === 'compound' && Array.isArray(inner.value)) lists.push(inner.value as TagCompound[]);
  }
  const multi = root.palettes;
  if (multi?.type === 'list') {
    const outer = multi.value as { type?: string; value?: unknown };
    if (outer?.type === 'list' && Array.isArray(outer.value)) {
      for (const innerList of outer.value as { type?: string; value?: unknown }[]) {
        if (innerList?.type === 'compound' && Array.isArray(innerList.value)) {
          lists.push(innerList.value as TagCompound[]);
        }
      }
    }
  }
  return lists;
}

/** The sibling copy path a downgrade writes: `tower.nbt` → `tower.1.21.1.nbt`. */
export function downgradeCopyPath(file: string, target: string): string {
  const dir = path.dirname(file);
  const base = path.basename(file, '.nbt');
  return path.join(dir, `${base}.${target}.nbt`);
}

/** Run the downgrade over the ACTIVE workspace (the IPC entry point). */
export async function runWorkspaceDowngrade(target: string): Promise<WorkspaceDowngradeReport> {
  const ws = getActiveWorkspace();
  if (!ws) {
    return {
      workspace: null,
      target,
      checkedFiles: 0,
      written: 0,
      entries: [{ kind: 'loss', code: 'no_workspace', file: '' }],
    };
  }
  return downgradeWorkspace(ws, target);
}

/**
 * Downgrade one workspace's structure `.nbt`s to an EXPLICIT older Minecraft version,
 * writing a suffixed sibling copy per file that needs it (originals untouched) and
 * reporting every change and loss as coded entries.
 *
 * @param ws     The workspace whose `data/<ns>/structure(s)/` trees are scanned.
 * @param target The downgrade target (e.g. "1.21.1"); must be ≥ 1.18.2, the registry floor.
 * @returns The loss report: files checked, copies written, one entry per change/loss.
 */
export async function downgradeWorkspace(ws: Workspace, target: string): Promise<WorkspaceDowngradeReport> {
  const entries: UpgradeEntry[] = [];
  const rel = (file: string) => path.relative(ws.root, file);
  const add = (kind: UpgradeEntry['kind'], code: DowngradeCode, file: string, detail?: string) =>
    entries.push({ kind, code, file: file ? rel(file) : '', ...(detail ? { detail } : {}) });

  if (mcVersionRank(target) === null || !mcVersionAtLeast(target, FLOOR_VERSION, false)) {
    add('loss', 'target_unsupported', '', target);
    return { workspace: ws.name, target, checkedFiles: 0, written: 0, entries };
  }
  const targetDv = dataVersionFor(target);

  // Both folder spellings are scanned — a pack mid-migration may hold structures in either.
  const dataDir = path.join(ws.root, 'data', ws.namespace);
  const files = [...listFiles(path.join(dataDir, 'structure'), '.nbt'), ...listFiles(path.join(dataDir, 'structures'), '.nbt')]
    // A previous run's copies are not inputs (downgrading a downgrade compounds losses).
    .filter((f) => !f.endsWith(`.${target}.nbt`));

  let checked = 0;
  let written = 0;
  for (const file of files) {
    checked++;
    try {
      const { parsed } = await nbt.parse(await fsp.readFile(file));
      const root = parsed.value as unknown as TagCompound;
      const dvTag = root.DataVersion;
      const dv = typeof dvTag?.value === 'number' ? dvTag.value : 0;
      if (dv <= targetDv) continue; // already loads on the target — nothing to downgrade

      // Palette pass: undo renames, substitute blocks the target doesn't know. One entry
      // per distinct id per file (a multi-palette file repeats every entry).
      const seen = new Set<string>();
      for (const list of paletteEntryLists(root)) {
        for (const entry of list) {
          const nameTag = entry.Name;
          if (nameTag?.type !== 'string' || typeof nameTag.value !== 'string') continue;
          const name = nameTag.value;
          const decision = downgradeBlockId(name, target);
          if (decision.kind === 'keep') continue;
          nameTag.value = decision.to;
          if (decision.kind === 'substitute' && !decision.keepProps) delete entry.Properties;
          if (!seen.has(name)) {
            seen.add(name);
            if (decision.kind === 'rename') add('changed', 'id_renamed', file, `${name} → ${decision.to}`);
            else if (decision.to === STRUCTURE_VOID) add('loss', 'block_voided', file, name);
            else add('loss', 'block_substituted', file, `${name} → ${decision.to}`);
          }
        }
      }

      root.DataVersion = { type: 'int', value: targetDv };
      add('changed', 'dataversion_restamped', file, `${dv} → ${targetDv}`);

      const copy = downgradeCopyPath(file, target);
      await fsp.writeFile(copy, zlib.gzipSync(nbt.writeUncompressed(parsed, 'big')));
      written++;
      add('changed', 'copy_written', file, rel(copy));
    } catch (err) {
      add('loss', 'unreadable_nbt', file, err instanceof Error ? err.message : String(err));
    }
  }

  return { workspace: ws.name, target, checkedFiles: checked, written, entries };
}
