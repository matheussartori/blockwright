// v2.2 §4 — Extract from world → structure (the world clipboard). Read a box of the OPEN world
// (committed bytes, not pending edits) and build the format-neutral `RawStructure` the codecs
// speak, so the selection can be saved as `.nbt`/`.schem`/`.litematic` or opened as a new tab.
// The inverse of §3 Place: block entities + entities are carried, relativised to the box origin.
import path from 'node:path';
import fsp from 'node:fs/promises';
import { app } from 'electron';
import type { DimensionId, WorldExtractBox, WorldExtractResult } from '@/shared/types';
import { LIMIT_MODERN, splitPlan } from '@/shared/domain/split';
import { blockIndexAt, type ColumnData, type SectionData } from './anvil/chunk-decode';
import { getActiveWorld } from './active-world';
import { encodeRaw } from '../structure/io/convert';
import { AIR, blockStateString, type RawBlock, type RawBlockEntity, type RawEntity, type RawPaletteEntry, type RawStructure } from '../structure/io/raw';

/** Defense-in-depth mirror of the renderer's `WORLD_SELECTION_CAP` — a runaway box would freeze
 *  the read + balloon the file. The selection UI already caps at this; main re-checks. */
export const EXTRACT_VOLUME_CAP = 65536;

/** An inclusive world-cell box to extract, in one dimension. */
export interface ExtractBox {
  dim: DimensionId;
  /** Min corner (inclusive world cell). */
  min: [number, number, number];
  /** Max corner (inclusive world cell). */
  max: [number, number, number];
}

/** Reads one chunk column by chunk coords (the WorldSource signature), or null when absent. */
export type ChunkGetter = (dim: DimensionId, cx: number, cz: number) => Promise<ColumnData | null>;

/** Section-local Y for a world Y — floor-division so negatives (Y < 0) map correctly. */
function sectionYOf(wy: number): number {
  return Math.floor(wy / 16);
}

/** True when `[x,y,z]` is inside the inclusive box. */
function inBox(x: number, y: number, z: number, min: [number, number, number], max: [number, number, number]): boolean {
  return x >= min[0] && x <= max[0] && y >= min[1] && y <= max[1] && z >= min[2] && z <= max[2];
}

/**
 * Sample an inclusive world box into a `RawStructure`. Iterates chunk columns once (not per cell),
 * reading every cell in the box's XZ footprint of each column and interning its block state; air
 * cells are kept (a faithful copy of the region). Block entities and entities whose position falls
 * inside the box are carried with positions relativised to the box's min corner.
 *
 * @param box     The inclusive world-cell box + its dimension.
 * @param getChunk Reads a decoded column (WorldSource.getChunk); called once per touched chunk.
 * @returns A RawStructure sized `max-min+1`, or null when the box read nothing usable.
 */
