// The datapack UPGRADER (v2.2 Part III) + the Doctor's one-click fix-its. One command
// over the active workspace: re-stamp structure DataVersions via the registry, apply the
// `structures/`→`structure/` folder rename, update `pack.mcmeta` to the target format
// (classic `pack_format` AND the 26.x `min_format`/`max_format` scheme), and flag block
// ids that don't resolve at the target — returning a LOSS REPORT of everything it changed
// or couldn't map (nothing is silently dropped; a lossy step is an entry, not a surprise).
// The fix-its reuse the same primitives for the Doctor's safe findings.
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import zlib from 'node:zlib';
import * as nbt from 'prismarine-nbt';
import { datapackFormatFor, structureFolder } from '@/shared/domain/worldgen';
import type { DoctorFixResult, UpgradeEntry, Workspace, WorkspaceUpgradeReport } from '@/shared/types';
import { getActiveWorkspace, unknownBlockIds } from '../structure/assets/content-pack';
import { dataVersionFor } from '../structure/mc-data-version';
import { readRaw } from '../structure/io/convert';

/** Every entry code the upgrader can emit — typed like DOCTOR_CODES, so the i18n
 *  guard test requires an `upgrade.entry.<code>` string for each. */
export const UPGRADE_CODES = [
  'folder_renamed',
  'meta_restamped',
  'dataversion_restamped',
  'dataversion_newer',
  'unknown_block',
  'unreadable_nbt',
  'no_target_version',
] as const;
export type UpgradeCode = (typeof UPGRADE_CODES)[number];

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

// ── The shared fix primitives (upgrader steps ≡ Doctor fix-its) ────────────────────

/** Move every `.nbt` from the legacy structure folder into the one the target version
 *  reads, keeping subpaths. Files that already exist at the destination are left in
 *  place (reported, never overwritten). Returns how many moved / were skipped. */
async function renameStructureFolder(ws: Workspace): Promise<{ moved: number; skipped: number }> {
  const sf = structureFolder(ws.minecraftVersion);
  const dataDir = path.join(ws.root, 'data', ws.namespace);
  const legacyDir = path.join(dataDir, sf === 'structure' ? 'structures' : 'structure');
  const targetDir = path.join(dataDir, sf);
  let moved = 0;
  let skipped = 0;
  for (const file of listFiles(legacyDir, '.nbt')) {
    const dest = path.join(targetDir, path.relative(legacyDir, file));
    if (fs.existsSync(dest)) {
      skipped++;
      continue;
    }
    await fsp.mkdir(path.dirname(dest), { recursive: true });
    await fsp.rename(file, dest);
    moved++;
  }
  return { moved, skipped };
}

/** Re-stamp `pack.mcmeta` to the target version's format: the classic `pack_format`,
 *  plus `max_format` (and a too-high `min_format`) when the pack uses the 26.x range
 *  scheme. Returns the `old → new` detail, or null when it was already current. */
async function restampPackMeta(ws: Workspace): Promise<string | null> {
  const metaPath = path.join(ws.root, 'pack.mcmeta');
  if (!fs.existsSync(metaPath)) return null;
  const json = JSON.parse(await fsp.readFile(metaPath, 'utf8')) as {
    pack?: { pack_format?: number; min_format?: unknown; max_format?: unknown };
  };
  const pack = json.pack;
  if (!pack) return null;
  const expected = datapackFormatFor(ws.minecraftVersion);
  const current = typeof pack.pack_format === 'number' ? pack.pack_format : null;
  let changed = false;
  if (current !== null && current < expected) {
    pack.pack_format = expected;
    changed = true;
  }
  if (typeof pack.max_format === 'number' && pack.max_format < expected) {
    pack.max_format = expected;
    changed = true;
  }
  if (typeof pack.min_format === 'number' && pack.min_format > expected) {
    pack.min_format = expected;
    changed = true;
  }
  if (!changed) return null;
  await fsp.writeFile(metaPath, JSON.stringify(json, null, 2) + '\n');
  return `${current ?? '?'} → ${expected}`;
}

/** Inject the REQUIRED `spawn_overrides: {}` into a jigsaw structure def missing it. */
async function injectSpawnOverrides(file: string): Promise<void> {
  const json = JSON.parse(await fsp.readFile(file, 'utf8')) as Record<string, unknown>;
  if ('spawn_overrides' in json) return;
  json.spawn_overrides = {};
  await fsp.writeFile(file, JSON.stringify(json, null, 2) + '\n');
}

/** Surgically re-stamp a structure `.nbt`'s DataVersion on the parsed TAG TREE (never
 *  through the authoring projection — every other byte of NBT survives untouched). */
async function restampDataVersion(file: string, dataVersion: number): Promise<void> {
  const buf = await fsp.readFile(file);
  const { parsed } = await nbt.parse(buf);
  (parsed.value as Record<string, unknown>).DataVersion = { type: 'int', value: dataVersion };
  await fsp.writeFile(file, zlib.gzipSync(nbt.writeUncompressed(parsed, 'big')));
}

// ── The Doctor's one-click fix-its ─────────────────────────────────────────────────

