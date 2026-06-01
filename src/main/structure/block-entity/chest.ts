// Chests: vanilla chests are particle-only blockstates rendered by a dedicated
// entity renderer from a 64x64 atlas, so we synthesize their box geometry
// (bottom + lid + lock) into the `entity/chest/*` atlas. Modded chests are
// detected by name and matched to an entity texture in their own namespace.
import type { ModelElement, ResolvedModel } from '@/shared/types';
import { parseRef } from '../model-loader';
import { boxFaces, FACING_Y, textureExists, type Vec3 } from './box-uv';

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

/** Resolve a chest-like block into a synthesized entity model, or null. */
export function resolveChest(name: string, properties: Record<string, string>): ResolvedModel[] | null {
  const texture = chestTexture(name);
  if (!texture) return null;
  const y = FACING_Y[properties.facing] ?? 0;
  return [{ elements: chestElements(texture), y }];
}
