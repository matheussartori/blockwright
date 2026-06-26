// Splitting an oversized structure into a JIGSAW assembly. A Minecraft Structure Block
// only loads up to 48×48×48 (32³ before 1.16); a bigger `.nbt` simply won't load. The fix
// is to cut the structure into a grid of pieces, each ≤ the limit, and emit a jigsaw
// assembly that reassembles them VOXEL-PERFECTLY in-world (each connector's `final_state`
// restores the one cell it sits on — see structure/io/split-structure.ts).
//
// This module is the PURE planning layer (no IO, no block data): given a size + limit it
// decides the grid, the connection tree, and the canonical file/connector names. Both the
// renderer's export preview and main's writer derive from it, so they can't drift.
import type { Direction } from '../jigsaw';
import { minorOf } from '../mc-version';

/** The user's NBT size-limit preference (Settings). `auto` derives it from the workspace's
 *  Minecraft version (≥1.16 → 48, older → 32); the explicit values pin it. */
export type NbtSizePref = 'auto' | '48' | '32';
export const DEFAULT_NBT_SIZE_PREF: NbtSizePref = 'auto';

/** 1.16 raised the Structure Block max from 32 to 48 in each axis. */
export const LIMIT_MODERN = 48;
export const LIMIT_LEGACY = 32;

/** Resolve the effective per-axis cell limit from the preference + (for `auto`) the version. */
export function effectiveNbtLimit(pref: NbtSizePref, version: string | null | undefined): number {
  if (pref === '48') return LIMIT_MODERN;
  if (pref === '32') return LIMIT_LEGACY;
  const minor = minorOf(version);
  if (!minor) return LIMIT_MODERN; // unknown → assume modern
  const [major, min] = minor.split('.').map(Number);
  return major * 100 + min >= 116 ? LIMIT_MODERN : LIMIT_LEGACY;
}

export type Vec3 = [number, number, number];

/** One grid cell of the split, in ORIGINAL structure coordinates. */
export interface SplitSlot {
  index: number;
  /** Grid coordinates (which division along each axis). */
  i: number;
  j: number;
  k: number;
  /** Min corner in original coords. */
  min: Vec3;
  /** Cell extent (each axis ≤ limit). */
  size: Vec3;
}

/** A parent→child connection across a shared face (the assembly's spanning tree). */
export interface SplitEdge {
  parent: number; // slot index
  child: number; // slot index
  /** Direction from parent to child (axis-signed). */
  dir: Direction;
  /** Stable id, the child slot's grid coords (`i_j_k`) — unique since the tree gives each
   *  non-root slot exactly one parent. */
  edgeId: string;
}

export interface SplitPlan {
  /** Whether any axis exceeds the limit (else a single piece — no split). */
  oversized: boolean;
  limit: number;
  size: Vec3;
  divisions: { nx: number; ny: number; nz: number };
  slots: SplitSlot[];
  edges: SplitEdge[];
  /** Root slot index (center of the grid). */
  root: number;
  /** Max tree depth from root (drives the jigsaw `size`/recursion field). */
  depth: number;
  pieceCount: number;
}

/** Hard cap matching the in-app assembler's MAX_PIECES; above this we refuse to split. */
export const MAX_SPLIT_PIECES = 200;
/** Jigsaw recursion `size` field caps at 20 in vanilla. */
export const MAX_JIGSAW_DEPTH = 20;
/** Vanilla discards pieces beyond ~max_distance_from_center; with a center root the
 *  reachable half-extent is ~116 blocks, so a structure wider than ~232 may not fully
 *  reassemble as one feature. Used only to warn. */
export const MAX_RECONSTRUCT_SPAN = 232;

/** Divide a length into balanced contiguous segments, each ≤ limit (the first `rem` get +1). */
export function splitAxis(len: number, limit: number): { start: number; len: number }[] {
  const n = Math.max(1, Math.ceil(len / limit));
  const base = Math.floor(len / n);
  const rem = len - base * n;
  const out: { start: number; len: number }[] = [];
  let start = 0;
  for (let s = 0; s < n; s++) {
    const segLen = base + (s < rem ? 1 : 0);
    out.push({ start, len: segLen });
    start += segLen;
  }
  return out;
}

/** Index of the center segment of `n` (root bias toward the middle to keep the tree shallow). */
const centerIndex = (n: number): number => Math.floor(n / 2);

