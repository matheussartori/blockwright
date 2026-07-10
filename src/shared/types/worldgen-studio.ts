// Worldgen Studio contracts: the editable model main reads from / writes back to
// the active workspace's worldgen JSON files (structure def + structure_set +
// template_pool + biome tag — exactly the four the export writes). Type-only.
import type { TerrainAdaptation } from '../domain/worldgen';

/** One editable pool element (only entries that reference a template are listed).
 *  `index` is its position in the pool file's `elements` array — writes patch the
 *  original entry in place, so hand-authored fields survive untouched. */
export interface WorldgenPoolElementModel {
  index: number;
  location: string;
  weight: number;
}

export interface WorldgenPoolModel {
  /** Workspace-relative pool file path (display + write target). */
  file: string;
  id: string;
  fallback: string;
  elements: WorldgenPoolElementModel[];
}

/** The editable slice of one structure's worldgen files. Fields the Studio does
 *  not model (processors, start_height, spawn_overrides, …) are preserved as-is
 *  by the surgical write. */
export interface WorldgenModel {
  /** Def basename (`<name>.json` under `worldgen/structure/`). */
  name: string;
  /** Workspace-relative def file path. */
  file: string;
  terrainAdaptation: TerrainAdaptation;
  size: number;
  maxDistance: number;
  startPool: string;
  /** Biome list: the tag file's `values` when the def points at an own-namespace
   *  `#has_structure` tag, else the def's inline list. */
  biomes: string[];
  /** True when `biomes` lives inline on the def (writes patch the def, not a tag). */
  biomesInline: boolean;
  /** structure_set placement, when a set in the workspace references this def. */
  set: { file: string; spacing: number; separation: number } | null;
  /** The start pool, when it resolves to a workspace file. */
  pool: WorldgenPoolModel | null;
}

export type WorldgenWriteResult = { ok: true } | { ok: false; error: string };
