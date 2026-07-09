// Resolve structure ENTITIES (armor stands, item frames, mobs) into the render-ready
// StructureEntity shape the viewer draws. Unlike blocks — and unlike block entities, which
// are synthesized from the block NAME — entities have no palette block, so the fields the
// viewer needs are projected off the raw NBT here: id, precise position, y-yaw, a fallback
// color, armor-stand display flags + `Pose`, and — for every vanilla mob in MOB_REGISTRY —
// the resolved render layers (geometry key + existence-checked texture key), with the
// texture VARIANT picked from the entity's NBT (wolf coat, cat breed, villager profession,
// sheep dye tint, …). A mob whose base texture is missing falls back to the colored cube.
import type { ArmorStandPose, MobRenderLayer, StructureEntity } from '@/shared/types';
import { MOB_REGISTRY, entityTextureKey } from '@/shared/entity-registry';
import type { RawEntity } from '../io/raw';
import { DYE, DYE_ORDER, dyeRgb } from './dye-colors';
import { fallbackColor } from './fallback-color';
import { textureExists } from './block-entity/box-uv';

const ARMOR_STAND = 'minecraft:armor_stand';
// Modern packs (1.19+) keep the armor stand texture under an `armorstand/` subfolder.
const ARMOR_STAND_TEX = 'minecraft/entity/armorstand/wood';

type Nbt = Record<string, unknown>;

/** Project raw entities into the render-ready shapes the viewer draws. `canResolve` gates
 *  disk lookups for entity textures (no pack/workspace → every entity falls back to a cube). */
export function resolveEntities(rawEntities: RawEntity[], canResolve: boolean): StructureEntity[] {
  // The armor stand texture is shared by every stand; resolve it once (a disk check).
  const standTexKey = canResolve && textureExists(ARMOR_STAND_TEX) ? ARMOR_STAND_TEX : null;
  return rawEntities.map((raw) => toStructureEntity(raw, standTexKey, canResolve));
}

