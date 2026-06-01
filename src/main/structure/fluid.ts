// Fluids (water, lava): their blockstate model is particle-only — vanilla
// renders them with a dedicated fluid renderer, so we synthesize a full cube
// using the animated "still" strip. The renderer auto-detects the vertical
// animation strip and samples its first frame, so a plain 0..16 UV is correct.
// Water's still texture is grayscale and biome-tinted in game, so we apply a
// fixed blue tint; lava's texture is already colored.
import type { FaceDir, ModelFace, ResolvedModel } from '@/shared/types';
import { parseRef } from './model-loader';

// Default (biome-less) water tint, sRGB; matches Minecraft's fallback 0x3F76E4.
const WATER_TINT: [number, number, number] = [0x3f / 255, 0x76 / 255, 0xe4 / 255];

function cubeFaces(texture: string, tint?: [number, number, number]): Partial<Record<FaceDir, ModelFace>> {
  const face = (): ModelFace => ({ texture, uv: [0, 0, 16, 16], tint });
  return { down: face(), up: face(), north: face(), south: face(), east: face(), west: face() };
}

function fullCube(texture: string, tint?: [number, number, number]): ResolvedModel[] {
  return [{ elements: [{ from: [0, 0, 0], to: [16, 16, 16], faces: cubeFaces(texture, tint) }] }];
}

/** Resolve water/lava into a synthesized still-texture cube, or null. */
export function resolveFluid(name: string): ResolvedModel[] | null {
  const { namespace, path: key } = parseRef(name);
  if (namespace !== 'minecraft') return null;
  if (key === 'water') return fullCube('minecraft/block/water_still', WATER_TINT);
  if (key === 'lava') return fullCube('minecraft/block/lava_still');
  return null;
}
