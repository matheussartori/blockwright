// "Castle" — the dressed-stone, fortified look: light grey stone bricks over a heavier
// cobblestone base, chiselled-stone accents, dark spruce woodwork (doors, fences, the
// stair core), and warm lantern light. Built for the battlemented keep but UNIVERSAL —
// it composes with any structure type, turning a house into a stone hall. Where cozy is
// honey-toned timber, castle is masonry: the default look for the `tower` family.
import type { Decoration } from './types';

// Clean stone → its weathered (mossy/cracked) twin, for decay patches (a ruined keep).
const WEATHERED: Record<string, string> = {
  'minecraft:stone_bricks': 'minecraft:cracked_stone_bricks',
  'minecraft:cobblestone': 'minecraft:mossy_cobblestone',
  'minecraft:stone_brick_slab': 'minecraft:mossy_stone_brick_slab',
  'minecraft:chiseled_stone_bricks': 'minecraft:cracked_stone_bricks',
};

export const castle: Decoration = {
  id: 'castle',
  label: 'Castle',
  category: 'decoration',
  description:
    'A dressed-stone, fortified look: light grey stone bricks over a cobblestone base, ' +
    'chiselled-stone accents, dark spruce woodwork, and warm lantern light. Masonry where ' +
    'cozy is timber. Stone weathers to its mossy and cracked variants for ruin. The default ' +
    'for the keep — suits towers, walls, and stone halls.',
  knowledge: 'nbt/modules/decoration/castle.md',
  // Previewed on a small house so the stone palette reads at a glance.
  preview: { size: [9, 8, 7], params: {} },
  // A cohesive masonry palette. Roles left unmapped fall back to the structure type's
  // own kit, then BASE_BLOCKS.
  blocks: {
    wall: 'minecraft:stone_bricks',
    floor: 'minecraft:spruce_planks',
    ceiling: 'minecraft:stone_bricks',
    foundation: 'minecraft:cobblestone',
    corner: 'minecraft:stone_bricks',
    accent: 'minecraft:chiseled_stone_bricks',
    trim: 'minecraft:stone_brick_slab',
    beam: 'minecraft:spruce_log',
    pillar: 'minecraft:stone_bricks',
    roof: 'minecraft:stone_brick_stairs',
    window: 'minecraft:glass_pane',
    glass: 'minecraft:glass',
    door: 'minecraft:spruce_door',
    fence: 'minecraft:spruce_fence',
    light: 'minecraft:lantern',
  },
  // Intact by default (a kept keep, not a ruin); an explicit op `decay` or a structure's
  // own decay param still drives the weathering through `weather`.
  decay: 0,
  weather: (blockId) => WEATHERED[blockId] ?? blockId,
};
