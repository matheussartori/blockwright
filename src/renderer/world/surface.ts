// Mid/far LOD: a cheap SURFACE mesh from a chunk's Heightmaps — far fewer faces than full geometry,
// but with real silhouette. Each column emits a top quad AT its surface height PLUS vertical "skirt"
// quads down to any lower neighbour column (so cliffs/hills read from the SIDE, not just top-down —
// a single top quad is edge-on and invisible at a grazing fly-through angle, which looked like empty
// chunks). `mid` textures the quads with the surface block's texture; `far` uses a flat colour. Runs
// in the chunk-mesh worker.
import type { ChunkRenderPayload, ChunkSectionPayload, PaletteEntry } from '@/shared/types';
import type { MaterialBuffers } from '../viewer/geometry-core';
import type { TexInfo } from '../viewer/model-geometry';

interface Accum {
  positions: number[];
  normals: number[];
  uvs: number[];
  colors: number[];
  textured: boolean;
  textureKey?: string;
  color?: [number, number, number];
}

/** A representative top-down colour for a whole chunk (for the minimap): the average surface-block
 *  colour over a sampled grid of columns, biome-tinted so grass reads green (its texture is a
 *  grayscale that's only tinted at render time via tintindex). */
export function chunkSurfaceColor(payload: ChunkRenderPayload, textures: Map<string, TexInfo>): [number, number, number] {
  const hm = payload.heightmap;
  if (!hm) return [0.3, 0.32, 0.36];
  const sections = new Map<number, ChunkSectionPayload>();
  for (const s of payload.sections) sections.set(s.sectionY, s);
  const air = payload.palette.map((p) => p.air);
  let r = 0;
  let g = 0;
  let b = 0;
  let n = 0;
  for (let lz = 1; lz < 16; lz += 3) {
    for (let lx = 1; lx < 16; lx += 3) {
      const worldY = hm[lz * 16 + lx];
      const sy = Math.floor(worldY / 16);
      const section = sections.get(sy);
      if (!section) continue;
      const state = cellState(section, lx, worldY - sy * 16, lz);
      if (air[state]) continue;
      const entry = payload.palette[state];
      if (!entry) continue;
      const c = surfaceColorOf(entry, textures, payload.grassTint);
      r += c[0];
      g += c[1];
      b += c[2];
      n++;
    }
  }
  return n ? [r / n, g / n, b / n] : [0.3, 0.32, 0.36];
}

const DEFAULT_GRASS: [number, number, number] = [0x7c / 255, 0xbd / 255, 0x59 / 255];

/** The surface block's top face: its texture key + the colour to multiply (biome grass for a
 *  `tintindex` face, an explicit `tint`, else none). */
function topFace(entry: PaletteEntry): { texture: string | null; mul: [number, number, number] | null } {
  for (const model of entry.models) {
    for (const el of model.elements) {
      const face = el.faces.up ?? el.faces.north ?? el.faces.down;
      if (!face) continue;
      const mul = face.tint ?? (face.tintindex !== undefined && face.tintindex >= 0 ? DEFAULT_GRASS : null);
      return { texture: face.texture ?? null, mul };
    }
  }
  return { texture: null, mul: null };
}

/** The surface block's texture key (top face). */
function topTexture(entry: PaletteEntry): string | null {
  return topFace(entry).texture;
}

/** The biome-tinted flat colour for a surface block (avg texture colour × tint, or fallback). */
function surfaceColorOf(
  entry: PaletteEntry,
  textures: Map<string, TexInfo>,
  grassTint: [number, number, number] | null,
): [number, number, number] {
  const { texture, mul } = topFace(entry);
  const base = (texture && textures.get(texture)?.avgColor) || entry.color;
  const tint = mul === DEFAULT_GRASS ? grassTint ?? DEFAULT_GRASS : mul;
  return tint ? [base[0] * tint[0], base[1] * tint[1], base[2] * tint[2]] : base;
}

/** Read the palette index at a section-local cell (YZX), honouring uniform fills. */
function cellState(section: ChunkSectionPayload, lx: number, ly: number, lz: number): number {
  if (section.uniform || !section.blocks) return section.fill;
  return section.blocks[ly * 256 + lz * 16 + lx];
}

