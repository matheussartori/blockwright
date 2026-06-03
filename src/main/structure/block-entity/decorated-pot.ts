// Decorated pots: like chests and banners, a decorated pot's blockstate model is
// particle-only — vanilla renders it with a dedicated block-entity renderer from
// the `entity/decorated_pot` atlas, so the normal model path leaves it as a flat
// fallback cube. We synthesize a recognizable pot (a square body capped by a
// narrower neck/rim) skinned with the plain `decorated_pot_side` terracotta
// texture. The sherd patterns and the base-texture rim live in block-entity NBT,
// which the loader discards, so we render the undecorated pot.
import type { FaceDir, ModelElement, ModelFace, ResolvedModel } from '@/shared/types';
import { parseRef } from '../model-loader';
import { FACING_Y, type Vec3 } from './box-uv';

// The plain pot side (16×16). Its leftmost and rightmost columns are TRANSPARENT
// (the painted face is the inner 14px, x=1..15), so a full 0..16 UV samples those
// transparent edges and leaves see-through slits at the box corners. Inset the U
// range to 1..15 to map just the opaque region across each face. (V has no
// transparent rows, so it stays 0..16.)
const SIDE = 'minecraft/entity/decorated_pot/decorated_pot_side';

const face = (): ModelFace => ({ texture: SIDE, uv: [1, 0, 15, 16] });

function faces(dirs: FaceDir[]): Partial<Record<FaceDir, ModelFace>> {
  const out: Partial<Record<FaceDir, ModelFace>> = {};
  for (const d of dirs) out[d] = face();
  return out;
}

/** Two stacked boxes: a wide body capped by a narrower neck. The body's `up`
 *  face caps the top ring so the gap beside the neck isn't see-through, and the
 *  neck's `down` face is omitted since it sits flush on that cap. */
function potElements(): ModelElement[] {
  const body: [Vec3, Vec3] = [[1, 0, 1], [15, 13, 15]];
  const neck: [Vec3, Vec3] = [[4, 13, 4], [12, 16, 12]];
  return [
    { from: body[0], to: body[1], faces: faces(['north', 'south', 'east', 'west', 'up', 'down']) },
    { from: neck[0], to: neck[1], faces: faces(['north', 'south', 'east', 'west', 'up']) },
  ];
}

/** Resolve a decorated pot into a synthesized entity model, or null otherwise. */
export function resolveDecoratedPot(
  name: string,
  properties: Record<string, string>,
): ResolvedModel[] | null {
  const { namespace, path: key } = parseRef(name);
  if (namespace !== 'minecraft' || key !== 'decorated_pot') return null;
  const y = FACING_Y[properties.facing] ?? 0;
  return [{ elements: potElements(), y }];
}
