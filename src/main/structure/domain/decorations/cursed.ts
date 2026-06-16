// "Cursed" — the dark-stone gothic-ruin palette: a blackstone-brick shaft picked out with
// chiseled belt courses and polished-blackstone buttresses, mossy cobblestone footings, grimy
// gray glass and the cold blue flame of soul lanterns. Where `haunted` is a derelict WOODEN
// house, `cursed` is a derelict STONE monolith — the look of the haunted tower's references
// (a blackstone spire, not a timber cottage). It weathers stone to its cracked/mossy variants
// and ruins heavily by default. Pair it with the Haunted tower (auto-selected together); it
// also suits crypts, cult temples and any cursed stone sanctum.
import type { Decoration } from './types';

// Clean stone → its weathered (cracked/mossy) twin, for the structure/basement decay pass.
const WEATHERED: Record<string, string> = {
  'minecraft:polished_blackstone_bricks': 'minecraft:cracked_polished_blackstone_bricks',
  'minecraft:cobblestone': 'minecraft:mossy_cobblestone',
  'minecraft:stone_bricks': 'minecraft:cracked_stone_bricks',
  'minecraft:deepslate_bricks': 'minecraft:cracked_deepslate_bricks',
  'minecraft:deepslate_tiles': 'minecraft:cracked_deepslate_tiles',
  'minecraft:nether_bricks': 'minecraft:cracked_nether_bricks',
};

export const cursed: Decoration = {
  id: 'cursed',
  label: 'Cursed',
  category: 'decoration',
  description:
    'The dark-stone gothic-ruin palette: a blackstone-brick shaft picked out with chiseled ' +
    'belt courses and polished-blackstone buttresses, mossy cobblestone footings, grimy gray ' +
    'glass and the cold blue flame of soul lanterns. The stone counterpart to Haunted — a ' +
    'derelict blackstone monolith, not a timber cottage. Stone weathers to its cracked and ' +
    'mossy variants, and it ruins heavily by default. Pair it with the Haunted tower; suits ' +
    'crypts, cult temples and any cursed stone sanctum.',
  knowledge: 'nbt/modules/decoration/cursed.md',
  preview: { size: [9, 12, 7], params: {} },
  // A cohesive dark-STONE palette (the references are blackstone, never wood). Roles left
  // unmapped fall back to the structure type's kit, then BASE_BLOCKS.
  blocks: {
    wall: 'minecraft:polished_blackstone_bricks',
    ceiling: 'minecraft:polished_blackstone_bricks',
    floor: 'minecraft:dark_oak_planks', // a warm interior deck against the black stone
    foundation: 'minecraft:cobblestone', // weathers to mossy_cobblestone (the rough base)
    corner: 'minecraft:polished_blackstone', // buttress ribs + corner piers (a darker contrast)
    accent: 'minecraft:chiseled_polished_blackstone', // belt courses, jambs, the skull brow
    trim: 'minecraft:polished_blackstone_brick_slab',
    pillar: 'minecraft:polished_blackstone',
    roof: 'minecraft:polished_blackstone_brick_stairs', // the stair core + caps stay STONE
    window: 'minecraft:gray_stained_glass_pane', // grimy, never clear
    glass: 'minecraft:gray_stained_glass', // skull sockets + the inverted cross
    door: 'minecraft:dark_oak_door',
    fence: 'minecraft:dark_oak_fence', // hanging chains + spire finials
    light: 'minecraft:soul_lantern', // the cold blue flame — the signature
  },
  // Ruined by default: decay holes + weathering on (an explicit op `decay` still wins).
  decay: 0.3,
  weather: (blockId) => WEATHERED[blockId] ?? blockId,
};
