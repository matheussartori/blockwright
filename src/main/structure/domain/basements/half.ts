// "half" — a half-buried (semi-sunk) basement: the storey sits half below grade so its
// upper course clears the ground, leaving room for a real clerestory window band that
// daylights the room. METADATA-ONLY for now (no `build()` geometry, not wired into
// `composeStructure`); it rides into generation as plain-language guidance + its own
// knowledge guide (loaded only when selected) and documents the type in the gallery.
//
// Linked to the `house` via `appliesTo`; add another structure id there to reuse it.
import type { AuthoringOp } from '../../authoring/types';
import type { BasementModule } from './types';

export const half: BasementModule = {
  id: 'half',
  label: 'Half-buried',
  category: 'basement',
  description:
    'A semi-sunk storey: half below grade so its top course clears the ground, giving room ' +
    'for a high clerestory window band that brings daylight in (unlike a full cellar). Reads ' +
    'as a raised ground floor over a walk-out lower level — good for a sunlit den or studio.',
  knowledge: 'nbt/modules/basement/half.md',
  appliesTo: ['house'],
  defaults: { wall: 'minecraft:cobblestone', floor: 'minecraft:stone_bricks', ceiling: 'minecraft:cobblestone', light: 'minecraft:lantern' },
  // GENERIC: a stone room like the full cellar, but with a clerestory window band on the
  // top course of the walls (the part that clears grade) so daylight reaches the room.
  build({ box, palette }): AuthoringOp[] {
    const { x0, y0, z0, x1, y1, z1 } = box;
    const floor = palette.get('floor');
    const wall = palette.get('wall');
    const ceil = palette.get('ceiling');
    const win = palette.get('window');
    const light = palette.get('light', { hanging: 'true' });
    const xm = Math.floor((x0 + x1) / 2);
    const zm = Math.floor((z0 + z1) / 2);
    const ops: AuthoringOp[] = [
      { op: 'fill', from: [x0, y0, z0], to: [x1, y0, z1], state: floor },
      { op: 'fill', from: [x0, y1, z0], to: [x1, y1, z1], state: ceil },
      { op: 'walls', from: [x0, y0 + 1, z0], to: [x1, y1 - 1, z1], state: wall },
      { op: 'block', pos: [xm, y1 - 1, zm], state: light },
    ];
    // Clerestory band: the wall course just under the ceiling becomes glass (above grade).
    if (y1 - 1 > y0 + 1) ops.push({ op: 'walls', from: [x0, y1 - 1, z0], to: [x1, y1 - 1, z1], state: win });
    return ops;
  },
};
