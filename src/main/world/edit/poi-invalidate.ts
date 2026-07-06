// POI invalidation: for every edited terrain section, the matching `poi/` region section gets
// `Valid: 0` so the game RESCANS it on load — killing the classic ghost-workstation and undead
// nether-portal bugs without us ever authoring POI records ourselves. A poi chunk stores
// `{ Sections: { "<sectionY>": { Valid, Records } }, DataVersion }`; we only ever flip `Valid`.
import { RegionFile } from '../anvil/region-file';
import { byteTag, compoundOf, encodeTagRoot, type Tag } from './nbt-tree';
import { rewriteRegion, type ChunkRewrite } from './region-write';

export interface PoiChunkTarget {
  lx: number;
  lz: number;
  sectionYs: number[];
}

/**
 * Invalidate the POI sections matching edited terrain sections in one poi region file.
 *
 * Best-effort by design: an absent poi file, absent poi chunk, or absent section entry means
 * there's nothing recorded there — nothing to invalidate. Only chunks that actually changed are
 * rewritten (an untouched poi region is never rewritten at all).
 *
 * @returns True when the poi region was rewritten.
 */
export async function invalidatePoiSections(
  poiRegionPath: string,
  targets: PoiChunkTarget[],
  nowSec = Math.floor(Date.now() / 1000),
): Promise<boolean> {
  let region: RegionFile;
  try {
    region = await RegionFile.open(poiRegionPath);
  } catch {
    return false; // no poi data for this region — nothing to invalidate
  }

  const rewrites: ChunkRewrite[] = [];
  for (const target of targets) {
    let root: Tag | null;
    try {
      root = (await region.readChunkParsed(target.lx, target.lz)) as Tag | null;
    } catch {
      continue; // unreadable poi chunk — leave it alone rather than guess
    }
    if (!root) continue;
    const value = compoundOf(root);
    const sections = value ? compoundOf(value.Sections) : null;
    if (!sections) continue;

    let changed = false;
    for (const sy of target.sectionYs) {
      const section = compoundOf(sections[String(sy)]);
      if (section && (section.Valid?.value as number | undefined) !== 0) {
        section.Valid = byteTag(0);
        changed = true;
      }
    }
    if (changed) rewrites.push({ lx: target.lx, lz: target.lz, nbt: encodeTagRoot(root) });
  }

  if (!rewrites.length) return false;
  await rewriteRegion(poiRegionPath, rewrites, nowSec);
  return true;
}
