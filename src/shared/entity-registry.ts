// Which vanilla mobs the viewer can draw as their real box models, and from which
// textures. Geometry lives in the generated `entity-models.ts` (MOB_MODELS); this file
// is the hand-curated mapping from entity id → render layers (model key + default
// texture under `assets/minecraft/textures/entity/`) plus the render-time scale Java
// applies outside the model (elder guardian 2.35×, cave spider 0.7×, …).
//
// Texture VARIANTS (wolf coat, cat breed, sheep dye tint, villager profession, …) are
// selected from each entity's NBT in `main/structure/assets/entity.ts` — this table only
// carries the defaults. Layer textures are existence-checked against the content pack at
// resolve time; a missing overlay drops that layer, a missing base drops the whole model
// (→ the fallback cube).

/** One render layer of a mob: a MOB_MODELS geometry drawn with an entity texture. */
export interface MobLayerSpec {
  /** Key into MOB_MODELS. */
  model: string;
  /** Texture path under `textures/entity/` (no extension). */
  texture: string;
  /** Rendered with alpha blending (the slime's outer jelly). */
  translucent?: boolean;
}

export interface MobSpec {
  layers: MobLayerSpec[];
  /** Render-time uniform scale (Java's per-renderer scale; 1 when absent). */
  scale?: number;
}

const mob = (layers: MobLayerSpec[], scale?: number): MobSpec => ({ layers, ...(scale ? { scale } : {}) });
const one = (model: string, texture: string, scale?: number): MobSpec => mob([{ model, texture }], scale);

