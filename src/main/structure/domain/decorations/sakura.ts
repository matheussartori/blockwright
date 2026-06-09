// "Sakura" — the cherry-blossom palette: soft pink cherry-wood cladding over a pale
// stone-brick base, a pink cherry-stair roof, and cherry-blossom foliage. The material
// half of a Sakura home — pair it with the Sakura structure type (auto-selected together)
// so the raised cottage reads in warm pinks with a blossom-crowned roof from the
// references, instead of the cozy spruce default.
import type { Decoration } from './types';

export const sakura: Decoration = {
  id: 'sakura',
  label: 'Sakura',
  category: 'decoration',
  description:
    'The cherry-blossom palette: soft pink cherry-wood cladding on a pale stone-brick base, ' +
    'a pink cherry-stair roof crowned with blossoms, leafy window boxes and warm lantern ' +
    'light. Romantic and springtime — pair it with the Sakura structure for the full ' +
    'blossom cottage raised on its visible stone basement.',
  knowledge: 'nbt/modules/decoration/sakura.md',
  preview: { size: [9, 8, 7], params: {} },
  // Pink cherry cladding on a stone-brick base, a pink roof, cherry blossoms as plant.
  // Roles left unmapped fall back to the structure type's own kit, then BASE_BLOCKS.
  blocks: {
    wall: 'minecraft:cherry_planks',
    floor: 'minecraft:cherry_planks',
    ceiling: 'minecraft:cherry_planks',
    foundation: 'minecraft:stone_bricks',
    corner: 'minecraft:cherry_log',
    accent: 'minecraft:stripped_cherry_log',
    beam: 'minecraft:stripped_cherry_log',
    pillar: 'minecraft:cherry_log',
    trim: 'minecraft:cherry_slab',
    roof: 'minecraft:cherry_stairs',
    window: 'minecraft:glass_pane',
    glass: 'minecraft:glass',
    door: 'minecraft:cherry_door',
    fence: 'minecraft:cherry_fence',
    plant: 'minecraft:cherry_leaves',
    light: 'minecraft:lantern',
  },
  // Intact and soft: no ruin, no weathering (identity).
  decay: 0,
};
