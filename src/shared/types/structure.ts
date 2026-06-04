// The structure data model: a parsed `.nbt` resolved into renderable models +
// blocks, shared between the loader (main) and the Three.js viewer (renderer).
// Type-only — no runtime code, so both Vite bundles can import it safely.

export type FaceDir = 'down' | 'up' | 'north' | 'south' | 'east' | 'west';

export interface ModelFace {
  /** Resolved texture key relative to the textures dir, e.g. "block/stone". Null when unresolved. */
  texture: string | null;
  /** UV rectangle in 0..16 space: [x1, y1, x2, y2]. Optional — defaults to the full face. */
  uv?: [number, number, number, number];
  /** Texture rotation in degrees: 0 | 90 | 180 | 270. */
  rotation?: number;
  /** Biome tint index (>= 0 means the face is tinted, e.g. grass/foliage). */
  tintindex?: number;
  /** Explicit multiply tint as sRGB [r,g,b] in 0..1 (e.g. water blue, banner
   *  dye). Takes precedence over `tintindex`; used by synthesized blocks whose
   *  texture is grayscale and colored at render time. */
  tint?: [number, number, number];
}

export interface ElementRotation {
  origin: [number, number, number];
  axis: 'x' | 'y' | 'z';
  angle: number;
  rescale?: boolean;
}

export interface ModelElement {
  from: [number, number, number];
  to: [number, number, number];
  rotation?: ElementRotation;
  faces: Partial<Record<FaceDir, ModelFace>>;
}

/** A single renderable model with the blockstate-level rotation that applies to it. */
export interface ResolvedModel {
  elements: ModelElement[];
  x?: number;
  y?: number;
  uvlock?: boolean;
}

export interface PaletteEntry {
  name: string;
  properties?: Record<string, string>;
  /** Renderable models. Empty when the block is air or could not be resolved. */
  models: ResolvedModel[];
  /** Deterministic fallback color [r,g,b] in 0..1, used when textures are missing. */
  color: [number, number, number];
  /** True for air-like blocks that should not be rendered at all. */
  air: boolean;
}

export interface StructureBlock {
  state: number;
  pos: [number, number, number];
}

/** How a jigsaw constrains the rotation of the piece attached to it. */
export type JigsawJoint = 'rollable' | 'aligned';

/** A jigsaw block in a structure — the connection point used by worldgen to
 *  attach another piece. Parsed from the block's `orientation` property plus its
 *  block-entity NBT (`name`/`target`/`pool`/`final_state`/`joint`/priorities). */
export interface JigsawConnector {
  /** Block position within the structure's local coordinate space. */
  pos: [number, number, number];
  /** This connector's own name; a child jigsaw attaches here when its `target` matches. */
  name: string;
  /** The connector name this one wants to attach to (matched against another's `name`). */
  target: string;
  /** Template pool to pull the attached piece from (e.g. "minecraft:village/houses"). */
  pool: string;
  /** Block this jigsaw turns into after generation (usually "minecraft:air"). */
  finalState: string;
  joint: JigsawJoint;
  /** Block `orientation` property, "<front>_<top>" (e.g. "south_up", "down_east"). */
  orientation: string;
  /** Generation selection order (1.20.3+); 0 when absent. */
  selectionPriority: number;
  /** Child-placement order (1.20.3+); 0 when absent. */
  placementPriority: number;
}

export interface StructureData {
  name: string;
  path: string;
  size: [number, number, number];
  palette: PaletteEntry[];
  blocks: StructureBlock[];
  /** Unique texture keys referenced anywhere in the palette. */
  textures: string[];
  /** Whether the Minecraft content pack was found and used for resolution. */
  hasContent: boolean;
  /** Total non-air blocks. */
  blockCount: number;
  /** Jigsaw connection points found in this structure (empty when none). */
  jigsaws: JigsawConnector[];
}