export const MOB_REGISTRY: Record<string, MobSpec> = {
  'minecraft:allay': one('allay', 'allay/allay'),
  'minecraft:armadillo': one('armadillo', 'armadillo'),
  'minecraft:axolotl': one('axolotl', 'axolotl/axolotl_lucy'),
  'minecraft:bat': one('bat', 'bat'),
  'minecraft:bee': one('bee', 'bee/bee'),
  'minecraft:blaze': one('blaze', 'blaze'),
  'minecraft:bogged': mob([
    { model: 'bogged', texture: 'skeleton/bogged' },
    { model: 'bogged_overlay', texture: 'skeleton/bogged_overlay' },
  ]),
  'minecraft:breeze': mob([
    { model: 'breeze', texture: 'breeze/breeze' },
    { model: 'breeze_eyes', texture: 'breeze/breeze_eyes' },
  ]),
  'minecraft:camel': one('camel', 'camel/camel'),
  'minecraft:cat': one('cat', 'cat/tabby'),
  'minecraft:cave_spider': mob([{ model: 'spider', texture: 'spider/cave_spider' }], 0.7),
  'minecraft:chicken': one('chicken', 'chicken'),
  'minecraft:cod': one('cod', 'fish/cod'),
  'minecraft:cow': one('cow', 'cow/cow'),
  'minecraft:creaking': one('creaking', 'creaking/creaking'),
  'minecraft:creeper': one('creeper', 'creeper/creeper'),
  'minecraft:dolphin': one('dolphin', 'dolphin'),
  'minecraft:donkey': one('mule', 'horse/donkey'),
  'minecraft:drowned': mob([
    { model: 'drowned', texture: 'zombie/drowned' },
    { model: 'drowned_overlay', texture: 'zombie/drowned_outer_layer' },
  ]),
  'minecraft:elder_guardian': mob([{ model: 'guardian', texture: 'guardian_elder' }], 2.35),
  'minecraft:ender_dragon': one('dragon', 'enderdragon/dragon'),
  'minecraft:enderman': mob([
    { model: 'enderman', texture: 'enderman/enderman' },
    { model: 'enderman', texture: 'enderman/enderman_eyes' },
  ]),
  'minecraft:endermite': one('endermite', 'endermite'),
  'minecraft:evoker': one('evoker', 'illager/evoker'),
  'minecraft:fox': one('fox', 'fox/fox'),
  'minecraft:frog': one('frog', 'frog/temperate_frog'),
  'minecraft:ghast': one('ghast', 'ghast/ghast'),
  'minecraft:glow_squid': one('glow_squid', 'squid/glow_squid'),
  'minecraft:goat': one('goat', 'goat/goat'),
  'minecraft:guardian': one('guardian', 'guardian'),
  'minecraft:happy_ghast': one('happy_ghast', 'ghast/happy_ghast'),
  'minecraft:hoglin': one('hoglin', 'hoglin/hoglin'),
  'minecraft:horse': one('horse', 'horse/horse_brown'),
  'minecraft:husk': one('zombie', 'zombie/husk'),
  'minecraft:illusioner': one('evoker', 'illager/illusioner'),
  'minecraft:iron_golem': one('iron_golem', 'iron_golem/iron_golem'),
  'minecraft:llama': one('llama', 'llama/creamy'),
  'minecraft:magma_cube': one('magma_cube', 'slime/magmacube'),
  'minecraft:mooshroom': one('mooshroom', 'cow/red_mooshroom'),
  'minecraft:mule': one('mule', 'horse/mule'),
  'minecraft:ocelot': one('ocelot', 'cat/ocelot'),
  'minecraft:panda': one('panda', 'panda/panda'),
  'minecraft:parrot': one('parrot', 'parrot/parrot_red_blue'),
  'minecraft:phantom': one('phantom', 'phantom'),
  'minecraft:pig': one('pig', 'pig/pig'),
  'minecraft:piglin': one('piglin', 'piglin/piglin'),
  'minecraft:piglin_brute': one('piglin', 'piglin/piglin_brute'),
  'minecraft:pillager': one('pillager', 'illager/pillager'),
  'minecraft:polar_bear': one('polar_bear', 'bear/polarbear'),
  'minecraft:pufferfish': one('pufferfish', 'fish/pufferfish'),
  'minecraft:rabbit': one('rabbit', 'rabbit/brown'),
  'minecraft:ravager': one('ravager', 'illager/ravager'),
  'minecraft:salmon': one('salmon', 'fish/salmon'),
  'minecraft:sheep': mob([
    { model: 'sheep', texture: 'sheep/sheep' },
    { model: 'sheep_wool', texture: 'sheep/sheep_fur' },
  ]),
  'minecraft:shulker': one('shulker', 'shulker/shulker'),
  'minecraft:silverfish': one('silverfish', 'silverfish'),
  'minecraft:skeleton': one('skeleton', 'skeleton/skeleton'),
  'minecraft:skeleton_horse': one('horse', 'horse/horse_skeleton'),
  'minecraft:slime': mob([
    { model: 'slime', texture: 'slime/slime' },
    { model: 'slime_outer', texture: 'slime/slime', translucent: true },
  ]),
  'minecraft:sniffer': one('sniffer', 'sniffer/sniffer'),
  'minecraft:snow_golem': one('snow_golem', 'snow_golem'),
  'minecraft:spider': one('spider', 'spider/spider'),
  'minecraft:squid': one('squid', 'squid/squid'),
  'minecraft:stray': mob([
    { model: 'skeleton', texture: 'skeleton/stray' },
    { model: 'stray_overlay', texture: 'skeleton/stray_overlay' },
  ]),
  'minecraft:strider': one('strider', 'strider/strider'),
  'minecraft:tadpole': one('tadpole', 'tadpole/tadpole'),
  'minecraft:trader_llama': one('llama', 'llama/creamy'),
  'minecraft:tropical_fish': one('tropical_fish', 'fish/tropical_a'),
  'minecraft:turtle': one('turtle', 'turtle/big_sea_turtle'),
  'minecraft:vex': one('vex', 'illager/vex'),
  'minecraft:villager': one('villager', 'villager/villager'),
  'minecraft:vindicator': one('vindicator', 'illager/vindicator'),
  'minecraft:wandering_trader': one('villager', 'wandering_trader'),
  'minecraft:warden': one('warden', 'warden/warden'),
  'minecraft:witch': one('witch', 'witch'),
  'minecraft:wither': mob([{ model: 'wither', texture: 'wither/wither' }], 2),
  'minecraft:wither_skeleton': mob([{ model: 'wither_skeleton', texture: 'skeleton/wither_skeleton' }], 1.2),
  'minecraft:wolf': one('wolf', 'wolf/wolf'),
  'minecraft:zoglin': one('hoglin', 'hoglin/zoglin'),
  'minecraft:zombie': one('zombie', 'zombie/zombie'),
  'minecraft:zombie_horse': one('horse', 'horse/horse_zombie'),
  'minecraft:zombie_villager': one('zombie_villager', 'zombie_villager/zombie_villager'),
  'minecraft:zombified_piglin': one('piglin', 'piglin/zombified_piglin'),
};

/** Full texture key ("minecraft/entity/<path>") for a registry texture path. */
export function entityTextureKey(path: string): string {
  return `minecraft/entity/${path}`;
}
