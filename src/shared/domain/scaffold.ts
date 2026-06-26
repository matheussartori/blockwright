// The vanilla structure-block EDITING scaffold (Phase 3a). An oversized build can't load in
// one Structure Block (48³ cap), so to edit it in-world WITHOUT a mod we lay each ≤-limit
// piece at its TRUE position, so the pieces tile SEAMLESSLY into the original silhouette and
// the player edits the whole build at once. Each piece still gets its own SAVE-mode structure
// block; reassembly keys on the saved file NAME, not on where the player edited — so the layout
// is purely for the player's benefit, and a seamless silhouette is the whole point.
//
// The one constraint is keeping every piece's SAVE block out of the build (a block inside the
// silhouette would overwrite a cell). A SAVE block can sit up to ±48 from its capture region and
// a piece is ≤48 per axis, so a block at any FACE-adjacent cell of its piece can still capture
// the whole piece. We place each block on a face that lies on the build's EXTERIOR: the bottom
// layer goes below (a shared empty base row), and an upper layer — which has the lower layer
// directly beneath it — goes to a free side (west/east/north/south) or, for a top piece, above.
// So a vertical split (a tower) stays one solid stack instead of being broken by a gap row.
// (Only a piece interior on all three axes — a ≥3-division split in x, y AND z, i.e. a build
// larger than ~96³ — has no exterior face; it falls back to an above block with a 1-cell overlap.)
//
// Pure text generation (no IO): given the split plan it produces the `.mcfunction` the player
// runs at their position. Targets the 1.21 command syntax.
import type { SplitPlan, SplitSlot, Vec3 } from './split';
import { pieceName } from './split';

/** One empty row under the whole build, holding the bottom layer's SAVE structure blocks. */
const BASE_LIFT = 1;

/** Where one piece is laid + where its SAVE structure block sits. */
export interface ScaffoldPiece {
  slot: SplitSlot;
  name: string;
  /** World cell of the piece geometry's min corner (the `place template` target). */
  origin: Vec3;
  /** World cell of the SAVE-mode structure block. */
  block: Vec3;
  /** Capture-region offset from the block to the piece's min corner (`posX`/`posY`/`posZ`). */
  pos: Vec3;
}

/** Pick a SAVE-block cell on a face of the piece that lies on the build's EXTERIOR, so the block
 *  never overwrites build geometry. The capture offset `pos` always resolves `block + pos` back
 *  to the piece's `origin`, so the SAVE box covers the piece exactly. */
function chooseBlockPlacement(slot: SplitSlot, nx: number, ny: number, nz: number, origin: Vec3): { block: Vec3; pos: Vec3 } {
  const [sx, sy, sz] = slot.size;
  const [ox, oy, oz] = origin;
  if (slot.j === 0) return { block: [ox, oy - 1, oz], pos: [0, 1, 0] }; // below — the shared base row
  if (slot.i === 0) return { block: [ox - 1, oy, oz], pos: [1, 0, 0] }; // west side
  if (slot.i === nx - 1) return { block: [ox + sx, oy, oz], pos: [-sx, 0, 0] }; // east side
  if (slot.k === 0) return { block: [ox, oy, oz - 1], pos: [0, 0, 1] }; // north side
  if (slot.k === nz - 1) return { block: [ox, oy, oz + sz], pos: [0, 0, -sz] }; // south side
  // Top piece, or (the >~96³ pathological case) a fully interior piece: place above.
  return { block: [ox, oy + sy, oz], pos: [0, -sy, 0] };
}

/** Lay each piece SEAMLESSLY at its true position (only lifted one row off the player so the
 *  bottom layer's SAVE blocks have somewhere to sit) and place its SAVE block on an exterior
 *  face. So the pieces tile into one continuous silhouette — a tower stays a single stack. */
export function scaffoldLayout(plan: SplitPlan): ScaffoldPiece[] {
  const { nx, ny, nz } = plan.divisions;
  return plan.slots.map((slot) => {
    const origin: Vec3 = [slot.min[0], slot.min[1] + BASE_LIFT, slot.min[2]];
    const { block, pos } = chooseBlockPlacement(slot, nx, ny, nz, origin);
    return { slot, name: pieceName(slot), origin, block, pos };
  });
}

/** A SAVE-mode structure-block `setblock` for one piece: the block sits at `block`, capturing the
 *  piece via `pos`/`size` with the bounding box shown so the player sees exactly what they're
 *  editing. The same box `/place template` fills, so a re-SAVE writes the edited region straight
 *  back to the piece. */
function saveBlockCommand(id: string, block: Vec3, pos: Vec3, size: Vec3): string {
  const [bx, by, bz] = block;
  const nbt = `{mode:"SAVE",name:"${id}",posX:${pos[0]},posY:${pos[1]},posZ:${pos[2]},sizeX:${size[0]},sizeY:${size[1]},sizeZ:${size[2]},showboundingbox:1b}`;
  return `setblock ~${bx} ~${by} ~${bz} minecraft:structure_block${nbt}`;
}

/**
 * Build the editing-scaffold `.mcfunction` text for a split.
 *
 * @param namespace - The datapack namespace the pieces live under.
 * @param base - The structure base name (pieces are `<base>/<pieceName>`).
 * @param plan - The split plan (its slots drive one editing area per piece).
 * @returns The function body: for each piece, lay it with `place template` and drop a SAVE
 *   structure block on an exterior face, preceded by a usage header.
 */
export function scaffoldFunction(namespace: string, base: string, plan: SplitPlan): string {
  const lines: string[] = [
    `# Blockwright in-world editing scaffold for ${namespace}:${base}`,
    `# Run this at the spot you want the editing area, then for each bounding box:`,
    `#   edit the blocks inside it, open its structure block, and click SAVE.`,
    `# When every piece is saved, use File > Reimport from World in Blockwright.`,
    '',
  ];
  for (const { slot, name, origin, block, pos } of scaffoldLayout(plan)) {
    const id = `${namespace}:${base}/${name}`;
    lines.push(`place template ${id} ~${origin[0]} ~${origin[1]} ~${origin[2]}`);
    lines.push(saveBlockCommand(id, block, pos, slot.size));
  }
  lines.push('');
  return lines.join('\n');
}
