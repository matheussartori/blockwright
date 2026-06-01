// Shared helpers for synthesizing block-entity geometry from a 64x64 texture
// atlas. Block entities (chests, beds, banners) aren't ordinary block models —
// vanilla renders them with a dedicated entity renderer, so their blockstate/
// model only carries a particle texture. We rebuild their boxes here with
// explicit box-UV mapping into the entity atlas, reusing the normal
// ResolvedModel pipeline.
import fs from 'node:fs';
import type { FaceDir, ModelFace } from '@/shared/types';
import { resolveTextureFile } from '../content-pack';

// Entity atlases are authored at 64px; model UVs live in 0..16 space (16 = full
// texture width), so atlas pixels map through `px`.
const ATLAS = 64;
export const px = (n: number): number => (n * 16) / ATLAS;

export type Vec3 = [number, number, number];

/** A UV rectangle in atlas pixels, converted to the 0..16 model space. */
export function rect(x1: number, y1: number, x2: number, y2: number): [number, number, number, number] {
  return [px(x1), px(y1), px(x2), px(y2)];
}

/**
 * Build the six faces of a box using Minecraft's entity box-UV unwrap, so each
 * face samples the right region of the atlas. `texU/texV` is the box's top-left
 * offset in the atlas (in pixels); the front face lands on +z (south).
 */
export function boxFaces(
  from: Vec3,
  to: Vec3,
  texture: string,
  texU: number,
  texV: number,
): Partial<Record<FaceDir, ModelFace>> {
  const w = to[0] - from[0];
  const h = to[1] - from[1];
  const d = to[2] - from[2];
  const u0 = texU;
  const u1 = texU + d;
  const u2 = texU + d + w;
  const u3 = texU + 2 * d + w;
  const u4 = texU + 2 * d + 2 * w;
  const v0 = texV;
  const v1 = texV + d;
  const v2 = texV + d + h;
  const face = (uv: [number, number, number, number]): ModelFace => ({ texture, uv });
  return {
    up: face(rect(u1, v0, u2, v1)),
    down: face(rect(u2, v0, u2 + w, v1)),
    south: face(rect(u1, v1, u2, v2)), // front
    north: face(rect(u3, v1, u4, v2)), // back
    west: face(rect(u0, v1, u1, v2)),
    east: face(rect(u2, v1, u3, v2)),
  };
}

/** Map a block's `facing` to the blockstate y-rotation that orients its front
 *  toward that direction. The base geometry points its front at +z (south). */
export const FACING_Y: Record<string, number> = { south: 0, west: 90, north: 180, east: 270 };

/** Whether a resolved texture key ("namespace/path") exists on disk. */
export function textureExists(key: string): boolean {
  const resolved = resolveTextureFile(key);
  return !!resolved && fs.existsSync(resolved.file);
}
