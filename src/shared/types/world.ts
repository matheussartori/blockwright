// World-viewer contracts shared by main and renderer (type-only). A "world" is a Minecraft save
// folder (level.dat + region/*.mca) opened view-only and flown through in 3D — parallel to the
// single-structure `StructureData` path, but streamed chunk-by-chunk with LOD.
import type { PaletteEntry } from './structure';

/** A dimension's resource id — the three vanilla ones OR a mod dimension `namespace:path`
 *  (e.g. `theplacebeyond:bleak_db599711`). Resolved to a region folder in `world-paths.ts`. */
export type DimensionId = string;

/** A dimension present on disk (has region data), with a display label for the HUD. Only dimensions
 *  that actually generated (their `region/` holds `.mca`) are listed — an ungenerated nether/end
 *  never went to isn't offered. */
export interface WorldDimension {
  /** Resource id, e.g. `minecraft:overworld` or `theplacebeyond:bleak_db599711`. */
  id: DimensionId;
  /** Short display label (vanilla names localised; a mod dim shows its path). */
  label: string;
}

/** Everything the shell needs to open a world and seed navigation, read from `level.dat`. */
export interface WorldMeta {
  /** Absolute path to the world folder (the dir holding `level.dat`). */
  root: string;
  /** Display name (`LevelName`, falls back to the folder basename). */
  name: string;
  /** NBT `DataVersion` — gates the decoder (1.18+ = 2860, MC 1.21.1 = 3955). */
  dataVersion: number;
  /** Human MC version string when present (`Version.Name`, e.g. "1.21.1"). */
  versionName: string | null;
  /** Dimensions that actually have region data on disk (vanilla + mod), with display labels. */
  dimensions: WorldDimension[];
  /** World spawn (blocks). */
  spawn: [number, number, number];
  /** Last known player position (blocks), when the save records one. */
  player: [number, number, number] | null;
  /** Dev-only: an explicit initial camera look target (BW_WORLD_LOOK) so a headless capture can aim
   *  at a specific feature (a cave, a world edge). Ignored in normal use. */
  debugLook?: [number, number, number];
}

/** A remembered world for the recents list / Welcome screen (mirrors `Workspace`'s shape). */
export interface WorldRef {
  /** Absolute path to the world folder. */
  root: string;
  /** Display name. */
  name: string;
}

/** A region coordinate `(rx, rz)` present on disk for a dimension (drives the load plan / minimap).
 *  A region spans 32×32 chunks; `chunkX >> 5 === rx`. */
export interface RegionRef {
  rx: number;
  rz: number;
}

/** A generated structure found in a world (village, stronghold, mod structure, …) — its id and a
 *  jump-to position. Powers the "find structures" search (minutes of flying → a click). */
export interface StructureLocation {
  /** Structure resource id, e.g. `minecraft:village_plains`. */
  id: string;
  /** Short label (the id's path). */
  label: string;
  x: number;
  y: number;
  z: number;
}

/** One 16×16×16 section of a render payload. `uniform` sections carry no grid — every cell is the
 *  palette index `fill` (a stone/air fill costs nothing over IPC). */
export interface ChunkSectionPayload {
  sectionY: number;
  /** 4096 indices into the column palette (YZX), or null when `uniform`. */
  blocks: Uint16Array | null;
  uniform: boolean;
  /** Palette index that fills a uniform section (ignored when `blocks` is present). */
  fill: number;
}

/** A chunk column resolved to renderable data, streamed to the renderer's mesh worker. The palette
 *  is unified across the column's sections (deduped by block-state string) and already carries
 *  resolved models + texture keys + fallback colours — the same shape the structure mesh path
 *  consumes, so the geometry core is shared. Typed arrays cross IPC via structured clone. */
export interface ChunkRenderPayload {
  cx: number;
  cz: number;
  palette: PaletteEntry[];
  sections: ChunkSectionPayload[];
  /** Every texture key referenced by the palette (the renderer preloads these before meshing). */
  textureKeys: string[];
  /** MOTION_BLOCKING surface (world Y per column, 256 XZ) for the mid LOD, or null. */
  heightmap: Int16Array | null;
  /** Dominant biome grass/foliage tint (sRGB 0..1) applied to `tintindex` faces, or null (default
   *  green). Per-chunk, so foliage varies by biome without a full per-block colormap. */
  grassTint: [number, number, number] | null;
  /** True when the chunk exists on disk but has no renderable (non-air) sections. */
  empty: boolean;
}
