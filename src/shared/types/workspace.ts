// Mod-workspace contract: an opened mod project whose assets augment the base
// content pack (its namespace resolves under its own root).

/** One placeable template of a workspace jigsaw pool (a single/legacy/list element
 *  resolved to its structure file). */
export interface WorkspaceJigsawPiece {
  /** Template id ("namespace:path"). */
  structureId: string;
  /** Resolved `.nbt` path, or null when the referenced template is missing on disk —
   *  a dead reference (the silent worldgen killer the Doctor also flags). */
  structurePath: string | null;
  weight: number;
}

/** One template pool of the active workspace — the Project panel's Jigsaws section.
 *  Pools are grouped by `folder` (the pool FAMILY: `drowned_path/start` and
 *  `drowned_path/path` assemble together). */
export interface WorkspaceJigsawPool {
  /** Pool id ("namespace:folder/name"). */
  id: string;
  /** Pool file basename without `.json` (e.g. "start"). */
  name: string;
  /** Folder within `worldgen/template_pool` (e.g. "drowned_path"); '' at the root. */
  folder: string;
  /** Absolute path of the pool JSON. */
  path: string;
  pieces: WorkspaceJigsawPiece[];
  /** Terminal outcomes in the pool (empty/feature elements) — they place nothing but
   *  consume generation weight, so the panel shows them as a muted note. */
  emptyOutcomes: number;
}

/** An opened mod project whose assets augment the base content pack. */
export interface Workspace {
  /** Display name (the chosen project folder's basename). */
  name: string;
  /** Resources root that contains `assets/` and `data/` (e.g. .../src/main/resources). */
  root: string;
  /** The mod's asset namespace, e.g. "theplacebeyond". */
  namespace: string;
  /** Detected (or user-selected) Minecraft version, e.g. "1.21.1"; null when unknown. */
  minecraftVersion: string | null;
}
