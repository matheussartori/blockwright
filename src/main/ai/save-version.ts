// Persist a manually-edited structure as a new `.nbt` version. The renderer holds the
// live, edited blocks; here we re-encode them straight to a `vN.nbt` — bypassing the
// AI-repair passes (preserveShell/rebuildStairwells/…) so the user's edits are written
// EXACTLY as made — and re-attach block-entity NBT + entities + the DataVersion from the
// source file, so chests/signs/jigsaws an edit didn't move survive. The version lands in
// the same session scratch dir + library folder as AI versions, so it shows up as the
// next version chip.
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import type { SaveVersionRequest, SaveVersionResult } from '@/shared/types';
import type { AuthoringBlock, AuthoringEntity } from '../structure/authoring/types';
import { encodeStructure } from '../structure/authoring/nbt-encode';
import { readAuthoring } from '../structure/authoring/nbt-decode';
import { DEFAULT_DATA_VERSION } from '../structure/mc-data-version';
import { getSession } from './session';
import { mirrorToLibrary } from './output-dir';

/** The structure DataVersion to stamp when the source file has none (1.21.1). */
const posKey = (p: readonly number[]): string => `${p[0]},${p[1]},${p[2]}`;

export async function saveEditedVersion(req: SaveVersionRequest): Promise<SaveVersionResult> {
  const session = getSession(req.sessionId);
  const version = session.version + 1;
  const nbtPath = path.join(session.dir, `v${version}.nbt`);

  // Inherit DataVersion + entities + block-entity NBT from the source file, re-attaching
  // the NBT to any block still at its original position.
  let dataVersion = DEFAULT_DATA_VERSION;
  let entities: AuthoringEntity[] = [];
  const nbtByPos = new Map<string, Record<string, unknown>>();
  if (req.sourcePath && fs.existsSync(req.sourcePath)) {
    try {
      const src = await readAuthoring(req.sourcePath);
      if (typeof src.DataVersion === 'number') dataVersion = src.DataVersion;
      entities = src.entities ?? [];
      for (const b of src.blocks ?? []) if (b.nbt) nbtByPos.set(posKey(b.pos), b.nbt);
    } catch {
      /* best-effort — encode without inherited NBT rather than failing the save */
    }
  }

  const blocks: AuthoringBlock[] = req.blocks.map((b) => {
    const nbt = nbtByPos.get(posKey(b.pos));
    return nbt ? { state: b.state, pos: b.pos, nbt } : { state: b.state, pos: b.pos };
  });

  try {
    const buffer = encodeStructure({
      dataVersion,
      size: req.size,
      palette: req.palette.map((p) => ({ Name: p.name, Properties: p.properties })),
      blocks,
      entities,
    });
    await fsp.writeFile(nbtPath, buffer);
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }

  session.library = await mirrorToLibrary(session.library, req.slug ?? 'edited-build', nbtPath, version);
  session.version = version;
  return { ok: true, version, path: nbtPath, libraryPath: session.library?.latest ?? null };
}
