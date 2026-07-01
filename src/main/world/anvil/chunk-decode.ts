// Decode a simplified 1.18+ chunk NBT into `ColumnData` — the format-neutral, pre-asset-resolution
// shape the world reader speaks (parallel to `io/raw.ts`'s `RawStructure` for single structures).
// A 1.18 chunk stores `sections: [{ Y, block_states:{ palette, data }, biomes:{ palette, data } }]`
// where `data` is a NON-spanning packed long array (bits = max(4, ceil(log2(len))), YZX cell order,
// palette length 1 ⇒ no data array, the whole 16³ section is that block).
import type { RawBlockEntity, RawPaletteEntry } from '../../structure/io/raw';
import { AIR, omitKeys } from '../../structure/io/raw';
import { bitsForBlockStates, bitsForPalette, pairsToBig, unpackNonSpanning, unpackSpanning } from '../../structure/io/long-bits';

/** DataVersion where vanilla switched the section block-state packing from SPANNING to NON-spanning
 *  (Minecraft 1.16 = 2566). Older paletted chunks (1.13–1.15) span long boundaries. */
const NON_SPANNING_SINCE = 2566;

/** The three air variants that count as "empty" for occupancy/heightmap purposes. */
export const AIR_NAMES = new Set([AIR, 'minecraft:cave_air', 'minecraft:void_air']);

/** One 16×16×16 section of a chunk column. `uniform` sections (single-entry palette) carry no grid
 *  — every cell is palette index 0 — so a stone/air fill costs nothing. */
export interface SectionData {
  /** Section Y index (world Y = sectionY*16 + localY); ranges ~ -4..19 for a -64..319 world. */
  sectionY: number;
  palette: RawPaletteEntry[];
  /** 4096 palette indices in YZX order, or null when `uniform`. */
  blocks: Uint16Array | null;
  uniform: boolean;
  /** 4×4×4 biome palette + indices (for M6 biome tint); null when a chunk predates paletted biomes. */
  biomePalette: string[] | null;
  biomes: Uint8Array | null;
}

/** A decoded chunk column: its non-empty sections plus the data navigation/LOD need. */
export interface ColumnData {
  cx: number;
  cz: number;
  dataVersion: number;
  /** Lowest section Y present (world min build Y = minSectionY*16), for heightmap → world Y. */
  minSectionY: number;
  /** Sections that contain at least one non-air block (all-air sections are dropped). */
  sections: SectionData[];
  /** MOTION_BLOCKING heightmap as world Y of the top motion-blocking block per column (256, XZ),
   *  or null when the chunk doesn't store it. Drives the mid-LOD surface mesh. */
  heightmap: Int16Array | null;
  blockEntities: RawBlockEntity[];
}

interface SectionNBT {
  Y: number;
  block_states?: { palette?: RawPaletteEntry[]; data?: [number, number][] };
  biomes?: { palette?: string[]; data?: [number, number][] };
  // Legacy 1.13–1.17 shape:
  Palette?: RawPaletteEntry[];
  BlockStates?: [number, number][];
}

/** Unpack a section's block indices with the version-correct scheme (uniform → null). */
function decodeSectionBlocks(paletteLen: number, longs: bigint[], spanning: boolean): Uint16Array | null {
  if (paletteLen <= 1) return null; // uniform fill — no grid needed
  const bits = bitsForBlockStates(paletteLen);
  return spanning ? Uint16Array.from(unpackSpanning(longs, bits, 4096)) : unpackNonSpanning(longs, bits, 4096);
}

/** Read the value at a section-local cell (YZX order) — index 0 for a uniform section. */
export function blockIndexAt(section: SectionData, lx: number, ly: number, lz: number): number {
  if (section.uniform || !section.blocks) return 0;
  return section.blocks[ly * 256 + lz * 16 + lx];
}

/** Decode a simplified chunk NBT (from `RegionFile.readChunkNBT`) into `ColumnData`. Handles the
 *  1.18+ root-`sections` format AND the legacy 1.13–1.17 `Level.Sections` format (paletted, spanning
 *  before 1.16). Returns null for an undecodable chunk (pre-1.13 numeric IDs, or no sections). */
