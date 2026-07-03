// Local (non-workspace) export of the current build: "Export As…" (a user-chosen file/format,
// which can fall back to a JIGSAW assembly) and "Export to World" (install the build into a
// Minecraft save for editing + round-trip — a raw `.nbt` when it fits one Structure Block, else
// an in-world editing scaffold). The writing/dialog plumbing lives here so window.ts stays about
// the window. (Workspace export is its own module — ./index.ts.)
import { clipboard, dialog, type MessageBoxOptions, type OpenDialogOptions, type SaveDialogOptions } from 'electron';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import type { ExportMode, ExportResult } from '@/shared/types';
import type { MessageKey } from '@/shared/i18n';
import { DEFAULT_WORLDGEN, sanitizeResourceName, validateSplit, type ValidationIssue } from '@/shared/domain/worldgen';
import { LIMIT_MODERN, outConnectorName, splitManifest, splitPlan, SPLIT_MANIFEST_FILE, type SplitPlan } from '@/shared/domain/split';
import { mt } from '../language';
import { getMainWindow } from '../window';
import { convertStructure, readRaw } from '../structure/io/convert';
import { splitToJigsaw, type SplitFile } from '../structure/io/split-structure';
import { sliceCleanPieces } from '../structure/io/slice-structure';
import { scaffoldFunction } from '@/shared/domain/scaffold';
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

/** Prompt for a Minecraft world SAVE folder (validating it has a `level.dat`). Returns the
 *  chosen root, or a terminal ExportResult to return (cancel / not-a-save). */
async function pickWorldSave(): Promise<{ ok: true; saveRoot: string } | { ok: false; result: ExportResult }> {
  const win = getMainWindow();
  const pickOpts: OpenDialogOptions = { title: mt('dialog.worldPickTitle'), properties: ['openDirectory'] };
  const picked = win ? await dialog.showOpenDialog(win, pickOpts) : await dialog.showOpenDialog(pickOpts);
  if (picked.canceled || !picked.filePaths[0]) return { ok: false, result: { ok: false, canceled: true } };
  const saveRoot = picked.filePaths[0];
  if (!fs.existsSync(path.join(saveRoot, 'level.dat'))) {
    await messageBox({ type: 'warning', title: mt('dialog.worldPickTitle'), message: mt('dialog.worldNotDatapack'), buttons: [mt('dialog.splitOk')] });
    return { ok: false, result: { ok: false, error: mt('dialog.worldNotDatapack') } };
  }
  return { ok: true, saveRoot };
}

/** Drop the reassembly manifest at the assembly root so Blockwright can later stitch the
 *  pieces back into one structure (Open Jigsaw Assembly / Reimport from World). */
