// Contracts for the in-app block editor: resolving a picked block into renderable
// models (so a replaced/stair block shows up in the viewer), and saving the edited
// structure as a new `.nbt` version (the same version chain the AI writes to).
import type { PaletteEntry, StructureBlock } from './structure';

/** Save the edited blocks as a new version. The renderer holds the live, edited
 *  StructureData; main re-encodes it to a `vN.nbt` (bypassing the AI-repair passes so
 *  edits are written faithfully), re-attaching block-entity NBT via each block's
 *  origin cell (`nbtPos`) — so a moved chest/jigsaw/data-marker keeps its NBT. */
export interface SaveVersionRequest {
  sessionId: string;
  /** The `.nbt` currently shown — inherits its DataVersion, entities, and block-entity
   *  NBT (re-attached via each block's `nbtPos` origin cell) so chests/signs/jigsaws
   *  survive the edit even when moved. Null for a from-scratch doc with no file yet. */
  sourcePath: string | null;
  size: [number, number, number];
  /** Slim palette (the renderer's models aren't needed to encode). */
  palette: { name: string; properties?: Record<string, string> }[];
  blocks: StructureBlock[];
  /** Names the library folder on the first manual save (derived from the doc title). */
  slug?: string;
}

export interface SaveVersionResult {
  ok: boolean;
  version?: number;
  /** The written `vN.nbt` to load + record as a version chip. */
  path?: string;
  libraryPath?: string | null;
  error?: string;
}

/** One block resolved into renderable models + its texture keys, so the editor can
 *  intern a newly-picked block (Replace / Stairs) into the live structure and render it. */
export interface ResolveBlockResult {
  entry: PaletteEntry;
  textures: string[];
}
