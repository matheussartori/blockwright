// Persist a manually-edited structure as a new `.nbt` version. The renderer holds the
// live, edited blocks; here we re-encode them straight to a `vN.nbt` — bypassing the
// AI-repair passes (preserveShell/rebuildStairwells/…) so the user's edits are written
// EXACTLY as made — and re-attach block-entity NBT + entities + the DataVersion from the
// source file. NBT re-attaches by each block's ORIGIN cell (`nbtPos`, stamped at load and
// preserved by the editor ops), so a chest/sign/jigsaw/data-marker structure block keeps
// its NBT even after being MOVED — a pure position lookup would drop it. The version lands
// in the same session scratch dir + library folder as AI versions, so it shows up as the
// next version chip.
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import type { SaveVersionRequest, SaveVersionResult } from '@/shared/types';
import type { AuthoringBlock, AuthoringEntity } from '../structure/authoring/types';
import { encodeStructure } from '../structure/authoring/nbt-encode';
import { readAuthoring } from '../structure/authoring/nbt-decode';
import { isAir } from '../structure/authoring/palette';
import { activeDataVersion } from '../structure/data-version';
import { getSession } from './session';
import { mirrorToLibrary } from './output-dir';

const posKey = (p: readonly number[]): string => `${p[0]},${p[1]},${p[2]}`;

export async function saveEditedVersion(req: SaveVersionRequest): Promise<SaveVersionResult> {
  const session = getSession(req.sessionId);
  const version = session.version + 1;
  const nbtPath = path.join(session.dir, `v${version}.nbt`);

  // Inherit DataVersion + entities + block-entity NBT from the source file, re-attaching
  // each block's NBT via its origin cell (`nbtPos`) so moved blocks keep it.
  // The active context's target is the fallback when the source file has none.
  let dataVersion = activeDataVersion();
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

  // Attach ONLY via the origin cell: a block without `nbtPos` never had NBT, and a fresh
  // block painted over a cell that USED to hold a chest must not inherit the stale NBT.
  // An edited data-marker string (`dataMeta`) overrides the source NBT's `metadata`; for a
  // marker painted fresh in the editor (no source NBT) it mints a minimal DATA block entity
  // — vanilla fills the other structure-block fields with defaults on load.
  const blocks: AuthoringBlock[] = req.blocks.map((b) => {
    const src = b.nbtPos ? nbtByPos.get(posKey(b.nbtPos)) : undefined;
    const nbt = b.dataMeta != null && (src || b.dataMeta !== '')
      ? { ...(src ?? { mode: 'DATA' }), metadata: b.dataMeta }
      : src;
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
  // Keep the collapse-gate baseline in step with the saved build (a manual edit / reimport
  // can shrink it) — solid = non-air cells — so the next AI full emit isn't gated against a
  // stale larger count and falsely rejected.
  session.lastSolids = blocks.filter((b) => !isAir(req.palette[b.state]?.name ?? '')).length;
  return { ok: true, version, path: nbtPath, libraryPath: session.library?.latest ?? null };
}
