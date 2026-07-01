// The structure data model: a parsed `.nbt` resolved into renderable models +
// blocks, shared between the loader (main) and the Three.js viewer (renderer).
// Type-only — no runtime code, so both Vite bundles can import it safely.
import type { FloorDef } from './generation';

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

/** Per-bone Euler rotation (degrees, Minecraft model frame) from an armor stand's `Pose`
 *  NBT. Any bone absent = its default (zeroed) pose. */
export interface ArmorStandPose {
  head?: [number, number, number];
  body?: [number, number, number];
  leftArm?: [number, number, number];
  rightArm?: [number, number, number];
  leftLeg?: [number, number, number];
  rightLeg?: [number, number, number];
}

/** A renderable structure entity (armor stand, item frame, mob, …). Unlike block
 *  entities — which the renderer synthesizes from the block NAME — entities have no
 *  block in the palette, so the loader carries the few fields the viewer needs to
 *  draw them directly. `pos` is the precise (float) position in the structure's local
 *  space; `rotation` is the y-yaw in degrees. */
export interface StructureEntity {
  /** Entity id, e.g. "minecraft:armor_stand". */
  id: string;
  pos: [number, number, number];
  /** Y-rotation (yaw) in degrees; 0 when the entity has no `Rotation`. */
  rotation: number;
  /** Deterministic fallback color [r,g,b] in 0..1, drawn as a cube when no real model
   *  (or texture) is available — the same treatment blocks get. */
  color: [number, number, number];
  /** The resolved entity texture key ("namespace/path") when it exists in the content
   *  pack / workspace; null → render the fallback cube. Armor stand only for now. */
  textureKey: string | null;
  /** Armor-stand only: a "small" stand renders at half scale. */
  small?: boolean;
  /** Armor-stand only: whether the arms are shown. */
  showArms?: boolean;
  /** Armor-stand only: whether the stone base plate is hidden. */
  noBasePlate?: boolean;
  /** Armor-stand only: per-bone limb rotations from `Pose`. */
  pose?: ArmorStandPose;
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
  /** Structure entities (armor stands, item frames, mobs) to draw. Empty when none —
   *  these have no palette block, so the renderer builds their meshes from this list. */
  entities: StructureEntity[];
  /** Storeys recognised from the geometry on load (see `detectFloors`) — the app no
   *  longer asks the user to define the floor plan by hand. Seeds the (editable) Floors
   *  panel + the viewer bands; absent for structures with no clear floor plane. */
  floors?: FloorDef[];
}
