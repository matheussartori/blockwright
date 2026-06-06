// "Haunted" — the abandoned, decayed, ghost-ridden look: gloomy dark-oak timber over
// mossy stone footings, grimy gray glass, and the cold blue flame of soul lanterns
// instead of warm light. It is the deliberate opposite of `cozy`: where cozy is intact
// and inviting, haunted is ruined and dreadful. It maps the structural roles to a dark
// palette AND weathers stone to its mossy/cracked variants for decay patches, so any
// structure type reads as derelict and uncanny rather than homely.
import type { Decoration } from './types';

// Clean stone → its weathered (mossy/cracked) twin. The structure type / basement decay
// pass calls `palette.weather(role)` for ruin patches; this is where a haunted build's
// cracks and moss come from. Blocks with no weathered form map to themselves (identity).
const WEATHERED: Record<string, string> = {
  'minecraft:cobblestone': 'minecraft:mossy_cobblestone',
  'minecraft:stone_bricks': 'minecraft:cracked_stone_bricks',
  'minecraft:stone_brick_slab': 'minecraft:mossy_stone_brick_slab',
  'minecraft:deepslate_bricks': 'minecraft:cracked_deepslate_bricks',
  'minecraft:deepslate_tiles': 'minecraft:cracked_deepslate_tiles',
  'minecraft:polished_blackstone_bricks': 'minecraft:cracked_polished_blackstone_bricks',
  'minecraft:nether_bricks': 'minecraft:cracked_nether_bricks',
};

export const haunted: Decoration = {
  id: 'haunted',
  label: 'Haunted',
  category: 'decoration',
  description:
    'A derelict, ghost-ridden look: gloomy dark-oak timber over mossy cobblestone footings, ' +
    'grimy gray glass, and the cold blue flame of soul lanterns. Stone weathers to its mossy ' +
    'and cracked variants. The opposite of cozy — abandoned, decayed, and uncanny. Suits ' +
    'haunted houses, crypts, and cursed chambers.',
  knowledge: 'nbt/modules/decoration/haunted.md',
  // Previewed on a small house so the dark palette + blue light read at a glance.
  preview: { size: [9, 8, 7], params: {} },
  // A cohesive dark, gloomy palette. Roles left unmapped (beam/pillar/ladder) fall back
  // to the structure type's own kit, then BASE_BLOCKS.
  blocks: {
    wall: 'minecraft:dark_oak_planks',
    floor: 'minecraft:dark_oak_planks',
    ceiling: 'minecraft:dark_oak_planks',
    foundation: 'minecraft:cobblestone', // weathers to mossy_cobblestone
    corner: 'minecraft:dark_oak_log',
    accent: 'minecraft:stripped_dark_oak_log',
    trim: 'minecraft:dark_oak_slab',
    roof: 'minecraft:dark_oak_stairs',
    window: 'minecraft:gray_stained_glass_pane', // grimy, never clear
    glass: 'minecraft:gray_stained_glass',
    door: 'minecraft:dark_oak_door',
    fence: 'minecraft:dark_oak_fence',
    light: 'minecraft:soul_lantern', // cold blue flame — the signature of the look
  },
  // Ruined by default: decay holes + weathering on (an explicit op `decay` still wins).
  decay: 0.4,
  weather: (blockId) => WEATHERED[blockId] ?? blockId,
};
