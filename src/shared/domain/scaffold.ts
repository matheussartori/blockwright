// The vanilla structure-block EDITING scaffold (Phase 3a). An oversized build can't load in
// one Structure Block (48³ cap), so to edit it in-world WITHOUT a mod we lay each ≤-limit
// piece out separately, each with its own SAVE-mode structure block. The player loads, edits,
// and re-SAVEs each piece; Blockwright then stitches the edited pieces back by the manifest
// grid (no in-world alignment needed — each piece is edited in isolation).
//
// Pure text generation (no IO): given the split plan it produces the `.mcfunction` the player
// runs at their position. Targets the 1.21 command syntax.
import type { SplitPlan, SplitSlot, Vec3 } from './split';
import { pieceName } from './split';

/** Gap (in blocks) between adjacent piece editing areas so their bounding boxes never touch. */
const PAD = 2;

/** Place each piece's editing area on a flat grid at the run position, so a build with many
 *  pieces stays compact rather than one long row. Returns each piece's anchor (the SAVE
 *  block cell); the piece geometry sits one block above it (`posY:1`). Positions are arbitrary
 *  — reassembly uses the manifest grid, not where the player edits each piece. */
export function scaffoldLayout(plan: SplitPlan): { slot: SplitSlot; name: string; anchor: Vec3 }[] {
  const step = plan.limit + PAD;
  const cols = Math.max(1, Math.ceil(Math.sqrt(plan.slots.length)));
  return plan.slots.map((slot, t) => ({
    slot,
    name: pieceName(slot),
    anchor: [(t % cols) * step, 0, Math.floor(t / cols) * step],
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