export async function extractRegion(box: ExtractBox, getChunk: ChunkGetter): Promise<RawStructure> {
  const { dim, min, max } = box;
  const size: [number, number, number] = [max[0] - min[0] + 1, max[1] - min[1] + 1, max[2] - min[2] + 1];

  const palette: RawPaletteEntry[] = [];
  const paletteIndex = new Map<string, number>();
  const intern = (entry: RawPaletteEntry): number => {
    const key = blockStateString(entry);
    let idx = paletteIndex.get(key);
    if (idx === undefined) {
      idx = palette.length;
      paletteIndex.set(key, idx);
      palette.push(entry);
    }
    return idx;
  };
  // Air is index 0 so an all-air cell is cheap and predictable.
  const airState = intern({ Name: AIR });

  const blocks: RawBlock[] = [];
  const blockEntities: RawBlockEntity[] = [];
  const entities: RawEntity[] = [];

  const cx0 = min[0] >> 4;
  const cx1 = max[0] >> 4;
  const cz0 = min[2] >> 4;
  const cz1 = max[2] >> 4;

  for (let cx = cx0; cx <= cx1; cx++) {
    for (let cz = cz0; cz <= cz1; cz++) {
      const column = await getChunk(dim, cx, cz);
      // The XZ span of this chunk that overlaps the box.
      const wx0 = Math.max(min[0], cx * 16);
      const wx1 = Math.min(max[0], cx * 16 + 15);
      const wz0 = Math.max(min[2], cz * 16);
      const wz1 = Math.min(max[2], cz * 16 + 15);

      // Index sections by their Y so a cell lookup is O(1); absent section ⇒ all air.
      const sectionByY = new Map<number, SectionData>();
      if (column) for (const s of column.sections) sectionByY.set(s.sectionY, s);

      for (let wy = min[1]; wy <= max[1]; wy++) {
        const sy = sectionYOf(wy);
        const section = sectionByY.get(sy);
        const ly = wy - sy * 16;
        for (let wx = wx0; wx <= wx1; wx++) {
          for (let wz = wz0; wz <= wz1; wz++) {
            const pos: [number, number, number] = [wx - min[0], wy - min[1], wz - min[2]];
            if (!section) {
              blocks.push({ state: airState, pos });
              continue;
            }
            const entry = section.palette[blockIndexAt(section, wx - cx * 16, ly, wz - cz * 16)];
            blocks.push({ state: entry ? intern(entry) : airState, pos });
          }
        }
      }

      // Block entities / entities in this column that fall inside the box (positions relativised).
      if (column) {
        for (const be of column.blockEntities) {
          const [x, y, z] = be.pos;
          if (inBox(x, y, z, min, max)) {
            blockEntities.push({ ...be, pos: [x - min[0], y - min[1], z - min[2]] });
          }
        }
        for (const e of column.entities) {
          const [bx, by, bz] = e.blockPos;
          if (inBox(bx, by, bz, min, max)) {
            entities.push({
              ...e,
              pos: [e.pos[0] - min[0], e.pos[1] - min[1], e.pos[2] - min[2]],
              blockPos: [bx - min[0], by - min[1], bz - min[2]],
            });
          }
        }
      }
    }
  }

  return {
    size,
    palette,
    blocks,
    ...(blockEntities.length ? { blockEntities } : {}),
    ...(entities.length ? { entities } : {}),
  };
}

/** A stable, filesystem-safe base name for an extracted region (dimension tail + min corner). */
function extractName(dim: DimensionId, min: [number, number, number]): string {
  const tail = dim.split(/[:/]/).pop() || 'overworld';
  return `extract_${tail}_${min[0]}_${min[1]}_${min[2]}`;
}

/**
 * Extract a box of the ACTIVE world (committed bytes — pending edits are NOT captured) into a temp
 * `.nbt`, returning where it landed plus the counts the panel surfaces. The renderer either opens
 * the file as a tab or feeds it to the Export As / jigsaw-split flow (hence `oversized`).
 *
 * @param dim      Dimension to read.
 * @param box      Inclusive world-cell box.
 * @param nbtLimit The per-axis Structure-Block limit to test `oversized` against (0 ⇒ modern 48).
 */
export async function extractWorldRegion(dim: DimensionId, box: WorldExtractBox, nbtLimit: number): Promise<WorldExtractResult> {
  const world = getActiveWorld();
  if (!world) return { ok: false, error: 'no world open' };

  const { min, max } = box;
  const volume = (max[0] - min[0] + 1) * (max[1] - min[1] + 1) * (max[2] - min[2] + 1);
  if (volume <= 0) return { ok: false, error: 'empty selection' };
  if (volume > EXTRACT_VOLUME_CAP) {
    return { ok: false, error: `selection too large (${volume.toLocaleString()} blocks — cap ${EXTRACT_VOLUME_CAP.toLocaleString()})` };
  }

  // Count columns that couldn't be read (absent/proto/pre-1.13) — their cells fall back to air.
  let refusedChunks = 0;
  const getChunk: ChunkGetter = async (d, cx, cz) => {
    const col = await world.getChunk(d, cx, cz);
    if (col === null) refusedChunks++;
    return col;
  };

  let raw: RawStructure;
  try {
    raw = await extractRegion({ dim, min, max }, getChunk);
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }

  const name = extractName(dim, min);
  try {
    const outDir = path.join(app.getPath('temp'), 'blockwright-extracted');
    await fsp.mkdir(outDir, { recursive: true });
    const outPath = path.join(outDir, `${name}.nbt`);
    await fsp.writeFile(outPath, encodeRaw(raw, outPath, Date.now()));
    const plan = splitPlan(raw.size, nbtLimit > 0 ? nbtLimit : LIMIT_MODERN);
    return {
      ok: true,
      path: outPath,
      name,
      size: raw.size,
      oversized: plan.oversized,
      blocks: raw.blocks.length,
      blockEntities: raw.blockEntities?.length ?? 0,
      entities: raw.entities?.length ?? 0,
      refusedChunks,
    };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}