/** Project a single raw entity's NBT into a StructureEntity. */
function toStructureEntity(raw: RawEntity, standTexKey: string | null, canResolve: boolean): StructureEntity {
  const nbt: Nbt = raw.nbt ?? {};
  const id = typeof nbt.id === 'string' ? nbt.id : 'minecraft:unknown';
  const rot = Array.isArray(nbt.Rotation) ? Number(nbt.Rotation[0]) : 0;
  const isStand = id === ARMOR_STAND;
  const mob = canResolve && !isStand ? resolveMob(id, nbt) : null;
  return {
    id,
    pos: raw.pos,
    rotation: Number.isFinite(rot) ? rot : 0,
    color: fallbackColor(id),
    textureKey: isStand ? standTexKey : null,
    ...(mob ?? {}),
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

/** The mob render fields for a registry entity: variant-resolved, existence-checked
 *  layers plus scale/baby. Null when the id isn't a known mob or its base texture is
 *  missing from the content pack (→ the fallback cube). */
function resolveMob(id: string, nbt: Nbt): Pick<StructureEntity, 'mob' | 'scale' | 'baby'> | null {
  const spec = MOB_REGISTRY[id];
  if (!spec) return null;

  const layers: MobRenderLayer[] = [];
  for (const [i, layer] of spec.layers.entries()) {
    if (id === 'minecraft:sheep' && layer.model === 'sheep_wool' && flag(nbt.Sheared)) continue;
    const texture = i === 0 ? (variantTexture(id, nbt) ?? layer.texture) : layer.texture;
    let key = entityTextureKey(texture);
    // An absent variant texture (older pack) falls back to the default before giving up.
    if (!textureExists(key)) {
      if (i === 0 && texture !== layer.texture && textureExists(entityTextureKey(layer.texture))) {
        key = entityTextureKey(layer.texture);
      } else if (i === 0) {
        return null; // no base texture → no model
      } else {
        continue; // optional overlay → drop the layer
      }
    }
    layers.push({
      model: layer.model,
      textureKey: key,
      ...(layer.translucent ? { translucent: true } : {}),
      ...(id === 'minecraft:sheep' && layer.model === 'sheep_wool' ? { tint: woolTint(nbt) } : {}),
    });
  }
  if (!layers.length) return null;
  layers.push(...overlayLayers(id, nbt));

  const scale = mobScale(id, nbt, spec.scale);
  const baby = flag(nbt.IsBaby) || (typeof nbt.Age === 'number' && nbt.Age < 0);
  return { mob: layers, ...(scale !== 1 ? { scale } : {}), ...(baby ? { baby: true } : {}) };
}

// ---------------------------------------------------------------------------
// Texture variants — the NBT-driven texture choice per mob family.
// ---------------------------------------------------------------------------

const HORSE_COLORS = ['white', 'creamy', 'chestnut', 'brown', 'black', 'gray', 'darkbrown'];
const AXOLOTL_COLORS = ['lucy', 'wild', 'gold', 'cyan', 'blue'];
const PARROT_COLORS = ['red_blue', 'blue', 'green', 'yellow_blue', 'grey'];
const LLAMA_COLORS = ['creamy', 'white', 'brown', 'gray'];
const RABBIT_TYPES: Record<number, string> = { 0: 'brown', 1: 'white', 2: 'black', 3: 'white_splotched', 4: 'gold', 5: 'salt', 99: 'caerbannog' };

/** Strip "minecraft:" off a variant id string. */
function variantId(v: unknown): string | null {
  return typeof v === 'string' ? v.replace(/^minecraft:/, '') : null;
}

/** Clamp an NBT int into an array-indexed variant list. */
function pick(list: string[], v: unknown): string | null {
  return typeof v === 'number' && Number.isFinite(v) ? list[((Math.trunc(v) % list.length) + list.length) % list.length] : null;
}

/** The layer-0 texture path override for this entity's NBT variant (null → default). */
function variantTexture(id: string, nbt: Nbt): string | null {
  switch (id) {
    case 'minecraft:wolf': {
      const v = variantId(nbt.variant);
      return v && v !== 'pale' ? `wolf/wolf_${v}` : null;
    }
    case 'minecraft:cat': {
      const v = variantId(nbt.variant);
      return v ? `cat/${v}` : null;
    }
    case 'minecraft:frog': {
      const v = variantId(nbt.variant);
      return v ? `frog/${v}_frog` : null;
    }
    case 'minecraft:axolotl': {
      const v = pick(AXOLOTL_COLORS, nbt.Variant);
      return v ? `axolotl/axolotl_${v}` : null;
    }
    case 'minecraft:parrot': {
      const v = pick(PARROT_COLORS, nbt.Variant);
      return v ? `parrot/parrot_${v}` : null;
    }
    case 'minecraft:horse': {
      const v = typeof nbt.Variant === 'number' ? HORSE_COLORS[(nbt.Variant & 0xff) % HORSE_COLORS.length] : null;
      return v ? `horse/horse_${v}` : null;
    }
    case 'minecraft:llama':
    case 'minecraft:trader_llama': {
      const v = pick(LLAMA_COLORS, nbt.Variant);
      return v ? `llama/${v}` : null;
    }
    case 'minecraft:rabbit': {
      const v = typeof nbt.RabbitType === 'number' ? RABBIT_TYPES[nbt.RabbitType] : null;
      return v ? `rabbit/${v}` : null;
    }
    case 'minecraft:fox':
      return nbt.Type === 'snow' ? 'fox/snow_fox' : null;
    case 'minecraft:mooshroom':
      return nbt.Type === 'brown' ? 'cow/brown_mooshroom' : null;
    case 'minecraft:panda': {
      const g = typeof nbt.MainGene === 'string' ? nbt.MainGene : null;
      return g && g !== 'normal' ? `panda/${g}_panda` : null;
    }
    case 'minecraft:shulker': {
      const c = typeof nbt.Color === 'number' ? DYE_ORDER[nbt.Color] : undefined;
      return c ? `shulker/shulker_${c}` : null;
    }
    default:
      return null;
  }
}

/** Villager-family biome/profession overlays (same geometry, layered textures). */
function overlayLayers(id: string, nbt: Nbt): MobRenderLayer[] {
  const base = id === 'minecraft:villager' ? 'villager' : id === 'minecraft:zombie_villager' ? 'zombie_villager' : null;
  if (!base) return [];
  const model = base === 'villager' ? 'villager' : 'zombie_villager';
  const data = (nbt.VillagerData ?? {}) as Nbt;
  const layers: MobRenderLayer[] = [];
  const type = variantId(data.type);
  const profession = variantId(data.profession);
  for (const path of [
    type ? `${base}/type/${type}` : null,
    profession && profession !== 'none' ? `${base}/profession/${profession}` : null,
  ]) {
    if (!path) continue;
    const key = entityTextureKey(path);
    if (textureExists(key)) layers.push({ model, textureKey: key });
  }
  return layers;
}

/** Render-time scale: the registry's per-type scale × the slime family's `Size`. */
function mobScale(id: string, nbt: Nbt, specScale: number | undefined): number {
  let scale = specScale ?? 1;
  if (id === 'minecraft:slime' || id === 'minecraft:magma_cube') {
    const size = typeof nbt.Size === 'number' && Number.isFinite(nbt.Size) ? Math.max(0, Math.trunc(nbt.Size)) : 0;
    scale *= size + 1;
  }
  return scale;
}

/** The sheep wool multiply tint from its dye `Color` (white when absent). */
function woolTint(nbt: Nbt): [number, number, number] {
  const name = typeof nbt.Color === 'number' ? DYE_ORDER[nbt.Color] : undefined;
  return dyeRgb(DYE[name ?? 'white'] ?? DYE.white);
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
