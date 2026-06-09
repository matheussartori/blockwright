// "Farmhouse" — the rustic country palette: honey-toned oak boarding crossed by darker
// stripped-dark-oak timber framing, a grounded cobblestone base, and a STEEP DARK slate
// roof (deepslate tile). The material half of a sítio home — pair it with the Farmhouse
// structure type (auto-selected together) so the cross-gabled L casco reads in warm oak
// with the dark roof from the references, instead of the cozy spruce default.
import type { Decoration } from './types';

export const farmhouse: Decoration = {
  id: 'farmhouse',
  label: 'Farmhouse',
  category: 'decoration',
  description:
    'The rustic country palette: warm oak boarding crossed by dark stripped-log timber ' +
    'framing, a cobblestone base, and a steep DARK slate-tile roof. The honey-and-dark look ' +
    'of a storybook farmhouse — pair it with the Farmhouse structure for the full casa de sítio.',
  knowledge: 'nbt/modules/decoration/farmhouse.md',
  preview: { size: [9, 8, 7], params: {} },
  // Warm oak + dark-log framing + a dark slate roof. Roles left unmapped fall back to the
  // structure type's own kit, then BASE_BLOCKS.
  blocks: {
    wall: 'minecraft:oak_planks',
    floor: 'minecraft:oak_planks',
    ceiling: 'minecraft:oak_planks',
    foundation: 'minecraft:cobblestone',
    corner: 'minecraft:stripped_dark_oak_log',
    accent: 'minecraft:stripped_oak_log',
    trim: 'minecraft:oak_slab',
    beam: 'minecraft:stripped_dark_oak_log',
    pillar: 'minecraft:stripped_dark_oak_log',
    roof: 'minecraft:deepslate_tile_stairs',
    window: 'minecraft:glass_pane',
    glass: 'minecraft:glass',
    door: 'minecraft:oak_door',
    fence: 'minecraft:oak_fence',
    light: 'minecraft:lantern',
  },
  // Intact and warm: no ruin, no weathering (identity).
  decay: 0,
};
