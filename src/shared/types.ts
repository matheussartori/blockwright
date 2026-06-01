// Shared, type-only contracts between the main and renderer processes.
// (No runtime code lives here so both Vite bundles can import it safely.)

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

// --- Jigsaw assembly ---------------------------------------------------------

/** A structure placed in the assembly: which file, where, and its Y rotation.
 *  Rotation is in quarter-turns about +Y (0..3); offset is the world position of
 *  the piece's local origin (after rotation), in block units. */
export interface PlacedPiece {
  /** Stable id for this placement (root is "root"). */
  id: string;
  /** The pieces's structure id (namespace:path), for display. */
  structureId: string;
  /** Absolute path to the structure `.nbt`, so the renderer can load its meshes. */
  structurePath: string;
  offset: [number, number, number];
  quarterTurns: 0 | 1 | 2 | 3;
  /** Placement depth from the root (root = 0). */
  depth: number;
}

export type JigsawWarningKind =
  | 'missing-structure'
  | 'empty-pool'
  | 'unmatched-target'
  | 'overlap'
  | 'depth-limit'
  | 'unsupported-orientation';

/** A problem found while assembling/validating, surfaced to the user. */
export interface JigsawWarning {
  kind: JigsawWarningKind;
  message: string;
  /** Optional placement id the warning relates to. */
  pieceId?: string;
}

export interface JigsawPlan {
  pieces: PlacedPiece[];
  warnings: JigsawWarning[];
}

export interface AssembleOptions {
  /** Deterministic seed; same seed + structure ⇒ same assembly. */
  seed: number;
  /** Maximum recursion depth from the root piece. */
  maxDepth: number;
}

/** One candidate piece that could attach to a given connector (manual mode). */
export interface JigsawCandidate {
  structureId: string;
  structurePath: string;
  weight: number;
  /** The placement that would attach this candidate to the source connector. */
  placement: PlacedPiece;
}

export interface BlockwrightApi {
  platform: NodeJS.Platform;
  openDialog: () => Promise<string | null>;
  loadStructure: (path: string) => Promise<StructureData>;
  /** Build a texture URL served by the custom protocol. Key is "namespace/path". */
  textureUrl: (key: string) => string;
  hasTexture: (key: string) => Promise<boolean>;
  /** Open a mod workspace (directory picker); returns the active workspace or null. */
  openWorkspace: () => Promise<Workspace | null>;
  closeWorkspace: () => Promise<null>;
  getWorkspace: () => Promise<Workspace | null>;
  /** Minecraft version of the active content pack (its version.json), or null. */
  getContentVersion: () => Promise<string | null>;
  /** Activate a known/detected workspace; returns it, or null if it no longer exists. */
  activateWorkspace: (workspace: Workspace) => Promise<Workspace | null>;
  /** Detect whether a `.nbt` path belongs to a mod project (returns its Workspace or null). */
  detectFileWorkspace: (path: string) => Promise<Workspace | null>;
  /** Recently opened mod workspaces, most-recent first. Both return the updated list. */
  listRecentWorkspaces: () => Promise<Workspace[]>;
  clearRecentWorkspaces: () => Promise<Workspace[]>;
  /** Absolute paths of the active workspace's `.nbt` structures (empty when none). */
  listWorkspaceStructures: () => Promise<string[]>;
  /** Persist a user-chosen Minecraft version for the active workspace; returns it. */
  setWorkspaceVersion: (version: string) => Promise<Workspace | null>;
  /** Plan a full jigsaw assembly starting from a structure file. */
  assembleJigsaw: (path: string, options: AssembleOptions) => Promise<JigsawPlan>;
  /** Candidate pieces that can attach to one connector of a structure (manual mode). */
  jigsawCandidates: (path: string, connectorIndex: number) => Promise<JigsawCandidate[]>;
  /** Report whether a structure is currently open, so main can enable/disable Close File. */
  setFileOpen: (open: boolean) => void;
  /** Whether a path still exists on disk (used to validate recents before opening). */
  pathExists: (path: string) => Promise<boolean>;
  /** Recently opened files, most-recent first. All return the updated list. */
  listRecents: () => Promise<string[]>;
  addRecent: (path: string) => Promise<string[]>;
  removeRecent: (path: string) => Promise<string[]>;
  clearRecents: () => Promise<string[]>;
  onOpenPath: (cb: (path: string) => void) => void;
  onFileDrop: (cb: (path: string) => void) => void;
  /** Notified when the recents list changes in main (e.g. via the native menu). */
  onRecentsChanged: (cb: (paths: string[]) => void) => void;
  /** Notified when the active mod workspace changes (opened or closed). */
  onWorkspaceChanged: (cb: (workspace: Workspace | null) => void) => void;
  /** Notified when the recent-workspaces list changes. */
  onRecentWorkspacesChanged: (cb: (workspaces: Workspace[]) => void) => void;
  /** Notified when main requests closing the current structure (native File menu). */
  onCloseStructure: (cb: () => void) => void;
  /** Notified when main requests opening the Settings panel (native menu / Cmd+,). */
  onOpenSettings: (cb: () => void) => void;
}

declare global {
  interface Window {
    blockwright: BlockwrightApi;
  }
}
