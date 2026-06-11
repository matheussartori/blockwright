// "Gothic" — the dark manor palette: blackened timber and blackstone walls picked out
// with pale stone detailing (the "predominantly black with white details" look from the
// references), a steep dark slate roof, grey chapel glass and soul-lit lanterns. The
// material half of a Gothic home — pair it with the Gothic structure type (auto-selected
// together) so the towered, portico'd manor reads brooding and vertical.
import type { Decoration } from './types';

export const gothic: Decoration = {
  id: 'gothic',
  label: 'Gothic',
  category: 'decoration',
  description:
    'The dark manor palette: blackened dark-oak and blackstone walls picked out with pale ' +
    'polished-stone detailing, a steep deepslate-slate roof, grey chapel glass and soul-lit ' +
    'lanterns. Brooding, vertical and asymmetric — pair it with the Gothic structure for the ' +
    'full towered manor with its covered portico and glass chapel.',
  knowledge: 'nbt/modules/decoration/gothic.md',
  preview: { size: [9, 10, 7], params: {} },
  // Black timber + blackstone, pale stone accents (the white detailing), a dark slate roof,
  // grey chapel glass. Roles left unmapped fall back to the structure type's kit, then BASE.
  blocks: {
    wall: 'minecraft:dark_oak_planks',
    floor: 'minecraft:dark_oak_planks',
    ceiling: 'minecraft:dark_oak_planks',
    foundation: 'minecraft:polished_blackstone_bricks',
    corner: 'minecraft:dark_oak_log',
    accent: 'minecraft:polished_diorite',
    beam: 'minecraft:stripped_dark_oak_log',
    pillar: 'minecraft:polished_blackstone',
    trim: 'minecraft:dark_oak_slab',
    roof: 'minecraft:deepslate_tile_stairs',
    window: 'minecraft:glass_pane',
    glass: 'minecraft:gray_stained_glass',
    door: 'minecraft:dark_oak_door',
    fence: 'minecraft:dark_oak_fence',
    light: 'minecraft:soul_lantern',
    // Dark ivy/garland greenery softening the slate roof + tower (the leaves cascading
    // over the eaves in the references) — the one spot of life on the brooding manor.
    plant: 'minecraft:flowering_azalea_leaves',
  },
  // Crisp and intact (the manor is kept, not ruined): no decay, no weathering (identity).
  decay: 0,
};
