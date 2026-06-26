// The vanilla structure-block EDITING scaffold (Phase 3a). An oversized build can't load in
// one Structure Block (48³ cap), so to edit it in-world WITHOUT a mod we lay each ≤-limit
// piece at its TRUE position, so the pieces tile into the original silhouette and the player
// edits the whole build at once. Each piece still gets its own SAVE-mode structure block (sat
// one cell below the piece, posY:1 — within the ±48 relative-position limit since a piece is
// ≤48). The player edits the assembled build and re-SAVEs each piece; Blockwright then stitches
// the edited pieces back by the manifest grid (reassembly keys on the saved file NAME, not on
// where the player edited — so the layout is purely for the player's benefit).
//
// Vertical splits (ny>1) can't share one solid stack AND keep every piece's structure block
// reachable (an interior upper block would land inside the build), so each vertical layer is
// floated one empty row above the previous; that row holds the layer's structure blocks. A
// build with no vertical split (the common case) has a single layer, so it assembles whole.
//
// Pure text generation (no IO): given the split plan it produces the `.mcfunction` the player
// runs at their position. Targets the 1.21 command syntax.
import type { SplitPlan, SplitSlot, Vec3 } from './split';
import { pieceName } from './split';

/** Empty rows inserted below each vertical layer to hold that layer's SAVE structure blocks. */
const LAYER_GAP = 1;

/** Lay each piece at its real position so the assembly reads as the whole build. Returns each
 *  piece's anchor (the SAVE block cell); the piece geometry sits one block above it (`posY:1`),
 *  i.e. at its original min corner shifted up by one gap row per vertical layer below it. */
export function scaffoldLayout(plan: SplitPlan): { slot: SplitSlot; name: string; anchor: Vec3 }[] {
  return plan.slots.map((slot) => ({
    slot,
    name: pieceName(slot),
    // x/z stay at the true min; y lifts the layer (slot.j) up by one extra gap row so the
    // row directly below it (anchor.y) is free for this piece's structure block.
    anchor: [slot.min[0], slot.min[1] + (slot.j + 1) * LAYER_GAP - 1, slot.min[2]],
  }));
}

/** A SAVE-mode structure-block `setblock` for one piece: the block sits at `anchor`, its capture
 *  box is one cell above (`posY:1`) sized to the slot, with the bounding box shown so the player
 *  can see exactly what they're editing. The same box `/place template` fills, so a re-SAVE
 *  writes the edited region straight back to the piece. */
function saveBlockCommand(id: string, anchor: Vec3, size: Vec3): string {
  const [ax, ay, az] = anchor;
  const nbt = `{mode:"SAVE",name:"${id}",posX:0,posY:1,posZ:0,sizeX:${size[0]},sizeY:${size[1]},sizeZ:${size[2]},showboundingbox:1b}`;
  return `setblock ~${ax} ~${ay} ~${az} minecraft:structure_block${nbt}`;
}

/**
 * Build the editing-scaffold `.mcfunction` text for a split.
 *
 * @param namespace - The datapack namespace the pieces live under.
 * @param base - The structure base name (pieces are `<base>/<pieceName>`).
 * @param plan - The split plan (its slots drive one editing area per piece).
 * @returns The function body: for each piece, lay it with `place template` and drop a SAVE
 *   structure block beside it, preceded by a usage header.
 */
export function scaffoldFunction(namespace: string, base: string, plan: SplitPlan): string {
  const lines: string[] = [
    `# Blockwright in-world editing scaffold for ${namespace}:${base}`,
    `# Run this at the spot you want the editing area, then for each bounding box:`,
    `#   edit the blocks inside it, open its structure block, and click SAVE.`,
    `# When every piece is saved, use File > Reimport from World in Blockwright.`,
    '',
  ];
  for (const { slot, name, anchor } of scaffoldLayout(plan)) {
    const id = `${namespace}:${base}/${name}`;
    const [ax, ay, az] = anchor;
    lines.push(`place template ${id} ~${ax} ~${ay + 1} ~${az}`);
    lines.push(saveBlockCommand(id, [ax, ay, az], slot.size));
  }
  lines.push('');
  return lines.join('\n');
}
