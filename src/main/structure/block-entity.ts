// Block entities (chests) aren't ordinary block models — vanilla renders them
// with a dedicated entity renderer from a 64x64 texture atlas, so their
// blockstate/model only carries a particle texture. We synthesize the chest's
// box geometry here (bottom + lid + lock) with explicit box-UV mapping, reusing
// the normal ResolvedModel pipeline. Modded chests are detected by name and
// matched to their own entity texture under the workspace namespace.
import fs from 'node:fs';
import type { FaceDir, ModelElement, ModelFace, ResolvedModel } from '@/shared/types';
import { resolveTextureFile } from './content-pack';
import { parseRef } from './model-loader';

// The chest entity atlas is 64x64; model UVs are normalized to 16 = full width.
const ATLAS = 64;
const px = (n: number): number => (n * 16) / ATLAS;

type Vec3 = [number, number, number];

/** Map a block's `facing` to the blockstate y-rotation that orients the front
 *  (lock side). The base model points its front at +z (south = facing 0). */
const FACING_Y: Record<string, number> = { south: 0, west: 90, north: 180, east: 270 };

/**
 * Build the six faces of a box using Minecraft's entity box-UV unwrap, so each
 * face samples the right region of the chest atlas. `texU/texV` is the box's
 * top-left offset in the atlas (in pixels); the front (keyhole) lands on +z.
 */
function boxFaces(from: Vec3, to: Vec3, texture: string, texU: number, texV: number): Partial<Record<FaceDir, ModelFace>> {
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
  const rect = (x1: number, y1: number, x2: number, y2: number): [number, number, number, number] => [
    px(x1), px(y1), px(x2), px(y2),
  ];
  const face = (uv: [number, number, number, number]): ModelFace => ({ texture, uv });
  return {
    up: face(rect(u1, v0, u2, v1)),
    down: face(rect(u2, v0, u2 + w, v1)),
    south: face(rect(u1, v1, u2, v2)), // front (keyhole)
    north: face(rect(u3, v1, u4, v2)), // back
    west: face(rect(u0, v1, u1, v2)),
    east: face(rect(u2, v1, u3, v2)),
  };
}

/** The three boxes of a closed single chest, inset 1px in the block footprint. */
function chestElements(texture: string): ModelElement[] {
  const bottom: Vec3[] = [[1, 0, 1], [15, 10, 15]];
  const lid: Vec3[] = [[1, 9, 1], [15, 14, 15]];
  const lock: Vec3[] = [[7, 7, 15], [9, 11, 16]];
  return [
    { from: bottom[0], to: bottom[1], faces: boxFaces(bottom[0], bottom[1], texture, 0, 19) },
    { from: lid[0], to: lid[1], faces: boxFaces(lid[0], lid[1], texture, 0, 0) },
    { from: lock[0], to: lock[1], faces: boxFaces(lock[0], lock[1], texture, 1, 0) },
  ];
}

function textureExists(key: string): boolean {
  const resolved = resolveTextureFile(key);
  return !!resolved && fs.existsSync(resolved.file);
}

/** Pick the entity texture key for a chest block, or null if it isn't a chest.
 *  Vanilla chests map explicitly; modded chests are detected by name and matched
 *  to an entity texture in their own namespace (falling back to vanilla). */
function chestTexture(name: string): string | null {
  const { namespace, path: key } = parseRef(name);

  if (namespace === 'minecraft') {
    if (key === 'chest') return 'minecraft/entity/chest/normal';
    if (key === 'trapped_chest') return 'minecraft/entity/chest/trapped';
    if (key === 'ender_chest') return 'minecraft/entity/chest/ender';
    return null;
  }

  // Modded chest: no resource-pack mapping exists from block -> entity texture,
  // so try sensible namespaced conventions and keep the first that's on disk.
  if (!key.includes('chest')) return null;
  const base = key.replace(/_?chest_?/g, '') || key;
  const candidates = [
    `${namespace}/entity/chest/${key}`,
    `${namespace}/entity/chest/${base}`,
    `${namespace}/entity/${key}`,
  ];
  return candidates.find(textureExists) ?? 'minecraft/entity/chest/normal';
}

/** Resolve a chest-like block into a synthesized entity model, or null if the
 *  block isn't a block entity we render specially. */
export function resolveBlockEntity(name: string, properties: Record<string, string>): ResolvedModel[] | null {
  const texture = chestTexture(name);
  if (!texture) return null;
  const y = FACING_Y[properties.facing] ?? 0;
  return [{ elements: chestElements(texture), y }];
}
