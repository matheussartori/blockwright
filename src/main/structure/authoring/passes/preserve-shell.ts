// preserveShell — re-assert the code-built starting SHELL of a `lockShell` structure
// type (gothic) so the AI can't gut its exterior. A seeded shell is only CONTEXT the
// model is free to ignore, and it does: it reliably deletes the ground-floor slab and
// half the roof (the "sem chão / sem telhado" defect), then strews furniture over the
// hole. This pass makes the exterior code-OWNED while still letting the model finish the
// interior:
//
//   For every protected shell cell, if the model's compiled result left that cell as AIR
//   (a hole / a deletion), restore the shell's block. If the model put a SOLID block
//   there — redecorated the wall, added a glass pane to window-ify it, kept the floor —
//   leave it. So the model may recolor, glaze and furnish freely, but cannot delete the
//   floor, roof, walls or tower.
//
// Runs FIRST in the pipeline (before rebuildStairwells), so the floor/roof are whole
// before circulation cuts its stair opening and the chimney pass clears its flue.
import { posKey } from '../geometry';
import { isAir, makeIntern } from '../palette';
import type { Pass } from './types';

export const preserveShell: Pass = (blocks, palette, ctx) => {
  const cells = ctx.lockCells;
  if (!cells?.length) return { blocks, palette };
  const [X, Y, Z] = ctx.size;

  // Current occupancy: posKey → index into `blocks` (last writer wins, matching how the
  // build was assembled).
  const at = new Map<string, number>();
  blocks.forEach((b, i) => at.set(posKey(b.pos[0], b.pos[1], b.pos[2]), i));
  const isAirIdx = (idx: number): boolean => isAir(palette[idx]?.Name ?? 'minecraft:air');

  const out = blocks.slice();
  const intern = makeIntern(palette);
  let restored = 0;
  for (const c of cells) {
    const [x, y, z] = c.pos;
    if (x < 0 || y < 0 || z < 0 || x >= X || y >= Y || z >= Z) continue; // out of this build
    if (isAir(c.entry.Name)) continue; // only solid shell geometry is protected
    const k = posKey(x, y, z);
    const idx = at.get(k);
    if (idx !== undefined && !isAirIdx(out[idx].state)) continue; // model kept/redecorated it
    const state = intern(c.entry);
    if (idx === undefined) {
      out.push({ state, pos: [x, y, z] });
      at.set(k, out.length - 1);
    } else {
      out[idx] = { state, pos: [x, y, z] };
    }
    restored += 1;
  }

  const fixes = restored
    ? [`restored ${restored} deleted shell block(s) the build must keep (floor/roof/walls/tower)`]
    : [];
  return { blocks: out, palette, fixes };
};