async function writeManifest(folder: string, stem: string, size: RawStructure['size'], limit: number): Promise<void> {
  const manifest = splitManifest({ namespace: stem, base: stem, size, limit, dataVersion: DEFAULT_DATA_VERSION });
  await fsp.writeFile(path.join(folder, SPLIT_MANIFEST_FILE), JSON.stringify(manifest, null, 2) + '\n');
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
 *  location via the native Save dialog, in one of two MODES:
 *
 *  • `nbt` (Export as NBT…) — ONE pure file, never split, whatever the size: mods load
 *    arbitrary `.nbt` sizes (only a vanilla Structure Block caps at `nbtLimit`), so the raw
 *    file must always be exportable. The chosen extension drives the encoding: `.nbt`
 *    (vanilla structure) or `.schem`/`.litematic` (WorldEdit/Litematica); `.nbt`→`.nbt` is a
 *    lossless copy, anything else converts via `convertStructure`.
 *  • `jigsaw` (Export as Jigsaw…) — the build cut into a JIGSAW assembly written to a
 *    `<name>_jigsaw/` folder (a drop-in `data/<ns>/...` tree) that reassembles voxel-perfectly
 *    in-world. Only meaningful when the structure EXCEEDS `nbtLimit` (the menu item is gated
 *    on that); a within-limit build is refused with a pointer at Export as NBT. A native
 *    dialog then explains the assembly needs a datapack to spawn. */
export async function exportStructure(srcPath: string, suggestedName: string, nbtLimit: number, mode: ExportMode = 'nbt'): Promise<ExportResult> {
  if (!fs.existsSync(srcPath)) return { ok: false, error: 'The structure file no longer exists on disk.' };
  const jigsaw = mode === 'jigsaw';
  const options: SaveDialogOptions = {
    title: mt(jigsaw ? 'dialog.exportJigsawTitle' : 'dialog.exportTitle'),
    defaultPath: suggestedName,
    filters: jigsaw
      ? [{ name: mt('dialog.nbtFilter'), extensions: ['nbt'] }]
      : [
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
    if (jigsaw) return await exportJigsawAssembly(srcPath, destPath, nbtLimit);
    await convertStructure(srcPath, destPath);
    return { ok: true, path: destPath };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

/** The `jigsaw` mode's write: split `srcPath` against the limit and lay the assembly (pieces +
 *  worldgen JSON + reassembly manifest) in a `<stem>_jigsaw/` folder beside `destPath`. The
 *  chosen filename's stem names the assembly's namespace/folder. */
async function exportJigsawAssembly(srcPath: string, destPath: string, nbtLimit: number): Promise<ExportResult> {
  const raw = await readRaw(srcPath);
  const limit = nbtLimit > 0 ? nbtLimit : LIMIT_MODERN;
  const split = splitPlan(raw.size, limit);
  // The menu gates this on an oversized build; refuse a direct within-limit call
  // (a single-piece "assembly" would just be a worse plain .nbt).
  if (!split.oversized) return { ok: false, error: mt('dialog.jigsawFits', { limit }) };
  if (!(await passesSplitLimits(split))) return { ok: false, error: 'split limits exceeded' };
  const stem = sanitizeResourceName(path.basename(destPath).replace(/\.nbt$/i, ''));
  const folder = path.join(path.dirname(destPath), `${stem}_jigsaw`);
  const { files, warnings } = buildJigsawAssembly(raw, stem, split);
  await writeSplitFiles(files, folder);
  await writeManifest(folder, stem, raw.size, limit);
  await showSplitNotice(folder, split.pieceCount, warnings);
  return { ok: true, path: folder, splitPieces: split.pieceCount };
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

/** Export the current build into a Minecraft WORLD for editing + round-trip. The user picks their
 *  save folder; what's written depends on whether the build fits a single Structure Block (the
 *  `nbtLimit` per axis):
 *   • Within the limit → the raw `.nbt` is dropped at `<save>/generated/<ns>/structures/<ns>.nbt`,
 *     loadable with ONE structure block (LOAD mode, name `<ns>:<ns>`); a re-SAVE overwrites it.
 *   • Over the limit → an editing datapack: the build cut into ≤-limit pieces laid at their TRUE
 *     positions, each with a SAVE-mode structure block (the in-world editing scaffold).
 *  Either way a reassembly manifest is written, so File ▸ Reimport from World stitches the edited
 *  result back. Works with vanilla — no mod required. */
export async function exportToWorld(srcPath: string, suggestedName: string, nbtLimit: number): Promise<ExportResult> {
  if (!fs.existsSync(srcPath)) return { ok: false, error: 'The structure file no longer exists on disk.' };
  const pick = await pickWorldSave();
  if (!pick.ok) return pick.result;

  const stem = sanitizeResourceName(path.basename(suggestedName).replace(/\.nbt$/i, ''));
  try {
    const raw = await readRaw(srcPath);
    const limit = nbtLimit > 0 ? nbtLimit : LIMIT_MODERN;
    const split = splitPlan(raw.size, limit);
    if (split.oversized) {
      if (!(await passesSplitLimits(split))) return { ok: false, error: 'split limits exceeded' };
      return await installEditScaffold(pick.saveRoot, stem, raw, split, limit);
    }
    return await installSingleStructure(pick.saveRoot, stem, srcPath, raw.size, limit);
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

/** A within-limit build loads as ONE structure block: drop the raw `.nbt` where a structure
 *  block reads/writes saved structures in single-player (`<save>/generated/<ns>/structures/<ns>.nbt`),
 *  so the player LOADs it as `<ns>:<ns>`, edits, and re-SAVEs to the same file. The manifest sits
 *  beside it so Reimport from World reads the re-SAVEd structure straight back. */
async function installSingleStructure(saveRoot: string, stem: string, srcPath: string, size: RawStructure['size'], limit: number): Promise<ExportResult> {
  const genDir = path.join(saveRoot, 'generated', stem);
  const dest = path.join(genDir, 'structures', `${stem}.nbt`);
  await fsp.mkdir(path.dirname(dest), { recursive: true });
  await convertStructure(srcPath, dest);
  await writeManifest(genDir, stem, size, limit);
  await showWorldStructureNotice(dest, `${stem}:${stem}`);
  return { ok: true, path: dest };
}

/** Install the in-world EDITING scaffold for an oversized build: a datapack of clean ≤-limit
 *  pieces + a `.mcfunction` that lays each piece at its TRUE position with its own SAVE-mode
 *  structure block, so the pieces tile into the whole build. The player edits the assembled build
 *  and clicks SAVE on each piece; a re-SAVE writes the edited region to
 *  `<save>/generated/<ns>/structures/<base>/`, where File ▸ Reimport from World reads it. */
async function installEditScaffold(saveRoot: string, stem: string, raw: RawStructure, split: SplitPlan, limit: number): Promise<ExportResult> {
  const packDir = path.join(saveRoot, 'datapacks', `${stem}_edit`);
  const pieces = sliceCleanPieces(raw, split, DEFAULT_DATA_VERSION);
  const files: SplitFile[] = pieces.map((p) => ({ rel: path.join('data', stem, 'structure', stem, `${p.name}.nbt`), kind: 'piece', buffer: p.buffer }));
  await fsp.mkdir(packDir, { recursive: true });
  await writeSplitFiles(files, packDir);

  const fnPath = path.join(packDir, 'data', stem, 'function', 'edit.mcfunction');
  await fsp.mkdir(path.dirname(fnPath), { recursive: true });
  await fsp.writeFile(fnPath, scaffoldFunction(stem, stem, split));

  await writeManifest(packDir, stem, raw.size, limit);
  await fsp.writeFile(path.join(packDir, 'pack.mcmeta'), JSON.stringify(datapackMeta(), null, 2) + '\n');

  await showScaffoldNotice(packDir, `/function ${stem}:edit`, split.pieceCount);
  return { ok: true, path: packDir, splitPieces: split.pieceCount };
}

/** A lenient datapack `pack.mcmeta`: a 1.21 `pack_format` plus a wide `supported_formats` range
 *  so the pack loads regardless of the world's exact version (it's a throwaway test pack). */
function datapackMeta(): unknown {
  return { pack: { pack_format: 48, supported_formats: { min_inclusive: 4, max_inclusive: 99 }, description: 'Blockwright export' } };
}

/** Confirm a single-structure install + TEACH how to LOAD it with one structure block (Copy the
 *  structure name). */
async function showWorldStructureNotice(file: string, structureName: string): Promise<void> {
  const { response } = await messageBox({
    type: 'info',
    title: mt('dialog.worldTitle'),
    message: mt('dialog.worldMessageSingle'),
    detail: mt('dialog.worldStructureDetail', { folder: path.dirname(file), name: structureName }),
    buttons: [mt('dialog.splitCopy'), mt('dialog.splitOk')],
    defaultId: 1,
    cancelId: 1,
  });
  if (response === 0) clipboard.writeText(structureName);
}

/** Confirm the scaffold install and TEACH the edit→save→reimport workflow (with a Copy of the
 *  function command). */
async function showScaffoldNotice(folder: string, command: string, pieces: number): Promise<void> {
  const { response } = await messageBox({
    type: 'info',
    title: mt('dialog.scaffoldTitle'),
    message: mt('dialog.scaffoldMessage', { count: pieces }),
    detail: mt('dialog.scaffoldDetail', { folder, command }),
    buttons: [mt('dialog.splitCopy'), mt('dialog.splitOk')],
    defaultId: 1,
    cancelId: 1,
  });
  if (response === 0) clipboard.writeText(command);
}
