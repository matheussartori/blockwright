// "Chapel" — the white-plaster sacred look: bright smooth-quartz plaster walls picked
// out with dressed stone-brick quoins, window frames and buttresses, a steep DARK
// deepslate-tile roof, and warm lantern light. Built for the church (its default), but
// UNIVERSAL like castle — it composes with any structure type. Where castle is bare grey
// masonry, chapel is whitewashed walls over a stone skeleton: the look of a country
// chapel or cathedral. Pick `castle` instead for the grey-stone cathedral variant.
import type { Decoration } from './types';

// Clean stone → its weathered (mossy/cracked) twin, for decay patches (a ruined chapel).
const WEATHERED: Record<string, string> = {
  'minecraft:stone_bricks': 'minecraft:cracked_stone_bricks',
  'minecraft:smooth_quartz': 'minecraft:quartz_bricks',
  'minecraft:stone_brick_slab': 'minecraft:mossy_stone_brick_slab',
  'minecraft:chiseled_stone_bricks': 'minecraft:cracked_stone_bricks',
};

export const chapel: Decoration = {
  id: 'chapel',
  label: 'Chapel',
  category: 'decoration',
  description:
    'A whitewashed sacred look: bright smooth-quartz plaster walls over dressed stone-brick ' +
    'quoins, window frames and buttresses, crowned by a steep dark deepslate-tile roof with ' +
    'warm lantern light. White plaster where castle is bare masonry — the default for the ' +
    'church. Pick Castle instead for an all-grey stone cathedral.',
  knowledge: 'nbt/modules/decoration/chapel.md',
  // Previewed on a small house so the white-plaster/stone palette reads at a glance.
  preview: { size: [9, 8, 7], params: {} },
  // A whitewashed-plaster-over-stone palette. Roles left unmapped fall back to the
  // structure type's own kit, then BASE_BLOCKS.
  blocks: {
    wall: 'minecraft:smooth_quartz',
    floor: 'minecraft:stone_bricks',
    ceiling: 'minecraft:smooth_quartz',
    foundation: 'minecraft:stone_bricks',
    corner: 'minecraft:stone_bricks',
    accent: 'minecraft:chiseled_stone_bricks',
    trim: 'minecraft:stone_brick_slab',
    beam: 'minecraft:polished_deepslate',
    pillar: 'minecraft:stone_bricks',
    roof: 'minecraft:deepslate_tile_stairs',
    window: 'minecraft:glass_pane',
    glass: 'minecraft:glass',
    door: 'minecraft:dark_oak_door',
    fence: 'minecraft:dark_oak_fence',
    light: 'minecraft:lantern',
  },
  // Intact by default (a kept chapel, not a ruin); an explicit op `decay` or a structure's
  // own decay param still drives the weathering through `weather`.
  decay: 0,
  weather: (blockId) => WEATHERED[blockId] ?? blockId,
};