/** Build the surface mesh (top quads + skirts) from the heightmap. [] when there's no heightmap. */
export function buildSurface(
  payload: ChunkRenderPayload,
  textures: Map<string, TexInfo>,
  textured: boolean,
): MaterialBuffers[] {
  const hm = payload.heightmap;
  if (!hm) return [];

  const sections = new Map<number, ChunkSectionPayload>();
  for (const s of payload.sections) sections.set(s.sectionY, s);
  const air = payload.palette.map((p) => p.air);

  const accums = new Map<string, Accum>();
  const get = (key: string, isTex: boolean, textureKey?: string, color?: [number, number, number]): Accum => {
    let a = accums.get(key);
    if (!a) {
      a = { positions: [], normals: [], uvs: [], colors: [], textured: isTex, textureKey, color };
      accums.set(key, a);
    }
    return a;
  };
  const h = (lx: number, lz: number): number => hm[lz * 16 + lx];

  for (let lz = 0; lz < 16; lz++) {
    for (let lx = 0; lx < 16; lx++) {
      const worldY = h(lx, lz);
      const sy = Math.floor(worldY / 16);
      const section = sections.get(sy);
      if (!section) continue;
      const state = cellState(section, lx, worldY - sy * 16, lz);
      if (air[state]) continue;
      const entry = payload.palette[state];
      if (!entry) continue;

      // Mid = textured; far = a flat, BIOME-TINTED colour (real terrain colour: grass green, sand
      // tan) instead of the grayscale raw texture / deterministic hash.
      const tex = topTexture(entry);
      const useTex = textured && tex !== null && textures.has(tex);
      let accum: Accum;
      if (useTex) {
        accum = get(`t:${tex}`, true, tex!);
      } else {
        const avg = surfaceColorOf(entry, textures, payload.grassTint);
        accum = get(`c:${avg.join(',')}`, false, undefined, avg);
      }

      const top = worldY + 1;
      pushTopQuad(accum, lx, top, lz);

      // Skirts: a vertical wall to each lower in-chunk neighbour (the exposed cliff face). Skipped
      // at chunk edges (the neighbouring chunk fills its own side) to avoid double walls.
      if (lx + 1 < 16) skirt(accum, 'east', lx, lz, top, h(lx + 1, lz) + 1);
      if (lx - 1 >= 0) skirt(accum, 'west', lx, lz, top, h(lx - 1, lz) + 1);
      if (lz + 1 < 16) skirt(accum, 'south', lx, lz, top, h(lx, lz + 1) + 1);
      if (lz - 1 >= 0) skirt(accum, 'north', lx, lz, top, h(lx, lz - 1) + 1);
    }
  }

  const out: MaterialBuffers[] = [];
  for (const [key, a] of accums) {
    if (!a.positions.length) continue;
    out.push({
      key,
      textured: a.textured,
      translucent: false,
      // Surface quads + skirts are viewed from any angle (grazing fly-through), so keep both sides.
      doubleSided: true,
      textureKey: a.textureKey,
      color: a.color,
      positions: new Float32Array(a.positions),
      normals: new Float32Array(a.normals),
      uvs: new Float32Array(a.uvs),
      colors: new Float32Array(a.colors),
    });
  }
  return out;
}

/** A single upward-facing unit quad at (x, y, z) — two triangles, white vertex colour. */
function pushTopQuad(a: Accum, x: number, y: number, z: number): void {
  pushQuad(a, [
    [x, y, z],
    [x + 1, y, z],
    [x + 1, y, z + 1],
    [x, y, z + 1],
  ], [0, 1, 0]);
}

/** A vertical wall on one side of column (lx,lz), from the neighbour's top down to this top. Only
 *  emitted when the neighbour is lower (`nTop < top`) — the exposed cliff face. */
function skirt(a: Accum, side: 'east' | 'west' | 'south' | 'north', lx: number, lz: number, top: number, nTop: number): void {
  if (nTop >= top) return;
  const y0 = nTop; // bottom of the wall (neighbour surface)
  const y1 = top; // this column's surface
  let v: number[][];
  if (side === 'east') {
    const x = lx + 1;
    v = [[x, y1, lz], [x, y1, lz + 1], [x, y0, lz + 1], [x, y0, lz]];
  } else if (side === 'west') {
    const x = lx;
    v = [[x, y1, lz + 1], [x, y1, lz], [x, y0, lz], [x, y0, lz + 1]];
  } else if (side === 'south') {
    const z = lz + 1;
    v = [[lx + 1, y1, z], [lx, y1, z], [lx, y0, z], [lx + 1, y0, z]];
  } else {
    const z = lz;
    v = [[lx, y1, z], [lx + 1, y1, z], [lx + 1, y0, z], [lx, y0, z]];
  }
  const n = side === 'east' ? [1, 0, 0] : side === 'west' ? [-1, 0, 0] : side === 'south' ? [0, 0, 1] : [0, 0, -1];
  pushQuad(a, v, n, top - nTop);
}

/** Push a quad (4 verts, CCW) as two triangles with the given normal. `vSpan` scales the V texcoord
 *  for tall skirts so the texture tiles down the wall (defaults to 1 for the top quad). */
function pushQuad(a: Accum, v: number[][], n: number[], vSpan = 1): void {
  const uv = [
    [0, 0],
    [1, 0],
    [1, vSpan],
    [0, vSpan],
  ];
  for (const i of [0, 1, 2, 0, 2, 3]) {
    a.positions.push(v[i][0], v[i][1], v[i][2]);
    a.normals.push(n[0], n[1], n[2]);
    a.uvs.push(uv[i][0], uv[i][1]);
    a.colors.push(1, 1, 1);
  }
}
