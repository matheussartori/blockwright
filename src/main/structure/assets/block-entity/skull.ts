// Skulls / mob heads: skeleton_skull, wither_skeleton_skull, zombie_head,
// creeper_head, piglin_head, player_head and their `_wall_` variants are
// particle-only blockstates (their model is `block/skull` — just a soul_sand
// particle). Vanilla renders them with a dedicated SkullBlockRenderer that
// samples the 8×8×8 *head* box out of a mob's entity texture (the same top-left
// head region a player skin uses), so the normal model path leaves them as a flat
// fallback cube. We synthesize that head box here, plus an inflated "hat" overlay
// for the mobs that have a second skin layer (player/zombie).
//
// Unlike the other entity atlases (chest/bed = 64×64), skull source textures vary
// in size (skeleton/creeper = 64×32, zombie/player = 64×64), so the V axis can't
// reuse box-uv's square-atlas `px`; `headFaces` takes the atlas height explicitly.
// (The enderdragon head has a wholly different model and is intentionally left to
// the fallback path rather than forced into a cube.)
import type { FaceDir, ModelElement, ModelFace, ResolvedModel } from '@/shared/types';
import { parseRef } from '../model-loader';
import { FACING_Y, type Vec3 } from './box-uv';

interface SkullDef {
  /** Resolved entity texture key ("namespace/path", no extension). */
  texture: string;
  atlasW: number;
  atlasH: number;
  /** Whether the skin has a second (hat) layer at texOffs (32,0). */
  hat?: boolean;
}

// mob key (block name minus the _skull/_head/_wall_ suffix) → its head texture.
const SKULLS: Record<string, SkullDef> = {
  skeleton: { texture: 'minecraft/entity/skeleton/skeleton', atlasW: 64, atlasH: 32 },
  wither_skeleton: { texture: 'minecraft/entity/skeleton/wither_skeleton', atlasW: 64, atlasH: 32 },
  creeper: { texture: 'minecraft/entity/creeper/creeper', atlasW: 64, atlasH: 32 },
  zombie: { texture: 'minecraft/entity/zombie/zombie', atlasW: 64, atlasH: 64, hat: true },
  piglin: { texture: 'minecraft/entity/piglin/piglin', atlasW: 64, atlasH: 64 },
  player: { texture: 'minecraft/entity/player/wide/steve', atlasW: 64, atlasH: 64, hat: true },
};

// The head is an 8×8×8 box; its skin unwrap occupies the same texels regardless of
// the box's geometric inflation (the hat overlay reuses the same 8px layout).
const HEAD = 8;

/**
 * The six faces of an 8×8×8 head, unwrapped Minecraft-skin style from atlas
 * offset (u, v). Same layout as box-uv's `boxFaces`, but U/V scale to the texture's
 * own dimensions so non-square skull atlases (64×32) map correctly.
 */
function headFaces(texture: string, u: number, v: number, atlasW: number, atlasH: number): Partial<Record<FaceDir, ModelFace>> {
  const r = (x1: number, y1: number, x2: number, y2: number): [number, number, number, number] => [
    (x1 * 16) / atlasW,
    (y1 * 16) / atlasH,
    (x2 * 16) / atlasW,
    (y2 * 16) / atlasH,
  ];
  const f = (uv: [number, number, number, number]): ModelFace => ({ texture, uv });
  const u0 = u;
  const u1 = u + HEAD;
  const u2 = u + 2 * HEAD;
  const u3 = u + 3 * HEAD;
  const u4 = u + 4 * HEAD;
  const v0 = v;
  const v1 = v + HEAD;
  const v2 = v + 2 * HEAD;
  return {
    up: f(r(u1, v0, u2, v1)),
    down: f(r(u2, v0, u3, v1)),
    south: f(r(u1, v1, u2, v2)), // front (face)
    north: f(r(u3, v1, u4, v2)), // back
    west: f(r(u0, v1, u1, v2)),
    east: f(r(u2, v1, u3, v2)),
  };
}

/** Build the head element(s) for a skull, sized/positioned for floor vs wall mount.
 *  Canonical orientation (no rotation): the face points +z (south). */
function skullElements(def: SkullDef, wall: boolean): ModelElement[] {
  // Floor: an 8-cube on the block floor, centered. Wall: centered vertically,
  // pushed back against the wall behind it (the -z face touches the wall).
  const from: Vec3 = wall ? [4, 4, 0] : [4, 0, 4];
  const to: Vec3 = wall ? [12, 12, 8] : [12, 8, 12];
  const elements: ModelElement[] = [
    { from, to, faces: headFaces(def.texture, 0, 0, def.atlasW, def.atlasH) },
  ];
  if (def.hat) {
    // Hat layer at texOffs (32,0), inflated 0.5px on each side so it sits proud of
    // the base head without z-fighting.
    const hf: Vec3 = [from[0] - 0.5, from[1] - 0.5, from[2] - 0.5];
    const ht: Vec3 = [to[0] + 0.5, to[1] + 0.5, to[2] + 0.5];
    elements.push({ from: hf, to: ht, faces: headFaces(def.texture, 32, 0, def.atlasW, def.atlasH) });
  }
  return elements;
}

/** Resolve a skull/head block into a synthesized head model, or null otherwise. */
export function resolveSkull(name: string, properties: Record<string, string>): ResolvedModel[] | null {
  const { namespace, path: key } = parseRef(name);
  if (namespace !== 'minecraft') return null;

  const m = /^(.+?)_(wall_)?(?:skull|head)$/.exec(key);
  if (!m) return null;
  const def = SKULLS[m[1]];
  if (!def) return null;
  const wall = !!m[2];

  // Wall heads orient by `facing`; floor heads by the 16-step `rotation` (each
  // step 22.5°, matching Minecraft yaw: 0 = south, increasing clockwise).
  const y = wall
    ? FACING_Y[properties.facing] ?? 0
    : ((Number(properties.rotation) || 0) % 16) * 22.5;

  return [{ elements: skullElements(def, wall), y }];
}
