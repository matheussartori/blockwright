// Double doors need mirrored hinges. A door's `hinge` (left|right) decides which
// edge the panel pivots on; the handle sits on the opposite edge. For a two-wide
// double door the two leaves must be mirror images — hinges on the OUTER jambs,
// handles meeting in the centre — so opening swings each leaf out to its own side
// (the "one in each corner" the user wants). The model routinely gives both leaves
// the SAME hinge, so the handles land on the outside and the leaves swing into each
// other in the middle. Vanilla decides this at placement time from neighbours; the
// authoring JSON can't, so we reproduce it here: find side-by-side same-facing door
// pairs and set each leaf's hinge to its outer edge. Single doors are left as the
// model authored them (their hinge is a design choice, covered by the knowledge base).
import { posKey } from '../geometry';
import { bareId, makeIntern } from '../palette';
import type { Pass } from './types';

// The horizontal direction that is to the RIGHT when facing `facing` (looking along
// it). hinge:'right' puts the hinge on this side of the cell; 'left' on the opposite.
const PERP_RIGHT: Record<string, [number, number]> = {
  north: [1, 0],   // facing -z → right is east (+x)
  south: [-1, 0],  // facing +z → right is west (-x)
  east: [0, 1],    // facing +x → right is south (+z)
  west: [0, -1],   // facing -x → right is north (-z)
};
// The two perpendicular offsets to probe for a side-by-side partner, per facing.
const PERP_OFFSETS: Record<string, [number, number][]> = {
  north: [[1, 0], [-1, 0]], south: [[1, 0], [-1, 0]],
  east: [[0, 1], [0, -1]], west: [[0, 1], [0, -1]],
};

// `_trapdoor` ends in `_trapdoor`, not `_door`, so it is correctly excluded.
const isDoorName = (name: string): boolean => bareId(name).endsWith('_door');

export const fixDoors: Pass = (blocks, palette) => {
  const nameAt = new Map<string, string>();
  const propsAt = new Map<string, Record<string, unknown>>();
  for (const b of blocks) {
    const e = palette[b.state];
    nameAt.set(posKey(...b.pos), e?.Name ?? '');
    propsAt.set(posKey(...b.pos), e?.Properties ?? {});
  }
  // The facing of a LOWER door leaf at a cell, or null if it isn't one.
  const lowerFacing = (x: number, y: number, z: number): string | null => {
    const name = nameAt.get(posKey(x, y, z));
    if (name === undefined || !isDoorName(name)) return null;
    const p = propsAt.get(posKey(x, y, z));
    if (!p || p.half !== 'lower') return null;
    const f = p.facing;
    return typeof f === 'string' && PERP_RIGHT[f] ? f : null;
  };

  // Decide the hinge for each lower-leaf cell that is one end of a 2-wide door.
  const hingeFor = new Map<string, 'left' | 'right'>();
  for (const b of blocks) {
    const [x, y, z] = b.pos;
    const facing = lowerFacing(x, y, z);
    if (!facing) continue;
    let partner: [number, number] | null = null;
    let count = 0;
    for (const [ox, oz] of PERP_OFFSETS[facing]) {
      if (lowerFacing(x + ox, y, z + oz) === facing) { partner = [ox, oz]; count++; }
    }
    if (count !== 1 || !partner) continue; // lone door, or a 3+ run we won't second-guess
    // The hinge belongs on the OUTER edge — the side AWAY from the partner.
    const right = PERP_RIGHT[facing];
    const awayIsRight = -partner[0] === right[0] && -partner[1] === right[1];
    hingeFor.set(posKey(x, y, z), awayIsRight ? 'right' : 'left');
  }
  if (hingeFor.size === 0) return { blocks, palette };

  const outPalette = palette.slice();
  const intern = makeIntern(outPalette);
  let changed = 0;
  const out = blocks.map((b) => {
    const e = palette[b.state];
    if (!e || !isDoorName(e.Name)) return b;
    const props = e.Properties ?? {};
    const [x, y, z] = b.pos;
    // Both leaves of a door share the lower leaf's hinge; look it up at the base cell.
    const baseKey = props.half === 'upper' ? posKey(x, y - 1, z) : posKey(x, y, z);
    const hinge = hingeFor.get(baseKey);
    if (!hinge || props.hinge === hinge) return b;
    changed++;
    return { ...b, state: intern({ Name: e.Name, Properties: { ...props, hinge } }) };
  });

  const fixes = changed
    ? [`re-hinged ${changed} double-door leaf${changed === 1 ? '' : 's'} so the handles meet in `
      + `the centre and the doors open to the sides`]
    : undefined;
  return { blocks: out, palette: outPalette, fixes };
};