/** The Doctor finding codes with a SAFE one-click fix (the renderer gates its button on this). */
export const FIXABLE_CODES = ['wrong_folder', 'missing_spawn_overrides', 'stale_format'] as const;

/**
 * Apply one Doctor fix-it to the active workspace.
 *
 * @param code The finding's code (must be one of FIXABLE_CODES).
 * @param relFile The finding's workspace-relative file (as reported).
 * @returns ok + an optional detail, or the failure reason (localized renderer-side is
 *   overkill for a rare disk error — the raw message is shown).
 */
export async function applyDoctorFix(code: string, relFile: string): Promise<DoctorFixResult> {
  const ws = getActiveWorkspace();
  if (!ws) return { ok: false, error: 'no active workspace' };
  try {
    switch (code) {
      case 'wrong_folder': {
        const { moved, skipped } = await renameStructureFolder(ws);
        return { ok: true, detail: skipped > 0 ? `${moved} moved, ${skipped} kept (already exist)` : `${moved} moved` };
      }
      case 'missing_spawn_overrides': {
        await injectSpawnOverrides(path.join(ws.root, relFile));
        return { ok: true };
      }
      case 'stale_format': {
        const detail = await restampPackMeta(ws);
        return { ok: true, ...(detail ? { detail } : {}) };
      }
      default:
        return { ok: false, error: `no fix for code: ${code}` };
    }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

// ── The upgrader ───────────────────────────────────────────────────────────────────

/** Run the datapack upgrade over the ACTIVE workspace (the IPC entry point). */
export async function runWorkspaceUpgrade(): Promise<WorkspaceUpgradeReport> {
  const ws = getActiveWorkspace();
  if (!ws) return { workspace: null, target: null, checkedFiles: 0, entries: [] };
  return upgradeWorkspace(ws);
}

/**
 * Upgrade one workspace's data pack to its TARGET Minecraft version, reporting every
 * change and every loss (a thing it could not map) as coded entries.
 *
 * @returns The loss report: files checked + one entry per change/loss.
 */
export async function upgradeWorkspace(ws: Workspace): Promise<WorkspaceUpgradeReport> {
  const entries: UpgradeEntry[] = [];
  let checked = 0;
  const rel = (file: string) => path.relative(ws.root, file);
  const add = (kind: UpgradeEntry['kind'], code: UpgradeCode, file: string, detail?: string) =>
    entries.push({ kind, code, file: rel(file), ...(detail ? { detail } : {}) });

  if (!ws.minecraftVersion) {
    add('loss', 'no_target_version', ws.root);
    return { workspace: ws.name, target: null, checkedFiles: 0, entries };
  }

  // 1. Folder rename (the #1 silent breakage when a pack moves versions).
  const dataDir = path.join(ws.root, 'data', ws.namespace);
  const sf = structureFolder(ws.minecraftVersion);
  const legacyDir = path.join(dataDir, sf === 'structure' ? 'structures' : 'structure');
  if (listFiles(legacyDir, '.nbt').length > 0) {
    const { moved, skipped } = await renameStructureFolder(ws);
    if (moved > 0) add('changed', 'folder_renamed', legacyDir, `${moved} → ${sf}/`);
    if (skipped > 0) add('loss', 'folder_renamed', legacyDir, `${skipped} kept — already exist in ${sf}/`);
  }

  // 2. pack.mcmeta format re-stamp (classic + 26.x range scheme).
  try {
    const detail = await restampPackMeta(ws);
    if (detail) add('changed', 'meta_restamped', path.join(ws.root, 'pack.mcmeta'), detail);
  } catch {
    add('loss', 'unreadable_nbt', path.join(ws.root, 'pack.mcmeta'), 'unparseable pack.mcmeta');
  }

  // 3+4. Per-structure: DataVersion re-stamp (never DOWN — the game can't downgrade
  // data, so a newer file is a reported loss) + unknown block ids at the target.
  const target = dataVersionFor(ws.minecraftVersion);
  for (const file of listFiles(path.join(dataDir, sf), '.nbt')) {
    checked++;
    try {
      const buf = await fsp.readFile(file);
      const { parsed } = await nbt.parse(buf);
      const dvTag = (parsed.value as Record<string, { value?: unknown }>).DataVersion;
      const dv = typeof dvTag?.value === 'number' ? dvTag.value : 0;
      if (dv > target) {
        add('loss', 'dataversion_newer', file, `${dv} > ${target}`);
      } else if (dv < target) {
        await restampDataVersion(file, target);
        add('changed', 'dataversion_restamped', file, `${dv} → ${target}`);
      }
      // Block ids that don't resolve in the active content (typos / renamed ids /
      // blocks that don't exist at the target). Verifiable namespaces only — with no
      // content pack nothing is flagged (absence of proof isn't proof of absence).
      const raw = await readRaw(file);
      for (const id of unknownBlockIds(raw.palette.map((p) => p.Name))) {
        add('loss', 'unknown_block', file, id);
      }
    } catch (err) {
      add('loss', 'unreadable_nbt', file, err instanceof Error ? err.message : String(err));
    }
  }

  return { workspace: ws.name, target: ws.minecraftVersion, checkedFiles: checked, entries };
}
