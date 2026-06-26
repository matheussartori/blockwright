// Local (non-workspace) export of the current build: "Export As…" (a user-chosen file/format)
// and "Export to World" (install a ready-to-run datapack into a Minecraft save). Both can hit
// the size limit and fall back to a JIGSAW assembly; the writing/dialog plumbing lives here so
// window.ts stays about the window. (Workspace export is its own module — ./index.ts.)
import { clipboard, dialog, type MessageBoxOptions, type OpenDialogOptions, type SaveDialogOptions } from 'electron';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import type { ExportResult } from '@/shared/types';
import type { MessageKey } from '@/shared/i18n';
import { DEFAULT_WORLDGEN, sanitizeResourceName, validateSplit, type ValidationIssue } from '@/shared/domain/worldgen';
import { outConnectorName, splitPlan, type SplitPlan } from '@/shared/domain/split';
import { mt } from '../language';
import { getMainWindow } from '../window';
import { convertStructure, readRaw } from '../structure/io/convert';
import { splitToJigsaw, type SplitFile } from '../structure/io/split-structure';
import type { RawStructure } from '../structure/io/raw';
import { DEFAULT_DATA_VERSION } from '../structure/mc-data-version';
import { writeSplitFiles } from './write-split';

/** Run a message box parented to the main window (or standalone in headless tests). */
function messageBox(opts: MessageBoxOptions): Promise<Electron.MessageBoxReturnValue> {
  const win = getMainWindow();
  return win ? dialog.showMessageBox(win, opts) : dialog.showMessageBox(opts);
}

const issueText = (issue: ValidationIssue): string =>
  mt(`export.issue.${issue.code}` as MessageKey, issue.detail ? { detail: issue.detail } : undefined);

/** Append any split warnings (lost block-entity, large span) to a dialog's detail text. */
const warningSuffix = (warnings: ValidationIssue[]): string =>
  warnings.length ? `\n\n${warnings.map(issueText).join('\n')}` : '';

/** Compile (in memory — no writes) the split jigsaw assembly + the `/place` command. The
 *  `/place jigsaw` target must NAME a jigsaw on the root piece (worldgen needs no match); the
 *  root always owns ≥1 outbound connector, so we use it. */
function buildJigsawAssembly(raw: RawStructure, stem: string, split: SplitPlan): { files: SplitFile[]; warnings: ValidationIssue[]; command: string } {
  const { files, warnings } = splitToJigsaw(raw, split, {
    namespace: stem,
    base: stem,
    version: null,
    worldgen: { ...DEFAULT_WORLDGEN, generate: true },
    dataVersion: DEFAULT_DATA_VERSION,
  });
  const rootEdge = split.edges.find((e) => e.parent === split.root);
  const target = rootEdge ? outConnectorName(rootEdge.edgeId) : 'minecraft:empty';
  return { files, warnings, command: `/place jigsaw ${stem}:${stem}/start ${target} 20 ~ ~ ~` };
}

/** Refuse a split that exceeds the jigsaw limits (too many pieces / too deep), explaining why.
 *  Returns true when the split is allowed to proceed. */
async function passesSplitLimits(split: SplitPlan): Promise<boolean> {
  const errors = validateSplit(split).filter((i) => i.level === 'error');
  if (!errors.length) return true;
  await messageBox({ type: 'error', title: mt('dialog.splitTitle'), message: errors.map(issueText).join('\n'), buttons: [mt('dialog.splitOk')] });
  return false;
}

/** Export the current build (`srcPath`, a real `.nbt`/`.schem` on disk) to a user-chosen
 *  location + FORMAT via the native Save dialog. The chosen extension drives the encoding:
 *  `.nbt` (vanilla structure) or `.schem`/`.litematic` (WorldEdit/Litematica). `.nbt`→`.nbt` is
 *  a lossless copy; anything else converts via `convertStructure`.
 *
 *  A `.nbt` export bigger than `nbtLimit` can't load as one Structure Block file, so it's cut
 *  into a JIGSAW assembly written to a sibling `<name>_jigsaw/` folder (a drop-in `data/<ns>/...`
 *  tree) — `.schem`/`.litematic` are unaffected (their mods load arbitrary sizes). A native
 *  dialog then explains it needs a datapack to spawn. */