/** Plan how to split a structure of `size` into pieces ≤ `limit`, with a center-rooted
 *  spanning tree over the grid. Pure — needs only the size + limit. */
export function splitPlan(size: Vec3, limit: number): SplitPlan {
  const [W, H, D] = size;
  const xs = splitAxis(W, limit);
  const ys = splitAxis(H, limit);
  const zs = splitAxis(D, limit);
  const nx = xs.length;
  const ny = ys.length;
  const nz = zs.length;

  const slots: SplitSlot[] = [];
  const indexOf = (i: number, j: number, k: number): number => (i * ny + j) * nz + k;
  for (let i = 0; i < nx; i++) {
    for (let j = 0; j < ny; j++) {
      for (let k = 0; k < nz; k++) {
        slots.push({
          index: indexOf(i, j, k),
          i,
          j,
          k,
          min: [xs[i].start, ys[j].start, zs[k].start],
          size: [xs[i].len, ys[j].len, zs[k].len],
        });
      }
    }
  }

  const root = indexOf(centerIndex(nx), centerIndex(ny), centerIndex(nz));
  const oversized = nx > 1 || ny > 1 || nz > 1;

  // Center-rooted BFS over the 6-neighbour grid → a shallow spanning tree.
  const edges: SplitEdge[] = [];
  let depth = 0;
  if (oversized) {
    const visited = new Set<number>([root]);
    let frontier: { idx: number; d: number }[] = [{ idx: root, d: 0 }];
    while (frontier.length) {
      const next: { idx: number; d: number }[] = [];
      for (const { idx, d } of frontier) {
        const s = slots[idx];
        for (const nb of neighbours(s, nx, ny, nz, indexOf)) {
          if (visited.has(nb.index)) continue;
          visited.add(nb.index);
          const child = slots[nb.index];
          edges.push({ parent: idx, child: nb.index, dir: nb.dir, edgeId: `${child.i}_${child.j}_${child.k}` });
          depth = Math.max(depth, d + 1);
          next.push({ idx: nb.index, d: d + 1 });
        }
      }
      frontier = next;
    }
  }

  return {
    oversized,
    limit,
    size,
    divisions: { nx, ny, nz },
    slots,
    edges,
    root,
    depth,
    pieceCount: slots.length,
  };
}

/** The 6 axis-adjacent grid neighbours of a slot, with the direction parent→neighbour. */
function neighbours(
  s: SplitSlot,
  nx: number,
  ny: number,
  nz: number,
  indexOf: (i: number, j: number, k: number) => number,
): { index: number; dir: Direction }[] {
  const out: { index: number; dir: Direction }[] = [];
  if (s.i + 1 < nx) out.push({ index: indexOf(s.i + 1, s.j, s.k), dir: 'east' });
  if (s.i - 1 >= 0) out.push({ index: indexOf(s.i - 1, s.j, s.k), dir: 'west' });
  if (s.j + 1 < ny) out.push({ index: indexOf(s.i, s.j + 1, s.k), dir: 'up' });
  if (s.j - 1 >= 0) out.push({ index: indexOf(s.i, s.j - 1, s.k), dir: 'down' });
  if (s.k + 1 < nz) out.push({ index: indexOf(s.i, s.j, s.k + 1), dir: 'south' });
  if (s.k - 1 >= 0) out.push({ index: indexOf(s.i, s.j, s.k - 1), dir: 'north' });
  return out;
}

// --- Connector geometry (the encode side reuses this) ------------------------

/** A jigsaw orientation pair for a connection in direction `dir` (parent faces the child,
 *  child faces back). Verticals use a horizontal `top` so the `aligned` joint pins q=0. */
export interface EdgeOrientation {
  parent: string;
  child: string;
}

const VERTICAL_TOP: Direction = 'north';

export function edgeOrientation(dir: Direction): EdgeOrientation {
  switch (dir) {
    case 'east':
      return { parent: 'east_up', child: 'west_up' };
    case 'west':
      return { parent: 'west_up', child: 'east_up' };
    case 'south':
      return { parent: 'south_up', child: 'north_up' };
    case 'north':
      return { parent: 'north_up', child: 'south_up' };
    case 'up':
      return { parent: `up_${VERTICAL_TOP}`, child: `down_${VERTICAL_TOP}` };
    case 'down':
      return { parent: `down_${VERTICAL_TOP}`, child: `up_${VERTICAL_TOP}` };
  }
}

