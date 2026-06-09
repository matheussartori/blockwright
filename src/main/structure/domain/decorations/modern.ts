// "Modern" — the clean contemporary look: white concrete and smooth quartz masses, dark
// accent columns (polished blackstone), warm wood infill (stripped dark oak), big glass,
// and crisp sea-lantern light. No decay, no weathering — every edge is sharp. This is the
// material half of a MODERN build: pair it with the `modern` exterior form (forms/modern)
// so the white/glass massing reads right. Where cozy is honey-toned timber, modern is
// white + dark accent + wood + glass.
import type { Decoration } from './types';

export const modern: Decoration = {
  id: 'modern',
  label: 'Modern',
  category: 'decoration',
  description:
    'A sleek contemporary look: white concrete and smooth quartz, dark polished-blackstone ' +
    'accent columns, warm dark-oak wood infill, large glass walls, and crisp sea-lantern ' +
    'light. No decay — clean, sharp edges. Pair it with the Modern form for a quartz-and-' +
    'glass villa instead of a wooden box.',
  knowledge: 'nbt/modules/decoration/modern.md',
  // Previewed on a small house so the white + glass palette reads at a glance.
  preview: { size: [9, 8, 7], params: {} },
  // A cohesive white/glass/dark-accent palette. Roles left unmapped fall back to the
  // structure type's own kit, then BASE_BLOCKS.
  blocks: {
    wall: 'minecraft:white_concrete',
    floor: 'minecraft:smooth_quartz',
    ceiling: 'minecraft:white_concrete',
    foundation: 'minecraft:smooth_stone',
    corner: 'minecraft:polished_blackstone',
    accent: 'minecraft:stripped_dark_oak_log',
    trim: 'minecraft:smooth_quartz_slab',
    beam: 'minecraft:polished_blackstone',
    pillar: 'minecraft:polished_blackstone',
    // A FLAT roof: a quartz slab lid, not a pitched material (the modern form has no gable).
    roof: 'minecraft:smooth_quartz_slab',
    window: 'minecraft:glass_pane',
    glass: 'minecraft:glass',
    door: 'minecraft:dark_oak_door',
    fence: 'minecraft:dark_oak_fence',
    light: 'minecraft:sea_lantern',
  },
  // Clean and sharp: no ruin, no weathering (identity).
  decay: 0,
};
