// Save the Materials panel's Bill of Materials to disk. The renderer builds both
// serializations (the rollup is pure renderer math); main only owns the native
// Save dialog + the write. The chosen extension picks the payload — the filter
// order follows the caller's preferred format.
import { dialog, type SaveDialogOptions } from 'electron';
import fsp from 'node:fs/promises';
import type { ExportResult, MaterialsExportRequest } from '@/shared/types';
import { mt } from '../language';
import { getMainWindow } from '../window';

export async function exportMaterials(req: MaterialsExportRequest): Promise<ExportResult> {
  const csvFilter = { name: mt('dialog.csvFilter'), extensions: ['csv'] };
  const jsonFilter = { name: mt('dialog.jsonFilter'), extensions: ['json'] };
  const options: SaveDialogOptions = {
    title: mt('dialog.materialsTitle'),
    defaultPath: `${req.suggestedName}.${req.format}`,
    filters: req.format === 'json' ? [jsonFilter, csvFilter] : [csvFilter, jsonFilter],
  };
  const win = getMainWindow();
  const result = win ? await dialog.showSaveDialog(win, options) : await dialog.showSaveDialog(options);
  if (result.canceled || !result.filePath) return { ok: false, canceled: true };
  try {
    const json = result.filePath.toLowerCase().endsWith('.json');
    await fsp.writeFile(result.filePath, json ? req.json : req.csv, 'utf8');
    return { ok: true, path: result.filePath };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}