/** The two free (in-face) axes for a connection along `dir`: the axes that span the shared
 *  face. Returned as axis indices (0=x,1=y,2=z). */
export function faceAxes(dir: Direction): [number, number] {
  if (dir === 'east' || dir === 'west') return [1, 2]; // y,z
  if (dir === 'up' || dir === 'down') return [0, 2]; // x,z
  return [0, 1]; // north/south → x,y
}

/** Local connector cell in the PARENT piece for a seam at face-coords (a,b). `a`/`b` index
 *  the two free axes from `faceAxes(dir)`. `psize` is the parent piece extent. */
export function parentSeamCell(dir: Direction, psize: Vec3, a: number, b: number): Vec3 {
  switch (dir) {
    case 'east':
      return [psize[0] - 1, a, b];
    case 'west':
      return [0, a, b];
    case 'south':
      return [a, b, psize[2] - 1];
    case 'north':
      return [a, b, 0];
    case 'up':
      return [a, psize[1] - 1, b];
    case 'down':
      return [a, 0, b];
  }
}

/** Local connector cell in the CHILD piece for the same seam (the cell facing back). */
export function childSeamCell(dir: Direction, csize: Vec3, a: number, b: number): Vec3 {
  switch (dir) {
    case 'east':
      return [0, a, b];
    case 'west':
      return [csize[0] - 1, a, b];
    case 'south':
      return [a, b, 0];
    case 'north':
      return [a, b, csize[2] - 1];
    case 'up':
      return [a, 0, b];
    case 'down':
      return [a, csize[1] - 1, b];
  }
}

// --- Canonical names (file + connector) --------------------------------------

export const pieceName = (slot: SplitSlot): string => `p_${slot.i}_${slot.j}_${slot.k}`;

// --- Reassembly manifest -----------------------------------------------------
// A split is the FORWARD half (structure → pieces); reassembly is the inverse
// (pieces → structure, see main/structure/io/merge-structure.ts). The pieces are a
// deterministic function of `size` + `limit`, so a tiny manifest written beside an
// assembly is all reassembly needs to recompute the slot grid and place each piece.
// It rides with the export paths that are reassembly targets (Export As, Export to
// World, the structure-block scaffold) — not the mod-workspace tree, which the user
// reassembles from their library original instead.

/** The manifest filename dropped at the root of a reassemblable assembly. */
export const SPLIT_MANIFEST_FILE = 'blockwright.split.json';

/** Records what a split produced, so Blockwright can stitch the pieces back together. */
export interface SplitManifest {
  /** Marker + schema version so a stray JSON isn't mistaken for one. */
  blockwright: 'split';
  v: 1;
  namespace: string;
  /** Resource base name — the pieces live under `<base>/` as `<pieceName>.nbt`. */
  base: string;
  size: Vec3;
  limit: number;
  dataVersion: number;
}

/** Build the manifest object for a split export. */
export function splitManifest(p: {
  namespace: string;
  base: string;
  size: Vec3;
  limit: number;
  dataVersion: number;
}): SplitManifest {
  return { blockwright: 'split', v: 1, namespace: p.namespace, base: p.base, size: p.size, limit: p.limit, dataVersion: p.dataVersion };
}

/** Validate + narrow an unknown JSON into a SplitManifest, or null if it isn't one. */
export function parseSplitManifest(json: unknown): SplitManifest | null {
  if (!json || typeof json !== 'object') return null;
  const m = json as Record<string, unknown>;
  if (m.blockwright !== 'split' || m.v !== 1) return null;
  const size = m.size;
  if (!Array.isArray(size) || size.length !== 3 || !size.every((n) => typeof n === 'number')) return null;
  if (typeof m.base !== 'string' || typeof m.namespace !== 'string') return null;
  if (typeof m.limit !== 'number' || typeof m.dataVersion !== 'number') return null;
  return {
    blockwright: 'split',
    v: 1,
    namespace: m.namespace,
    base: m.base,
    size: size as Vec3,
    limit: m.limit,
    dataVersion: m.dataVersion,
  };
}

export const startPoolLeaf = 'start';
export const edgePoolLeaf = (edgeId: string): string => `e_${edgeId}`;
export const outConnectorName = (edgeId: string): string => `out_${edgeId}`;
export const inConnectorName = (edgeId: string): string => `in_${edgeId}`;