export function decodeChunk(nbt: Record<string, unknown>): ColumnData | null {
  const dataVersion = Number(nbt.DataVersion ?? 0);
  const spanning = dataVersion < NON_SPANNING_SINCE;
  const level = nbt.Level as Record<string, unknown> | undefined;

  // Pick the format: 1.18+ has root `sections`; 1.13–1.17 nests them under `Level.Sections`.
  const modern = Array.isArray(nbt.sections);
  const rawSections = (modern ? nbt.sections : level?.Sections) as SectionNBT[] | undefined;
  if (!Array.isArray(rawSections)) return null;

  const src = modern ? nbt : (level ?? nbt);
  const cx = Number(src.xPos ?? 0);
  const cz = Number(src.zPos ?? 0);

  const sections: SectionData[] = [];
  let minSectionY = Infinity;
  for (const s of rawSections) {
    // Normalise both shapes to (palette, longs).
    const palette = modern ? s.block_states?.palette : s.Palette;
    const dataArr = modern ? s.block_states?.data : s.BlockStates;
    if (!palette || !palette.length) continue;
    if (Number.isFinite(s.Y)) minSectionY = Math.min(minSectionY, s.Y);

    if (palette.length === 1) {
      if (AIR_NAMES.has(palette[0].Name)) continue; // all-air section — nothing to render
      sections.push({ sectionY: s.Y, palette, blocks: null, uniform: true, ...biomesOf(s) });
      continue;
    }
    const blocks = decodeSectionBlocks(palette.length, pairsToBig(dataArr ?? []), spanning);
    sections.push({ sectionY: s.Y, palette, blocks, uniform: false, ...biomesOf(s) });
  }

  const minY = Number.isFinite(minSectionY) ? minSectionY * 16 : 0;
  return {
    cx,
    cz,
    dataVersion,
    minSectionY: Number.isFinite(minSectionY) ? minSectionY : 0,
    sections,
    heightmap: decodeHeightmap(src, minY, spanning),
    blockEntities: decodeBlockEntities(src),
  };
}

function biomesOf(s: SectionNBT): { biomePalette: string[] | null; biomes: Uint8Array | null } {
  const palette = s.biomes?.palette;
  if (!palette || !palette.length) return { biomePalette: null, biomes: null };
  if (palette.length === 1) return { biomePalette: palette, biomes: null }; // uniform biome
  const bits = bitsForPalette(palette.length, 1);
  const longs = pairsToBig(s.biomes?.data ?? []);
  const idx = unpackNonSpanning(longs, bits, 64);
  return { biomePalette: palette, biomes: Uint8Array.from(idx) };
}

/** MOTION_BLOCKING heightmap → world Y of the surface per column (256 entries, XZ). Values are
 *  packed at 9 bits (spanning before 1.16) and count blocks above `minY`. */
function decodeHeightmap(nbt: Record<string, unknown>, minY: number, spanning: boolean): Int16Array | null {
  const hm = nbt.Heightmaps as Record<string, [number, number][]> | undefined;
  const data = hm?.MOTION_BLOCKING ?? hm?.WORLD_SURFACE;
  if (!data || !data.length) return null;
  const longs = pairsToBig(data);
  const values = spanning
    ? Uint16Array.from(unpackSpanning(longs, 9, 256))
    : unpackNonSpanning(longs, 9, 256);
  const out = new Int16Array(256);
  for (let i = 0; i < 256; i++) out[i] = minY + values[i] - 1; // value = height above minY; top solid Y
  return out;
}

function decodeBlockEntities(nbt: Record<string, unknown>): RawBlockEntity[] {
  // 1.18+ = `block_entities`; legacy 1.13–1.17 = `TileEntities` (on the Level compound).
  const list = (nbt.block_entities ?? nbt.TileEntities) as Record<string, unknown>[] | undefined;
  if (!Array.isArray(list)) return [];
  const out: RawBlockEntity[] = [];
  for (const be of list) {
    const x = Number(be.x);
    const y = Number(be.y);
    const z = Number(be.z);
    if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) continue;
    out.push({ pos: [x, y, z], id: String(be.id ?? ''), nbt: omitKeys(be, ['x', 'y', 'z', 'id']) });
  }
  return out;
}
