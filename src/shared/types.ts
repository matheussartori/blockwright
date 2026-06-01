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
}

export interface BlockwrightApi {
  platform: NodeJS.Platform;
  openDialog: () => Promise<string | null>;
  loadStructure: (path: string) => Promise<StructureData>;
  /** Build a texture URL served by the custom protocol. */
  textureUrl: (key: string) => string;
  hasTexture: (key: string) => Promise<boolean>;
  onOpenPath: (cb: (path: string) => void) => void;
  onFileDrop: (cb: (path: string) => void) => void;
}

declare global {
  interface Window {
    blockwright: BlockwrightApi;
  }
}
