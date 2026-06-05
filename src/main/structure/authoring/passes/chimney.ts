// House finalizer: enforce ONE complete chimney. AI builds routinely cap a chimney with
// a `campfire` (the knowledge tells them to — it renders flame + smoke), but get the
// stack wrong: the campfire floats with a gap below it, the flue stops short, or there
// are several stray chimneys. This pass anchors on that campfire cap (a strong, intentional
// signal, so we never mistake a plain stone pillar for a chimney) and repairs it
// deterministically. Gated to house-style structures by the compile pipeline (a tower has
// no hearth), so it only ever runs where a chimney is expected.
//
// It is conservative — it only TOUCHES campfire-capped columns:
//  • Floating / short flue → fill the air gap from the cap down to the first solid block
//    in its column, so the stack is continuous and the cap is supported.
//  • A cap with no column at all below it (a campfire stuck on the roof) → remove it.
//  • More than one chimney → keep the tallest-rooted one, remove the extra caps.
// It does NOT invent a chimney where the model placed none, and leaves low interior hearth
// campfires alone (only elevated, sky-exposed caps are treated as chimney tops).
import { posKey } from '../geometry';
import { bareId, isAir } from '../palette';
import type { AuthoringBlock } from '../types';
import type { Pass } from './types';

const isCampfire = (name: string): boolean => {
  const id = bareId(name);
  return id === 'campfire' || id === 'soul_campfire';
};

export const fixChimney: Pass = (blocks, palette) => {
  const at = new Map<string, AuthoringBlock>();
  for (const b of blocks) at.set(posKey(...b.pos), b);
  const nameOf = (s: number): string => palette[s]?.Name ?? '';
  const presentAt = (x: number, y: number, z: number): AuthoringBlock | undefined => {
    const b = at.get(posKey(x, y, z));
    return b && !isAir(nameOf(b.state)) ? b : undefined;
  };

  // Build's vertical extent (present blocks only) — to tell a roof-top cap from a hearth.
  let minY = Infinity;
  let maxY = -Infinity;
  for (const b of blocks) {
    if (isAir(nameOf(b.state))) continue;
    const y = b.pos[1];
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  }
  if (!Number.isFinite(minY)) return { blocks, palette };

  // Chimney caps: a campfire in the upper half of the build, exposed on top (nothing
  // directly above it). Excludes ground/interior hearth campfires.
  const upperHalf = minY + (maxY - minY) / 2;
  const caps = blocks.filter(
    (b) => isCampfire(nameOf(b.state)) && b.pos[1] >= upperHalf && !presentAt(b.pos[0], b.pos[1] + 1, b.pos[2]),
  );
  if (caps.length === 0) return { blocks, palette };

  // For each cap, the first solid (non-campfire) block straight down = the flue material.
  interface Cap { block: AuthoringBlock; rootY: number | null; mat: number | null }
  const info: Cap[] = caps.map((block) => {
    const [x, yc, z] = block.pos;
    let rootY: number | null = null;
    let mat: number | null = null;
    for (let y = yc - 1; y >= minY; y--) {
      const b = presentAt(x, y, z);
      if (b && !isCampfire(nameOf(b.state))) {
        rootY = y;
        mat = b.state;
        break;
      }
    }
    return { block, rootY, mat };
  });

  // Keep ONE chimney: the cap with the tallest rooted flue. Floating caps (no column) are
  // never the keeper.
  const rooted = info.filter((i) => i.rootY !== null);
  const keep: Cap | null = rooted.length
    ? rooted.reduce((best, i) => (i.block.pos[1] - (i.rootY as number) > best.block.pos[1] - (best.rootY as number) ? i : best))
    : null;

  const removeKeys = new Set<string>();
  const add: AuthoringBlock[] = [];
  let filled = 0;
  let removedExtra = 0;
  let removedFloating = 0;

  for (const i of info) {
    if (i !== keep) {
      removeKeys.add(posKey(...i.block.pos)); // extra or floating cap → drop it
      if (i.rootY === null) removedFloating++;
      else removedExtra++;
      continue;
    }
    // Complete the kept flue: fill every air cell from the cap down to the first solid.
    const [x, yc, z] = i.block.pos;
    for (let y = yc - 1; y > (i.rootY as number); y--) {
      if (presentAt(x, y, z)) continue;
      const key = posKey(x, y, z);
      if (at.has(key)) removeKeys.add(key); // replace an existing air entry
      add.push({ state: i.mat as number, pos: [x, y, z] });
      filled++;
    }
  }

  if (removeKeys.size === 0 && add.length === 0) return { blocks, palette };

  const fixes: string[] = [];
  if (filled) fixes.push(`Chimney: filled ${filled} flue gap block(s) so the stack is continuous and the cap isn't floating.`);
  if (removedExtra) fixes.push(`Chimney: removed ${removedExtra} extra chimney(s) — a house has a single flue.`);
  if (removedFloating) fixes.push(`Chimney: removed ${removedFloating} floating campfire cap(s) with no supporting column.`);

  const out = blocks.filter((b) => !removeKeys.has(posKey(...b.pos))).concat(add);
  return { blocks: out, palette, fixes };
};
