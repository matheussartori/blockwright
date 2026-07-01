// The lazy, cached world reader — pure DATA, no asset resolution (that's `chunk-resolve.ts`). Opens
// region files on demand, keeps a bounded LRU of both region buffers and decoded chunk columns, and
// exposes `getChunk` / `listRegions` / meta. Version-gated on `DataVersion`: 1.18+ (paletted,
// non-spanning) is decoded today; older formats fail soft (skipped with a log) until M6.
import type { DimensionId, RegionRef, StructureLocation, WorldMeta } from '@/shared/types';
import { RegionFile } from './anvil/region-file';
import { decodeChunk, type ColumnData } from './anvil/chunk-decode';
import { readLevelDat } from './anvil/level-dat';
import { availableDimensions, isWorldDir, listRegions as listRegionsOnDisk, regionFilePath, regionForChunk } from './anvil/world-paths';

/** First DataVersion with a PALETTED section format the decoder understands (Minecraft 1.13 = 1519).
 *  1.13–1.17 nest sections under `Level.Sections` (spanning before 1.16); 1.18+ use root `sections`.
 *  Pre-1.13 worlds use numeric block IDs and aren't supported. */
export const MIN_DATA_VERSION = 1519;

const REGION_CACHE_MAX = 16; // ~4 MiB each → cap held region buffers
const CHUNK_CACHE_MAX = 2048; // decoded columns

/** Move-to-end LRU over a Map (insertion order = recency). */
function lruSet<K, V>(map: Map<K, V>, key: K, value: V, max: number): void {
  map.delete(key);
  map.set(key, value);
  while (map.size > max) map.delete(map.keys().next().value as K);
}
function lruGet<K, V>(map: Map<K, V>, key: K): V | undefined {
  if (!map.has(key)) return undefined;
  const v = map.get(key) as V;
  map.delete(key);
  map.set(key, v);
  return v;
}

export class WorldSource {
  private readonly regionCache = new Map<string, RegionFile | null>();
  private readonly chunkCache = new Map<string, ColumnData | null>();
  private readonly structureCache = new Map<DimensionId, StructureLocation[]>();
  private warnedOldVersion = false;

  private constructor(
    readonly root: string,
    readonly meta: WorldMeta,
  ) {}

  /** Open a world folder → its source + meta. Throws if it isn't a valid world (no level.dat). */
  static async open(root: string): Promise<WorldSource> {
    if (!(await isWorldDir(root))) throw new Error(`not a Minecraft world (no level.dat): ${root}`);
    const level = await readLevelDat(root);
    const dimensions = await availableDimensions(root);
    const meta: WorldMeta = { root, ...level, dimensions };
    return new WorldSource(root, meta);
  }

  getMeta(): WorldMeta {
    return this.meta;
  }

  /** Region coordinates present in a dimension (drives the load plan / minimap). */
  listRegions(dim: DimensionId): Promise<RegionRef[]> {
    return listRegionsOnDisk(this.root, dim);
  }

  private async region(dim: DimensionId, rx: number, rz: number): Promise<RegionFile | null> {
    const key = `${dim}:${rx}:${rz}`;
    const cached = lruGet(this.regionCache, key);
    if (cached !== undefined) return cached;
    let region: RegionFile | null;
    try {
      region = await RegionFile.open(regionFilePath(this.root, dim, rx, rz));
    } catch {
      region = null; // absent region file — cache the miss
    }
    lruSet(this.regionCache, key, region, REGION_CACHE_MAX);
    return region;
  }

