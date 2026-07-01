// The shared, WORKER-SAFE geometry core. Turns a resolved palette + block list into per-material
// vertex buffers (as transferable typed arrays) — the pure half of mesh building, with no THREE
// scene / DOM / GPU-texture dependency. BOTH the single-structure path (mesh-builder.ts, main
// thread) and the world chunk-mesh worker call this; each then wraps the buffers into
// BufferGeometry + Material + Mesh where it has the real GPU textures. Keeping this one core means
// the structure and world renderers can't drift (a golden test pins the structure output).
import type { FaceDir, PaletteEntry } from '@/shared/types';
import { addFallbackCube, addModel, type Accum, type GetAccum, type TexInfo } from './model-geometry';

/** Blocks that are worldgen markers rather than real geometry (hidden unless asked). */
const JIGSAW_NAME = 'minecraft:jigsaw';

/** Neighbour cell offset per face direction — for world face-culling. */
const NEIGHBOUR: Record<FaceDir, [number, number, number]> = {
  up: [0, 1, 0],
  down: [0, -1, 0],
  north: [0, 0, -1],
  south: [0, 0, 1],
  east: [1, 0, 0],
  west: [-1, 0, 0],
};
const DIRS: FaceDir[] = ['up', 'down', 'north', 'south', 'east', 'west'];

// ── Cross-chunk border occluder planes ────────────────────────────────────────────────
// A chunk is meshed in isolation (its own block list only), so a face lying on a chunk's X/Z
// border has no neighbour to cull against — every border face is emitted even when the block on
// the far side (in the adjacent chunk) is solid, walling off the view when you fly through terrain.
// To cull those, the world view hands each near build the four adjacent chunks' EDGE occluder
// planes: a bit per (worldY, perpendicular) telling whether the neighbour cell just outside this
// chunk is a full opaque cube. The build then treats those as occluders at the out-of-range
// coordinate (x=-1/16, z=-1/16), so a solid-against-solid chunk seam culls exactly like an interior
// seam. Java build range (1.18+ = -64..320, older 0..255 fits inside).
const BORDER_MIN_Y = -64;
const BORDER_HEIGHT = 384;
/** Bytes in one bit-packed border plane (16 columns × BORDER_HEIGHT rows). */
export const BORDER_PLANE_BYTES = (BORDER_HEIGHT * 16) >> 3;

/** The four neighbour edge planes just outside a chunk (undefined = that neighbour isn't loaded, so
 *  its border faces stay visible until it arrives). Each plane is bit-packed via `setBorderBit`. */
export interface NeighborBorders {
  /** West neighbour (x = -1), indexed by (y, z). */
  xNeg?: Uint8Array;
  /** East neighbour (x = 16), indexed by (y, z). */
  xPos?: Uint8Array;
  /** North neighbour (z = -1), indexed by (y, x). */
  zNeg?: Uint8Array;
  /** South neighbour (z = 16), indexed by (y, x). */
  zPos?: Uint8Array;
}

/** A fresh, all-false bit-packed border plane. */
export const newBorderPlane = (): Uint8Array => new Uint8Array(BORDER_PLANE_BYTES);

/** Flag the (y, perp) cell of a border plane as an occluder. `perp` is z for x-planes, x for z-planes. */
export function setBorderBit(plane: Uint8Array, y: number, perp: number): void {
  if (y < BORDER_MIN_Y || y >= BORDER_MIN_Y + BORDER_HEIGHT) return;
  const idx = (y - BORDER_MIN_Y) * 16 + perp;
  plane[idx >> 3] |= 1 << (idx & 7);
}

/** Is the (y, perp) cell of a border plane an occluder? False for a missing plane or out-of-range y. */
function borderBit(plane: Uint8Array | undefined, y: number, perp: number): boolean {
  if (!plane || y < BORDER_MIN_Y || y >= BORDER_MIN_Y + BORDER_HEIGHT) return false;
  const idx = (y - BORDER_MIN_Y) * 16 + perp;
  return (plane[idx >> 3] & (1 << (idx & 7))) !== 0;
}

/** Which palette states are full opaque cubes (so they hide neighbour faces). Shared with the world
 *  view, which precomputes each chunk's border planes on the main thread. */
export function occluderStates(palette: PaletteEntry[], textures: Map<string, TexInfo>): boolean[] {
  return palette.map((e) => isFullOpaqueCube(e, textures));
}

/** A block placement: a palette index + world position. Matches `StructureData.blocks`. */
export interface GeomBlock {
  state: number;
  pos: [number, number, number];
}

/** The minimal input the core needs (a subset of StructureData). */
export interface GeomInput {
  palette: PaletteEntry[];
  blocks: ArrayLike<GeomBlock> & Iterable<GeomBlock>;
}

/** One material's finished geometry as transferable buffers + the facts needed to build its
 *  Three.js material (textured vs flat colour, alpha kind, which texture key). */
