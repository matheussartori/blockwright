// Resolve structure ENTITIES (armor stands, item frames, mobs) into the render-ready
// StructureEntity shape the viewer draws. Unlike blocks — and unlike block entities, which
// are synthesized from the block NAME — entities have no palette block, so the few fields the
// viewer needs (id, precise position, y-yaw, a fallback color, the resolved texture key, and
// armor-stand display flags + `Pose` limb rotations) are projected off the raw NBT here.
import type { ArmorStandPose, StructureEntity } from '@/shared/types';
import type { RawEntity } from '../io/raw';
import { fallbackColor } from './fallback-color';
import { textureExists } from './block-entity/box-uv';

const ARMOR_STAND = 'minecraft:armor_stand';
// Modern packs (1.19+) keep the armor stand texture under an `armorstand/` subfolder.
const ARMOR_STAND_TEX = 'minecraft/entity/armorstand/wood';

/** Project raw entities into the render-ready shapes the viewer draws. `canResolve` gates the
 *  disk lookup for the armor stand's entity texture (no pack/workspace → fall back to a cube). */
export function resolveEntities(rawEntities: RawEntity[], canResolve: boolean): StructureEntity[] {
  // The armor stand texture is shared by every stand; resolve it once (a disk check).
  const standTexKey = canResolve && textureExists(ARMOR_STAND_TEX) ? ARMOR_STAND_TEX : null;
  return rawEntities.map((raw) => toStructureEntity(raw, standTexKey));
}

/** Project a single raw entity's NBT into a StructureEntity: id, position, y-yaw, a fallback
 *  color, the resolved texture key, and (armor stand only) the display flags + `Pose`. */
function toStructureEntity(raw: RawEntity, standTexKey: string | null): StructureEntity {
  const nbt = raw.nbt ?? {};
  const id = typeof nbt.id === 'string' ? nbt.id : 'minecraft:unknown';
  const rot = Array.isArray(nbt.Rotation) ? Number(nbt.Rotation[0]) : 0;
  const isStand = id === ARMOR_STAND;
  return {
    id,
    pos: raw.pos,
    rotation: Number.isFinite(rot) ? rot : 0,
    color: fallbackColor(id),
    textureKey: isStand ? standTexKey : null,
    ...(isStand
      ? {
          small: flag(nbt.Small),
          showArms: flag(nbt.ShowArms),
          noBasePlate: flag(nbt.NoBasePlate),
          pose: readPose(nbt.Pose),
        }
      : {}),
  };
}

/** Coerce an NBT byte/bool flag (absent stays absent). */
function flag(v: unknown): boolean | undefined {
  return v === undefined ? undefined : v === 1 || v === true;
}

/** Read an armor stand's `Pose` compound into per-bone Euler degrees (absent bones omitted). */
function readPose(raw: unknown): ArmorStandPose | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const src = raw as Record<string, unknown>;
  const pose: ArmorStandPose = {};
  const set = (key: keyof ArmorStandPose, v: unknown) => {
    const parsed = vec3(v);
    if (parsed) pose[key] = parsed;
  };
  set('head', src.Head);
  set('body', src.Body);
  set('leftArm', src.LeftArm);
  set('rightArm', src.RightArm);
  set('leftLeg', src.LeftLeg);
  set('rightLeg', src.RightLeg);
  return Object.keys(pose).length ? pose : undefined;
}

/** Parse a 3-element numeric NBT list into a tuple (shorter/non-list → undefined). */
function vec3(v: unknown): [number, number, number] | undefined {
  return Array.isArray(v) && v.length >= 3 ? [Number(v[0]), Number(v[1]), Number(v[2])] : undefined;
}
