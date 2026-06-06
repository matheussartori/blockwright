// "Cozy" — the warm, lived-in, intact look: honey-toned woods, soft accents, and
// lantern light, with no decay or weathering. It maps the structural roles to a
// cohesive warm palette so any structure type reads as inviting rather than ruined.
// This is the default decoration.
import type { Decoration } from './types';

export const cozy: Decoration = {
  id: 'cozy',
  label: 'Cozy',
  category: 'decoration',
  description:
    'A warm, lived-in look: honey-toned spruce and oak, cobblestone footings, and lantern ' +
    'light. No decay or weathering — everything is intact and inviting, suited to homes ' +
    'and cabins.',
  knowledge: 'nbt/modules/decoration/cozy.md',
  // Previewed on a small house so the warm palette reads at a glance.
  preview: { size: [9, 8, 7], params: {} },
  // A cohesive warm wood palette. Roles left unmapped fall back to the structure
  // type's own kit, then BASE_BLOCKS.
  blocks: {
    wall: 'minecraft:spruce_planks',
    floor: 'minecraft:oak_planks',
    ceiling: 'minecraft:spruce_planks',
    foundation: 'minecraft:cobblestone',
    corner: 'minecraft:spruce_log',
    accent: 'minecraft:stripped_spruce_log',
    trim: 'minecraft:spruce_slab',
    beam: 'minecraft:spruce_log',
    pillar: 'minecraft:spruce_log',
    roof: 'minecraft:spruce_stairs',
    window: 'minecraft:glass_pane',
    glass: 'minecraft:glass',
    door: 'minecraft:spruce_door',
    fence: 'minecraft:spruce_fence',
    light: 'minecraft:lantern',
  },
  // Intact: no ruin, no weathering (identity).
  decay: 0,
};