export interface MaterialBuffers {
  key: string;
  textured: boolean;
  translucent: boolean;
  /** True = render both faces (plants/panes/glass); false = backface-cull (full opaque cubes), so
   *  flying inside terrain shows cave interiors instead of the outer shell's back faces. */
  doubleSided: boolean;
  textureKey?: string;
  color?: [number, number, number];
  positions: Float32Array;
  normals: Float32Array;
  uvs: Float32Array;
  colors: Float32Array;
}

export interface BuildGeometryOptions {
  showJigsaw?: boolean;
  hideShell?: boolean;
  /** Enable neighbour-based face culling: a full opaque cube hides the faces it shares with
   *  adjacent full opaque cubes, and a fully-buried cube is dropped entirely. Essential for the
   *  world renderer (a solid stone section would otherwise emit 4096 cubes of hidden interior
   *  faces); OFF for the structure path, which stays byte-identical. */
  occlude?: boolean;
  /** The four adjacent chunks' edge occluder planes, so faces on this chunk's X/Z border cull
   *  against solid neighbours instead of walling off the view. Only meaningful with `occlude`. */
  borders?: NeighborBorders;
  /** World build floor (world Y). A downward face whose neighbour is below this is culled — hides
   *  the bedrock layer's underside at the bottom of the world. Only meaningful with `occlude`. */
  floorY?: number;
  /** Biome grass/foliage tint (sRGB 0..1) for `tintindex` faces; omit for the default green. */
  tint?: [number, number, number];
}

const posKey = (x: number, y: number, z: number): string => `${x},${y},${z}`;

/** The raw, growable vertex arrays every accumulator carries before it's frozen into typed buffers. */
export interface RawVertexArrays {
  positions: number[];
  normals: number[];
  uvs: number[];
  colors: number[];
}

/** Freeze one accumulator's vertex arrays into transferable typed buffers, tagged with its material
 *  flags. Shared by the block-geometry core and the surface-LOD mesher so the packing lives once. */
export function packBuffers(raw: RawVertexArrays, meta: Omit<MaterialBuffers, keyof RawVertexArrays>): MaterialBuffers {
  return {
    ...meta,
    positions: new Float32Array(raw.positions),
    normals: new Float32Array(raw.normals),
    uvs: new Float32Array(raw.uvs),
    colors: new Float32Array(raw.colors),
  };
}

/** Is this palette entry a full opaque cube (so it hides neighbour faces)? A model-less coloured
 *  fallback counts; a translucent (stained glass) or non-full model does not. */
function isFullOpaqueCube(entry: PaletteEntry, textures: Map<string, TexInfo>): boolean {
  if (entry.air) return false;
  if (entry.models.length === 0) return true; // fallback colour cube fills the cell
  for (const model of entry.models) {
    if (model.elements.length === 0) return false;
    for (const el of model.elements) {
      const full =
        el.from[0] === 0 && el.from[1] === 0 && el.from[2] === 0 &&
        el.to[0] === 16 && el.to[1] === 16 && el.to[2] === 16;
      if (!full) return false;
      for (const dir of DIRS) {
        const tex = el.faces[dir]?.texture;
        if (tex && textures.get(tex)?.translucent) return false;
      }
    }
  }
  return true;
}

/** Build per-material vertex buffers for a resolved palette + block list. Pure: no scene/DOM. */
export function buildGeometryBuffers(
  data: GeomInput,
  textures: Map<string, TexInfo>,
  opts: BuildGeometryOptions = {},
): MaterialBuffers[] {
  const accums = new Map<string, Accum>();
  const getAccum: GetAccum = (key, textured, textureKey, color, translucent, doubleSided = true) => {
    let a = accums.get(key);
    if (!a) {
      a = { positions: [], normals: [], uvs: [], colors: [], textured, textureKey, color, translucent, doubleSided };
      accums.set(key, a);
    }
    return a;
  };

  // When hiding the shell, find the occupied bounding box once so we can drop any block sitting on
  // one of its six boundary planes — the piece's outer "casco".
  const bounds = opts.hideShell ? occupiedBounds(data) : null;

  // World face-culling: precompute which palette states are full opaque cubes, and the set of
  // occupied occluder positions, so a face against a solid neighbour (and fully-buried cubes) is
  // dropped. Skipped entirely for the structure path (opts.occlude falsy).
  const occluderState = opts.occlude ? occluderStates(data.palette, textures) : null;
  const occ = occluderState ? occluderSet(data, occluderState) : null;
  const query = occ ? makeOccluderQuery(occ, opts.borders, opts.floorY) : null;

  for (const block of data.blocks) {
    const entry = data.palette[block.state];
    if (entry && !opts.showJigsaw && entry.name === JIGSAW_NAME) continue;
    if (bounds && isShell(block.pos, bounds)) continue;
    // A full opaque cube backface-culls (single-sided); everything else (plants, panes, glass,
    // partial models) and the whole structure path stays double-sided so it's never one-way invisible.
    const doubleSided = occluderState ? !occluderState[block.state] : true;
    const sideSuffix = doubleSided ? '' : '|s';
    if (!entry || entry.air || entry.models.length === 0) {
      if (entry && !entry.air) {
        // A fallback cube is a full cube too — cull it against solid neighbours / drop if buried.
        const cull = query && occluderState![block.state] ? cullDirs(block.pos, query) : null;
        if (cull && cull.size === 6) continue;
        const accum = getAccum(`c:${entry.color.join(',')}${sideSuffix}`, false, undefined, entry.color, undefined, doubleSided);
        addFallbackCube(accum, block.pos, cull ?? undefined);
      }
      continue;
    }
    // Cull faces only for blocks that are themselves full cubes (a stair's faces don't map cleanly
    // to cell boundaries, so those emit whole).
    const cull = query && occluderState![block.state] ? cullDirs(block.pos, query) : null;
    if (cull && cull.size === 6) continue; // fully buried — nothing visible
    for (const model of entry.models) {
      addModel(model, block.pos, entry.color, textures, getAccum, cull ?? undefined, opts.tint, doubleSided);
    }
  }

  const out: MaterialBuffers[] = [];
  for (const [key, a] of accums) {
    if (a.positions.length === 0) continue;
    out.push(
      packBuffers(a, {
        key,
        textured: a.textured,
        translucent: !!a.translucent,
        doubleSided: a.doubleSided !== false,
        textureKey: a.textureKey,
        color: a.color,
      }),
    );
  }
  return out;
}