export async function exportStructure(srcPath: string, suggestedName: string, nbtLimit: number): Promise<ExportResult> {
  if (!fs.existsSync(srcPath)) return { ok: false, error: 'The structure file no longer exists on disk.' };
  const options: SaveDialogOptions = {
    title: mt('dialog.exportTitle'),
    defaultPath: suggestedName,
    filters: [
      { name: mt('dialog.nbtFilter'), extensions: ['nbt'] },
      { name: mt('dialog.schemFilter'), extensions: ['schem'] },
      { name: mt('dialog.litematicFilter'), extensions: ['litematic'] },
    ],
  };
  const win = getMainWindow();
  const result = win ? await dialog.showSaveDialog(win, options) : await dialog.showSaveDialog(options);
  if (result.canceled || !result.filePath) return { ok: false, canceled: true };
  const destPath = result.filePath;

  try {
    if (destPath.toLowerCase().endsWith('.nbt') && nbtLimit > 0) {
      const raw = await readRaw(srcPath);
      const split = splitPlan(raw.size, nbtLimit);
      if (split.oversized) {
        if (!(await passesSplitLimits(split))) return { ok: false, error: 'split limits exceeded' };
        const stem = sanitizeResourceName(path.basename(destPath).replace(/\.nbt$/i, ''));
        const folder = path.join(path.dirname(destPath), `${stem}_jigsaw`);
        const { files, warnings } = buildJigsawAssembly(raw, stem, split);
        await writeSplitFiles(files, folder);
        await showSplitNotice(folder, split.pieceCount, warnings);
        return { ok: true, path: folder, splitPieces: split.pieceCount };
      }
    }
    await convertStructure(srcPath, destPath);
    return { ok: true, path: destPath };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

/** Tell the user a loose `.nbt` export was split into a jigsaw assembly — it needs a datapack's
 *  worldgen wiring to spawn (Export to World drops it straight into a save; Export to Mod
 *  Workspace wires it into a mod). */
async function showSplitNotice(folder: string, pieces: number, warnings: ValidationIssue[]): Promise<void> {
  await messageBox({
    type: 'info',
    title: mt('dialog.splitTitle'),
    message: mt('dialog.splitMessage', { count: pieces }),
    detail: mt('dialog.splitDetail', { folder }) + warningSuffix(warnings),
    buttons: [mt('dialog.splitOk')],
  });
}

/** Export the current build straight into a Minecraft WORLD: the user picks their save folder
 *  and Blockwright installs a ready-to-run datapack at `<save>/datapacks/<name>/` — the pieces +
 *  worldgen JSON in the right place — so they only have to /reload and run one command. An
 *  oversized build becomes a jigsaw assembly; a normal one is a single placeable structure. */
export async function exportToWorld(srcPath: string, suggestedName: string, nbtLimit: number): Promise<ExportResult> {
  if (!fs.existsSync(srcPath)) return { ok: false, error: 'The structure file no longer exists on disk.' };
  const win = getMainWindow();
  const pickOpts: OpenDialogOptions = { title: mt('dialog.worldPickTitle'), properties: ['openDirectory'] };
  const picked = win ? await dialog.showOpenDialog(win, pickOpts) : await dialog.showOpenDialog(pickOpts);
  if (picked.canceled || !picked.filePaths[0]) return { ok: false, canceled: true };
  const saveRoot = picked.filePaths[0];
  if (!fs.existsSync(path.join(saveRoot, 'level.dat'))) {
    await messageBox({ type: 'warning', title: mt('dialog.worldPickTitle'), message: mt('dialog.worldNotDatapack'), buttons: [mt('dialog.splitOk')] });
    return { ok: false, error: mt('dialog.worldNotDatapack') };
  }

  const stem = sanitizeResourceName(path.basename(suggestedName).replace(/\.nbt$/i, ''));
  const packDir = path.join(saveRoot, 'datapacks', stem);
  try {
    const raw = await readRaw(srcPath);
    const split = splitPlan(raw.size, nbtLimit);

    let command: string;
    let pieces = 0;
    let warnings: ValidationIssue[] = [];
    if (split.oversized) {
      if (!(await passesSplitLimits(split))) return { ok: false, error: 'split limits exceeded' };
      // Build everything in memory first (this is what can throw), so a failure never leaves a
      // half-written datapack — and the pack.mcmeta is written LAST, after the data lands.
      const assembly = buildJigsawAssembly(raw, stem, split);
      await fsp.mkdir(packDir, { recursive: true });
      await writeSplitFiles(assembly.files, packDir);
      ({ command, warnings } = assembly);
      pieces = split.pieceCount;
    } else {
      const dest = path.join(packDir, 'data', stem, 'structure', `${stem}.nbt`);
      await fsp.mkdir(path.dirname(dest), { recursive: true });
      await convertStructure(srcPath, dest);
      command = `/place template ${stem}:${stem} ~ ~ ~`;
    }
    await fsp.writeFile(path.join(packDir, 'pack.mcmeta'), JSON.stringify(datapackMeta(), null, 2) + '\n');
    await showWorldExportNotice(packDir, command, pieces, warnings);
    return { ok: true, path: packDir, splitPieces: pieces || undefined };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

/** A lenient datapack `pack.mcmeta`: a 1.21 `pack_format` plus a wide `supported_formats` range
 *  so the pack loads regardless of the world's exact version (it's a throwaway test pack). */
function datapackMeta(): unknown {
  return { pack: { pack_format: 48, supported_formats: { min_inclusive: 4, max_inclusive: 99 }, description: 'Blockwright export' } };
}

/** Confirm the world install and TEACH the exact command to place it (with one-click copy). */
async function showWorldExportNotice(folder: string, command: string, pieces: number, warnings: ValidationIssue[]): Promise<void> {
  const { response } = await messageBox({
    type: 'info',
    title: mt('dialog.worldTitle'),
    message: pieces > 0 ? mt('dialog.worldMessageSplit', { count: pieces }) : mt('dialog.worldMessageSingle'),
    detail: mt('dialog.worldDetail', { folder, command }) + warningSuffix(warnings),
    buttons: [mt('dialog.splitCopy'), mt('dialog.splitOk')],
    defaultId: 1,
    cancelId: 1,
  });
  if (response === 0) clipboard.writeText(command);
}
