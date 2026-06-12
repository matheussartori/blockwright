// The seeded chamfered OUTLINE shared by the surroundings modules: every corner of the
// yard is cut by a stepped diagonal whose size is seeded AND scales with the ring's
// margins, so the yard's footprint is never the plain rectangle and no two builds share
// one. `rimCells` walks the perimeter (fence/hedge) in order; `inCut` tells the lawn/
// terrace fills which corner cells fall OUTSIDE the outline — those cells get NOTHING,
// so the compiled structure's footprint genuinely takes the chamfered shape.
import type { SurroundMargins } from '@/shared/domain/surroundings';
import type { Box } from '../structure-types/types';

/** A horizontal cell of the yard rim. */
export interface Pt { x: number; z: number }

/** The chamfer size per corner: front-left (nw), front-right (ne), back-right (se),
 *  back-left (sw). Front is the -z face. */
export interface Chamfers { nw: number; ne: number; se: number; sw: number }

/**
 * Seeded per-corner chamfers scaled to the ring: each corner draws its cut size from
 * `[min, cap]`, where the cap grows with the ring's margins (clamped so a cut can never
 * reach past its own margin into the house corridor).
 *
 * @param rnd - The seeded PRNG (one draw per corner, in nw/ne/se/sw order).
 * @param m - The ring's margins (the cut must stay inside the smallest of them).
 * @param min - The smallest cut (≥ 2 keeps every corner visibly chamfered).
 * @param cap - The largest cut this module's furniture layout tolerates.
 * @returns The four corner cuts.
 */
export function seededChamfers(rnd: () => number, m: SurroundMargins, min: number, cap: number): Chamfers {
  const max = Math.max(min, Math.min(cap, m.side - 1, m.front - 1, m.back - 1));
  const pick = (): number => min + Math.floor(rnd() * (max - min + 1));
  return { nw: pick(), ne: pick(), se: pick(), sw: pick() };
}

/**
 * Ordered perimeter cells of the yard rim: the box rim with every corner cut by a
 * STEPPED chamfer (orthogonally connected cells, so a fence/hedge row never breaks),
 * walked clockwise from the front-left run — the ordering spaces lamp posts evenly.
 *
 * @param b - The full build box (the rim follows its x/z bounds).
 * @param ch - The chamfer size per corner.
 * @returns The rim cells in walking order, deduplicated.
 */
export function rimCells(b: Box, ch: Chamfers): Pt[] {
  const cells = new Map<string, Pt>();
  const push = (x: number, z: number): void => {
    const k = `${x},${z}`;
    if (!cells.has(k)) cells.set(k, { x, z });
  };
  // A stepped diagonal from (x,z): `c` pairs of one step along `first`, one along the other.
  const steps = (x: number, z: number, first: 'x' | 'z', dx: number, dz: number, c: number): void => {
    for (let i = 0; i < c; i++) {
      if (first === 'x') { x += dx; push(x, z); z += dz; push(x, z); }
      else { z += dz; push(x, z); x += dx; push(x, z); }
    }
  };
  for (let x = b.x0 + ch.nw; x <= b.x1 - ch.ne; x++) push(x, b.z0); // front run (between chamfers)
  steps(b.x1 - ch.ne, b.z0, 'x', 1, 1, ch.ne); // front-right corner
  for (let z = b.z0 + ch.ne; z <= b.z1 - ch.se; z++) push(b.x1, z); // right run
  steps(b.x1, b.z1 - ch.se, 'z', -1, 1, ch.se); // back-right corner
  for (let x = b.x1 - ch.se; x >= b.x0 + ch.sw; x--) push(x, b.z1); // back run
  steps(b.x0 + ch.sw, b.z1, 'x', -1, -1, ch.sw); // back-left corner
  for (let z = b.z1 - ch.sw; z >= b.z0 + ch.nw; z--) push(b.x0, z); // left run
  steps(b.x0, b.z0 + ch.nw, 'z', 1, -1, ch.nw); // front-left corner
  return [...cells.values()];
}

/** Whether (x,z) lies OUTSIDE the chamfered outline — in a cut corner triangle. The
 *  rim diagonal for cut `c` occupies the cells whose edge-distance sum is `c-1`/`c`,
 *  so everything at `≤ c-2` is beyond it and gets no yard at all. */
export function inCut(b: Box, ch: Chamfers, x: number, z: number): boolean {
  const w = x - b.x0, e = b.x1 - x, n = z - b.z0, s = b.z1 - z;
  return w + n <= ch.nw - 2 || e + n <= ch.ne - 2 || e + s <= ch.se - 2 || w + s <= ch.sw - 2;
}