/** Positions of every full-opaque-cube block in the input (the occluders). */
function occluderSet(data: GeomInput, occluderState: boolean[]): Set<string> {
  const occ = new Set<string>();
  for (const block of data.blocks) {
    if (occluderState[block.state]) occ.add(posKey(block.pos[0], block.pos[1], block.pos[2]));
  }
  return occ;
}

/** Occluder query: an in-range cell hits this chunk's own set; a cell just outside the chunk's X/Z
 *  edge (a border face's neighbour) consults the adjacent chunk's border plane. A face changes
 *  exactly one axis, so at most one of x/z is ever out of the 0..15 local range. */
type OccluderQuery = (x: number, y: number, z: number) => boolean;

function makeOccluderQuery(occ: Set<string>, borders?: NeighborBorders, floorY?: number): OccluderQuery {
  return (x, y, z) => {
    // Below the world build floor counts as solid, so the bottom bedrock layer's underside is culled.
    if (floorY !== undefined && y < floorY) return true;
    if (x >= 0 && x <= 15 && z >= 0 && z <= 15) return occ.has(posKey(x, y, z));
    if (!borders) return false;
    if (x < 0) return borderBit(borders.xNeg, y, z);
    if (x > 15) return borderBit(borders.xPos, y, z);
    if (z < 0) return borderBit(borders.zNeg, y, x);
    if (z > 15) return borderBit(borders.zPos, y, x);
    return false;
  };
}

/** Directions whose neighbour cell is an occluder (so that face is hidden). */
function cullDirs(pos: [number, number, number], query: OccluderQuery): Set<FaceDir> {
  const out = new Set<FaceDir>();
  for (const dir of DIRS) {
    const [dx, dy, dz] = NEIGHBOUR[dir];
    if (query(pos[0] + dx, pos[1] + dy, pos[2] + dz)) out.add(dir);
  }
  return out;
}

/** Every ArrayBuffer backing a set of MaterialBuffers, for a postMessage transfer list. */
export function transferListFor(buffers: MaterialBuffers[]): ArrayBuffer[] {
  const list: ArrayBuffer[] = [];
  for (const b of buffers) {
    // These are freshly-allocated Float32Arrays, so `.buffer` is always a plain ArrayBuffer.
    list.push(
      b.positions.buffer as ArrayBuffer,
      b.normals.buffer as ArrayBuffer,
      b.uvs.buffer as ArrayBuffer,
      b.colors.buffer as ArrayBuffer,
    );
  }
  return list;
}

// ── shell detection (moved here from mesh-builder so both paths share it) ──────────────
type Bounds = { min: [number, number, number]; max: [number, number, number] };

/** Min/max of the piece's non-air blocks — the box whose surface is the shell. Uses the actual
 *  occupied extent (not the declared size) so air padding doesn't push the plane into empty space. */
function occupiedBounds(data: GeomInput): Bounds | null {
  const min: [number, number, number] = [Infinity, Infinity, Infinity];
  const max: [number, number, number] = [-Infinity, -Infinity, -Infinity];
  let any = false;
  for (const block of data.blocks) {
    const entry = data.palette[block.state];
    if (!entry || entry.air) continue;
    any = true;
    for (let i = 0; i < 3; i++) {
      if (block.pos[i] < min[i]) min[i] = block.pos[i];
      if (block.pos[i] > max[i]) max[i] = block.pos[i];
    }
  }
  return any ? { min, max } : null;
}

/** A block is shell if it lies on any of the bounding box's six boundary planes. */
function isShell(pos: [number, number, number], b: Bounds): boolean {
  return (
    pos[0] === b.min[0] || pos[0] === b.max[0] ||
    pos[1] === b.min[1] || pos[1] === b.max[1] ||
    pos[2] === b.min[2] || pos[2] === b.max[2]
  );
}
