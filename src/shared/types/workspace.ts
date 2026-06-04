// Mod-workspace contract: an opened mod project whose assets augment the base
// content pack (its namespace resolves under its own root).

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
