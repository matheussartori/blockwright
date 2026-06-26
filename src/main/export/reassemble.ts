// "Open Jigsaw Assembly…" + "Reimport from World…" — the electron shell over the reassembly
// core. Both pick a folder, stitch its pieces back into one structure (reassemble-folder.ts),
// and write a temp `.nbt` the renderer opens as a normal document. Open Jigsaw Assembly reads a
// Blockwright assembly / Export to World datapack; Reimport from World reads the pieces a player
// re-SAVEd with the editing scaffold (the local inverse of the split / scaffold exports).
import { app, dialog, type OpenDialogOptions } from 'electron';
import fsp from 'node:fs/promises';
import path from 'node:path';
import type { ReassembleResult } from '@/shared/types';
import type { MessageKey } from '@/shared/i18n';
import { mt } from '../language';
import { getMainWindow } from '../window';
import { reassembleFolderToBuffer, reassembleWorldToBuffer, type ReassembledBuffer, type ReassembleError } from '../structure/io/reassemble-folder';

/** Write a reassembled buffer to a temp `.nbt` the renderer opens, or surface the error. */
async function toResult(outcome: ReassembledBuffer | { ok: false; error: ReassembleError }): Promise<ReassembleResult> {
  if (!outcome.ok) return { ok: false, error: mt(`reassemble.${outcome.error}` as MessageKey) };
  try {
    const outDir = path.join(app.getPath('temp'), 'blockwright-reassembled');
    await fsp.mkdir(outDir, { recursive: true });
    const out = path.join(outDir, `${outcome.name}.nbt`);
    await fsp.writeFile(out, outcome.buffer);
    return { ok: true, path: out, name: outcome.name, missing: outcome.missing };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

/** Prompt for a folder, then reassemble it through `read` (folder assembly vs world save). */
async function reassembleDialog(title: MessageKey, read: (dir: string) => Promise<ReassembledBuffer | { ok: false; error: ReassembleError }>): Promise<ReassembleResult> {
  const win = getMainWindow();
  const opts: OpenDialogOptions = { title: mt(title), properties: ['openDirectory'] };
  const picked = win ? await dialog.showOpenDialog(win, opts) : await dialog.showOpenDialog(opts);
  if (picked.canceled || !picked.filePaths[0]) return { ok: false, canceled: true };
  return toResult(await read(picked.filePaths[0]));
}

/** Prompt for an assembly folder, then reassemble it. */
export function reassembleAssemblyDialog(): Promise<ReassembleResult> {
  return reassembleDialog('reassemble.pickTitle', reassembleFolderToBuffer);
}

/** Prompt for a Minecraft SAVE folder, then reassemble the player's re-SAVEd pieces. */
export function reimportWorldDialog(): Promise<ReassembleResult> {
  return reassembleDialog('reassemble.pickWorldTitle', reassembleWorldToBuffer);
}