  /** Decode one chunk column, or null if absent/unsupported. Never throws — a bad chunk is logged
   *  and skipped so one corrupt column can't sink the whole fly-through. */
  async getChunk(dim: DimensionId, cx: number, cz: number): Promise<ColumnData | null> {
    const key = `${dim}:${cx}:${cz}`;
    const cached = lruGet(this.chunkCache, key);
    if (cached !== undefined) return cached;

    let column: ColumnData | null = null;
    try {
      const { rx, rz, lx, lz } = regionForChunk(cx, cz);
      const region = await this.region(dim, rx, rz);
      const nbt = region ? await region.readChunkNBT(lx, lz) : null;
      if (nbt) {
        const dataVersion = Number(nbt.DataVersion ?? 0);
        if (dataVersion > 0 && dataVersion < MIN_DATA_VERSION) {
          if (!this.warnedOldVersion) {
            console.warn(`[world] DataVersion ${dataVersion} (pre-1.13 numeric IDs) not supported; skipping chunks`);
            this.warnedOldVersion = true;
          }
        } else {
          column = decodeChunk(nbt);
        }
      }
    } catch (e) {
      console.warn(`[world] failed to read chunk ${dim} ${cx},${cz}:`, e instanceof Error ? e.message : e);
      column = null;
    }

    lruSet(this.chunkCache, key, column, CHUNK_CACHE_MAX);
    return column;
  }

  /** Scan a dimension for generated structures (each structure's START chunk records it). Bounded +
   *  cached per dimension — the first search does the disk work, later ones are instant. Best-effort:
   *  a chunk that fails to read is skipped. */
  async findStructures(dim: DimensionId): Promise<StructureLocation[]> {
    const cached = this.structureCache.get(dim);
    if (cached) return cached;

    const found: StructureLocation[] = [];
    const seen = new Set<string>();
    const regions = await this.listRegions(dim);
    let scanned = 0;
    outer: for (const { rx, rz } of regions) {
      let region: RegionFile | null;
      try {
        region = await RegionFile.open(regionFilePath(this.root, dim, rx, rz));
      } catch {
        continue;
      }
      for (const { lx, lz } of region.listPresent()) {
        if (scanned++ > STRUCTURE_SCAN_CAP) break outer;
        let nbt: Record<string, unknown> | null;
        try {
          nbt = await region.readChunkNBT(lx, lz);
        } catch {
          continue;
        }
        if (!nbt) continue;
        collectStarts(nbt, rx * 32 + lx, rz * 32 + lz, found, seen);
      }
    }
    found.sort((a, b) => a.label.localeCompare(b.label));
    this.structureCache.set(dim, found);
    return found;
  }

  /** Drop cached buffers (on close / workspace change). */
  dispose(): void {
    this.regionCache.clear();
    this.chunkCache.clear();
    this.structureCache.clear();
  }
}

/** Cap on chunks scanned per structure search (a huge world could have hundreds of thousands). */
const STRUCTURE_SCAN_CAP = 20000;

/** Pull real structure starts out of a chunk's `structures.starts` compound. A start belongs to the
 *  chunk it begins in (ChunkX/ChunkZ), has a non-empty id, and carries piece bounding boxes. */
function collectStarts(
  nbt: Record<string, unknown>,
  cx: number,
  cz: number,
  out: StructureLocation[],
  seen: Set<string>,
): void {
  const structures = (nbt.structures ?? (nbt.Level as Record<string, unknown>)?.Structures) as
    | { starts?: Record<string, StartNBT> }
    | undefined;
  const starts = structures?.starts;
  if (!starts) return;
  for (const start of Object.values(starts)) {
    const id = start?.id;
    if (!id || id === 'minecraft:empty') continue;
    if (start.ChunkX !== cx || start.ChunkZ !== cz) continue; // only the START chunk
    const bb = start.Children?.find((c) => Array.isArray(c.BB))?.BB;
    const x = bb ? Math.floor((bb[0] + bb[3]) / 2) : cx * 16 + 8;
    const y = bb ? Math.floor((bb[1] + bb[4]) / 2) : 64;
    const z = bb ? Math.floor((bb[2] + bb[5]) / 2) : cz * 16 + 8;
    const key = `${id}@${cx},${cz}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ id, label: id.replace(/^.*:/, ''), x, y, z });
  }
}

interface StartNBT {
  id?: string;
  ChunkX?: number;
  ChunkZ?: number;
  Children?: { BB?: number[] }[];
}
