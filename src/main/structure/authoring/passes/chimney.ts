// House finalizer: enforce ONE complete chimney. AI builds routinely cap a chimney with
// a `campfire` (the knowledge tells them to — it renders flame + smoke), but get the
// stack wrong: the campfire floats with a gap below it, the flue stops short, or there
// are several stray chimneys. This pass anchors on that campfire cap (a strong, intentional
// signal, so we never mistake a plain stone pillar for a chimney) and repairs it
// deterministically. Gated to house-style structures by the compile pipeline (a structure
// with no hearth doesn't opt in), so it only ever runs where a chimney is expected.
//
// It is conservative — it only TOUCHES campfire-capped columns:
//  • Floating / short flue → fill the air gap from the cap down to the first solid block
//    in its column, so the stack is continuous and the cap is supported.
//  • A cap with no column at all below it (a campfire stuck on the roof) → remove it.
//  • More than one chimney → keep the tallest-rooted one, remove the extra caps.
//  • Anything foreign threaded through the flue masonry (a bed shoved against the chimney,
//    a bookshelf clipping it) → restored to the flue material. The flue is the (x,z)
//    column(s) of flue material under the cap; everything above the hearth must be unbroken
//    masonry, because a chimney is never interrupted. The hearth campfire + its smoke vent
//    are preserved.
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
  let cleared = 0;
  let removedExtra = 0;
  let removedFloating = 0;

  for (const i of info) {
    if (i !== keep) {
      removeKeys.add(posKey(...i.block.pos)); // extra or floating cap → drop it
      if (i.rootY === null) removedFloating++;
      else removedExtra++;
      continue;
    }
    const [x, yc, z] = i.block.pos;
    const matId = i.mat as number;
    const matBare = bareId(nameOf(matId));
    // Complete the kept flue: fill every air cell from the cap down to the first solid,
    // so the stack is continuous and the cap isn't floating.
    for (let y = yc - 1; y > (i.rootY as number); y--) {
      if (presentAt(x, y, z)) continue;
      const key = posKey(x, y, z);
      if (at.has(key)) removeKeys.add(key); // replace an existing air entry
      add.push({ state: matId, pos: [x, y, z] });
      filled++;
    }
    // The flue footprint: the (x,z) columns of flue material 4-connected to the cap at
    // the band just below it (a 1×1 stack, a 2×2 stack, …). Bounded so a wide brick
    // floor at the cap's level can't be mistaken for the chimney.
    const bandY = yc - 1;
    const isFlueCol = (cx: number, cz: number): boolean => {
      const b = presentAt(cx, bandY, cz);
      return !!b && bareId(nameOf(b.state)) === matBare;
    };
    const foot: [number, number][] = [];
    const fseen = new Set<string>();
    const stack: [number, number][] = [[x, z]];
    while (stack.length && foot.length < 9) {
      const [px, pz] = stack.pop() as [number, number];
      const fk = `${px},${pz}`;
      if (fseen.has(fk)) continue;
      fseen.add(fk);
      if (!isFlueCol(px, pz)) continue;
      foot.push([px, pz]);
      stack.push([px + 1, pz], [px - 1, pz], [px, pz + 1], [px, pz - 1]);
    }
    // The hearth: the highest campfire under the cap in the footprint. Keep it (and the
    // smoke vent above it) intact; only the masonry ABOVE the hearth must be unbroken.
    // With no hearth campfire, fall back to the base of the flue stack (its lowest brick)
    // so the whole column above the base is checked.
    let baseY = Infinity;
    for (const [fx, fz] of foot) for (const b of blocks) {
      if (b.pos[0] === fx && b.pos[2] === fz && bareId(nameOf(b.state)) === matBare) baseY = Math.min(baseY, b.pos[1]);
    }
    let hearthY = Number.isFinite(baseY) ? baseY : (i.rootY as number);
    for (const b of blocks) {
      if (!isCampfire(nameOf(b.state)) || b.pos[1] >= yc) continue;
      if (foot.some(([fx, fz]) => fx === b.pos[0] && fz === b.pos[2])) hearthY = Math.max(hearthY, b.pos[1]);
    }
    // Anything foreign threaded through the flue masonry (a bed shoved against the
    // chimney, a shelf clipping it) → restore it to the flue material. A chimney is
    // never interrupted. Air is left alone here (the smoke vent above the hearth).
    for (const [fx, fz] of foot) {
      for (let y = hearthY + 1; y < yc; y++) {
        const b = presentAt(fx, y, fz);
        if (!b) continue;
        const id = bareId(nameOf(b.state));
        if (id === matBare || isCampfire(nameOf(b.state))) continue;
        removeKeys.add(posKey(fx, y, fz));
        add.push({ state: matId, pos: [fx, y, fz] });
        cleared++;
      }
    }
  }

  if (removeKeys.size === 0 && add.length === 0) return { blocks, palette };

  const fixes: string[] = [];
  if (filled) fixes.push(`Chimney: filled ${filled} flue gap block(s) so the stack is continuous and the cap isn't floating.`);
  if (cleared) fixes.push(`Chimney: cleared ${cleared} block(s) (a bed/shelf) threaded through the flue — a chimney is never interrupted.`);
  if (removedExtra) fixes.push(`Chimney: removed ${removedExtra} extra chimney(s) — a house has a single flue.`);
  if (removedFloating) fixes.push(`Chimney: removed ${removedFloating} floating campfire cap(s) with no supporting column.`);

  const out = blocks.filter((b) => !removeKeys.has(posKey(...b.pos))).concat(add);
  return { blocks: out, palette, fixes };
};
