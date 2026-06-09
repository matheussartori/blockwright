// "sakura" — the cherry-blossom cottage exterior: soft pink cherry cladding on a stone
// base, a dark slate roof, and BLOSSOM cascades (cherry-leaf foliage) spilling over the
// roof edge and down the front corners, with a fence-railed eave garland. The reference:
// pink walls, a grey roof crowned with pink blossoms, leafy window boxes, a covered upper
// terrace. The protruding front stair + side balcony are conveyed in the guide (the
// free-form AI owns the footprint there); the geometry here is the on-shell blossom layer.
//
// Pairs with the pitched houses, never modern.
import type { AuthoringOp } from '../../authoring/types';
import { mulberry32 } from '../rng';
import type { ExteriorModule } from './types';

export const sakura: ExteriorModule = {
  id: 'sakura',
  label: 'Sakura house',
  category: 'exterior',
  description:
    'A cherry-blossom cottage finish: soft pink cherry-wood cladding on a stone base, a ' +
    'dark slate roof, and pink blossom cascades spilling over the eaves and down the front ' +
    'corners. Leafy, romantic, springtime — a house tucked in a grove of cherry trees.',
  knowledge: 'nbt/modules/exterior/sakura.md',
  appliesTo: ['classic', 'cabin', 'l-shaped'],
  preview: { size: [13, 13, 11], params: { floors: 2 } },
  // Re-clad: pink cherry walls/logs on a stone base, a dark roof, cherry blossoms as plant.
  skin: {
    wall: 'minecraft:cherry_planks',
    corner: 'minecraft:cherry_log',
    beam: 'minecraft:stripped_cherry_log',
    accent: 'minecraft:cherry_log',
    trim: 'minecraft:cherry_slab',
    foundation: 'minecraft:cobblestone',
    roof: 'minecraft:deepslate_tile_stairs',
    window: 'minecraft:glass_pane',
    door: 'minecraft:cherry_door',
    fence: 'minecraft:cherry_fence',
    plant: 'minecraft:cherry_leaves',
    light: 'minecraft:lantern',
  },
  // Additive: blossom cascades down the front corners + a leaf garland along the front
  // eave, so the slate roof reads "crowned with cherry blossom" like the reference.
  build({ box, palette, seed }): AuthoringOp[] {
    const { x0, y0, z0, x1, y1, z1, W, D, H } = box;
    if (W < 5 || D < 5 || H < 6) return [];
    const leaf = palette.get('plant', { persistent: 'true' });
    const ops: AuthoringOp[] = [];

    // The eave plane: roughly where the walls stop and the pitch begins.
    const eaveY = y1 - Math.max(2, Math.floor(Math.min(W, D) / 2));
    if (eaveY <= y0 + 2) return ops;

    // Blossom garland along the front (z0) eave, a cohesive band of leaves.
    ops.push({ op: 'line', from: [x0 + 1, eaveY, z0], to: [x1 - 1, eaveY, z0], state: leaf });

    // Cascades: leaves spilling DOWN the two front corners (and one back corner, seeded)
    // from the eave toward the ground, like blossom-laden boughs framing the facade.
    const rnd = mulberry32(seed);
    const drop = Math.min(eaveY - (y0 + 1), Math.max(2, Math.floor(H * 0.5)));
    const corners: [number, number][] = [
      [x0, z0], [x1, z0],
      ...(rnd() < 0.5 ? ([[x0, z1]] as [number, number][]) : ([[x1, z1]] as [number, number][])),
    ];
    for (const [cx, cz] of corners) {
      ops.push({ op: 'fill', from: [cx, eaveY - drop, cz], to: [cx, eaveY, cz], state: leaf });
    }
    return ops;
  },
};
