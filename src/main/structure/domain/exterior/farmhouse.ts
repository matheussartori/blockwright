// "farmhouse" — the rustic country FINISH (an exterior skin) for the pitched houses:
// honey-toned oak boarding crossed by darker stripped-log timber framing, a dark slate
// roof, a stone plinth and big banded windows. A finishing layer, NOT a massing change —
// the casco it sits on stays whatever the structure type built.
//
// For the full "casa de sítio" SHAPE (L plan, cross-gable roof, wraparound veranda, upper
// gallery), pick the **Farmhouse STRUCTURE TYPE** instead — that owns the non-rectangular
// massing in code (this finish can't reshape a host's footprint, only re-clad it).
//
// Two layers, like every exterior: a `skin` re-clad + a light additive `build()` (the stone
// water-table + the exposed framing). Pairs with the pitched houses, never modern.
import type { AuthoringOp } from '../../authoring/types';
import type { ExteriorModule } from './types';

export const farmhouse: ExteriorModule = {
  id: 'farmhouse',
  label: 'Farmhouse finish',
  category: 'exterior',
  description:
    'A rustic country FINISH: warm oak boarding crossed by exposed dark-log timber framing, ' +
    'a dark slate-tiled roof, a deep stone plinth and big banded windows. A re-clad + framing ' +
    'layer over the chosen casco — for the full sítio SHAPE, pick the Farmhouse structure type.',
  knowledge: 'nbt/modules/exterior/farmhouse.md',
  appliesTo: ['classic', 'cabin', 'l-shaped'],
  preview: { size: [13, 13, 11], params: { floors: 2 } },
  // Re-clad: warm oak walls + darker stripped-log framing, a dark slate roof, stone base.
  skin: {
    wall: 'minecraft:oak_planks',
    corner: 'minecraft:stripped_dark_oak_log',
    beam: 'minecraft:stripped_dark_oak_log',
    accent: 'minecraft:stripped_oak_log',
    trim: 'minecraft:oak_slab',
    foundation: 'minecraft:cobblestone',
    roof: 'minecraft:deepslate_tile_stairs',
    window: 'minecraft:glass_pane',
    door: 'minecraft:oak_door',
    fence: 'minecraft:oak_fence',
    plant: 'minecraft:oak_leaves',
    light: 'minecraft:lantern',
  },
  // Additive: a stone water-table course at the base + a belt course of beams at mid-wall
  // and quarter-point corner battens, so the timber framing reads against the oak boards.
  build({ box, palette }): AuthoringOp[] {
    const { x0, y0, z0, x1, y1, z1, W, D, H } = box;
    if (W < 5 || D < 5 || H < 6) return [];
    const beam = palette.get('beam');
    const found = palette.get('foundation');
    const ops: AuthoringOp[] = [];

    // Stone plinth: a 2-course water table at the base, so the timber meets stone not soil.
    ops.push({ op: 'walls', from: [x0, y0, z0], to: [x1, Math.min(y0 + 1, y1), z1], state: found });

    // Belt course: a horizontal beam band wrapping the walls at roughly mid-height.
    const beltY = y0 + Math.max(2, Math.floor(H * 0.42));
    if (beltY < y1 - 1) ops.push({ op: 'walls', from: [x0, beltY, z0], to: [x1, beltY, z1], state: beam });

    // Vertical framing battens at the quarter points of each wall, plinth → belt.
    const cols = (lo: number, hi: number): number[] => {
      const span = hi - lo;
      return span < 4 ? [] : [lo + Math.floor(span / 3), hi - Math.floor(span / 3)];
    };
    const top = beltY - 1;
    for (const x of cols(x0, x1)) {
      ops.push({ op: 'fill', from: [x, y0 + 2, z0], to: [x, top, z0], state: beam });
      ops.push({ op: 'fill', from: [x, y0 + 2, z1], to: [x, top, z1], state: beam });
    }
    for (const z of cols(z0, z1)) {
      ops.push({ op: 'fill', from: [x0, y0 + 2, z], to: [x0, top, z], state: beam });
      ops.push({ op: 'fill', from: [x1, y0 + 2, z], to: [x1, top, z], state: beam });
    }
    return ops;
  },
};
