// "gothic" — the dark manor exterior: blackened dark-oak boarding over deepslate, a
// steep slate roof, and two signature volumes from the reference — a pointed CORNER
// SPIRE rising past the roofline and a GLASS CONSERVATORY along one side wall (the
// "side full of windows"). Brooding, vertical, asymmetric.
//
// The spire + the re-glazed side are drawn over the host's envelope (kept within the
// box). Pairs with the pitched houses, never modern.
import type { AuthoringOp } from '../../authoring/types';
import type { ExteriorModule } from './types';

export const gothic: ExteriorModule = {
  id: 'gothic',
  label: 'Gothic',
  category: 'exterior',
  description:
    'A dark manor finish: blackened dark-oak boarding over deepslate, a steep slate roof, ' +
    'soul-lit lanterns, a pointed corner spire rising past the roofline, and a glass ' +
    'conservatory wing of windows down one side. Brooding, vertical and asymmetric.',
  knowledge: 'nbt/modules/exterior/gothic.md',
  appliesTo: ['classic', 'cabin', 'l-shaped'],
  preview: { size: [13, 15, 11], params: { floors: 2 } },
  // Re-clad: dark-oak boarding, deepslate footings, a slate roof, grey conservatory glass.
  skin: {
    wall: 'minecraft:dark_oak_planks',
    corner: 'minecraft:dark_oak_log',
    beam: 'minecraft:stripped_dark_oak_log',
    accent: 'minecraft:polished_blackstone',
    trim: 'minecraft:dark_oak_slab',
    foundation: 'minecraft:cobbled_deepslate',
    roof: 'minecraft:deepslate_tile_stairs',
    window: 'minecraft:glass_pane',
    glass: 'minecraft:gray_stained_glass',
    door: 'minecraft:dark_oak_door',
    fence: 'minecraft:dark_oak_fence',
    light: 'minecraft:soul_lantern',
  },
  build({ box, palette }): AuthoringOp[] {
    const { x0, y0, z0, x1, y1, z1, W, D, H } = box;
    const ops: AuthoringOp[] = [];
    const corner = palette.get('corner');
    const air = palette.air();

    // The eave plane: where the walls stop and the pitch begins.
    const eaveY = y1 - Math.max(2, Math.floor(Math.min(W, D) / 2));

    // --- Glass conservatory: re-glaze the left (x0) side wall into a window wing,
    // framed by blackstone mullions every other cell. ---
    if (D >= 5 && eaveY > y0 + 3) {
      const glass = palette.get('glass');
      const mullion = palette.get('accent');
      ops.push({ op: 'fill', from: [x0, y0 + 2, z0 + 1], to: [x0, eaveY - 1, z1 - 1], state: glass });
      for (let z = z0 + 1; z <= z1 - 1; z += 2) {
        ops.push({ op: 'fill', from: [x0, y0 + 1, z], to: [x0, eaveY - 1, z], state: mullion });
      }
    }

    // --- Corner spire: a 3×3 dark tower at the back-right corner, rising past the roof
    // to a stepped pyramidal cap + a lit finial. Needs a roomy, tall footprint. ---
    if (W >= 7 && D >= 7 && H >= 9) {
      const ax0 = x1 - 2, az0 = z1 - 2; // back-right 3×3 block
      const cx = x1 - 1, cz = z1 - 1; // tower centre column
      const base = y0 + Math.max(2, Math.floor(H * 0.25));
      const topY = y1 - 2; // tower wall top; cap + finial sit above, within the box

      // Hollow shaft (overwrites the roof at this corner), with a tall window slit per face.
      ops.push({ op: 'walls', from: [ax0, base, az0], to: [x1, topY, z1], state: corner });
      ops.push({ op: 'fill', from: [cx, base, cz], to: [cx, y1, cz], state: air }); // open the flue/shaft
      const slitY0 = base + Math.floor((topY - base) * 0.4);
      const slitY1 = Math.min(slitY0 + 1, topY - 1);
      const win = palette.get('window');
      ops.push({ op: 'fill', from: [cx, slitY0, z1], to: [cx, slitY1, z1], state: win });
      ops.push({ op: 'fill', from: [x1, slitY0, cz], to: [x1, slitY1, cz], state: win });

      // Stepped pyramidal cap: four stairs rising toward the peak + a fence finial + light.
      const stairFacing = (facing: string) => palette.get('roof', { facing, half: 'bottom', shape: 'straight' });
      const capY = topY + 1;
      ops.push({ op: 'block', pos: [cx, capY, az0], state: stairFacing('south') });
      ops.push({ op: 'block', pos: [cx, capY, z1], state: stairFacing('north') });
      ops.push({ op: 'block', pos: [ax0, capY, cz], state: stairFacing('east') });
      ops.push({ op: 'block', pos: [x1, capY, cz], state: stairFacing('west') });
      ops.push({ op: 'block', pos: [cx, capY, cz], state: corner });
      ops.push({ op: 'block', pos: [cx, Math.min(capY + 1, y1), cz], state: palette.get('fence') });
    }
    return ops;
  },
};
