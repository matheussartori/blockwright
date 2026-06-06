// Clear a build's empty pockets the way Minecraft placement expects, distinguishing
// `minecraft:air` (clears the world cell) from an omitted cell (which placement leaves
// UNCHANGED — the world's existing block stays, exactly like `minecraft:structure_void`).
//
// On placement an omitted position preserves the world; only an explicit `air` cell
// carves it open. So WHERE we write air vs leave omitted decides how the build sits
// in real terrain. The rules (per the design intent):
//
//  • INTERIOR (sealed rooms, hidden from the outside) → always `air`. A house's rooms
//    must be hollow regardless of the terrain it lands in.
//  • EXTERIOR pockets ABOVE grade (the recessed facade in front of a door, the open
//    space under/over a balcony) → `air`, so if the build conflicts with terrain that
//    approach stays visible and walkable without the player breaking blocks.
//  • EXTERIOR space BELOW grade (around/under the basement, below the facade) → OMITTED
//    (= structure_void): placement must NOT gouge a trench in front of the basement,
//    it should let the surrounding ground stay.
//
// "Grade" (the ground-floor level) is supplied by the compiler in `ctx.grade`,
// computed from the build's labelled storeys (`gradeFromFloors`) — a stable signal,
// unlike guessing it from geometry. Undefined ⇒ no floors declared, so nothing is
// treated as below grade (every exterior pocket fills with air) — failing safe.
//
// Air is filled per occupied (x,z) column, between that column's lowest and highest
// block, so the build's own negative space is cleared while cells outside it stay
// OMITTED and the terrain is preserved, exactly like a vanilla worldgen piece.
import { posKey } from '../geometry';
import { isAir } from '../palette';
import type { AuthoringBlock } from '../types';
import { computeEnvelope } from './envelope';
import type { Pass } from './types';

export const fillInteriorAir: Pass = (blocks, palette, ctx) => {
  let airIdx = palette.findIndex((p) => isAir(p.Name));
  let outPalette = palette;
  if (airIdx < 0) {
    airIdx = palette.length;
    outPalette = [...palette, { Name: 'minecraft:air' }];
  }
  const env = computeEnvelope(blocks, palette);
  const grade = ctx.grade ?? -Infinity;

  // `blocks` here is already air-free (resolveBlocks drops air). Find each column's
  // vertical extent, then air-fill the gaps within it — but only where the rules above
  // call for air (interior anywhere; exterior only at/above grade).
  const occupied = new Set(blocks.map((b) => posKey(...b.pos)));
  const colMin = new Map<string, number>();
  const colMax = new Map<string, number>();
  for (const b of blocks) {
    const col = `${b.pos[0]},${b.pos[2]}`;
    const y = b.pos[1];
    const lo = colMin.get(col);
    const hi = colMax.get(col);
    if (lo === undefined || y < lo) colMin.set(col, y);
    if (hi === undefined || y > hi) colMax.set(col, y);
  }
  const out: AuthoringBlock[] = blocks.slice();
  for (const [col, y0] of colMin) {
    const y1 = colMax.get(col) as number;
    const [xs, zs] = col.split(',');
    const x = Number(xs), z = Number(zs);
    for (let y = y0 + 1; y < y1; y++) {
      if (occupied.has(posKey(x, y, z))) continue;
      // Exterior pockets below grade stay OMITTED (structure_void): don't carve a
      // trench in front of/around the basement. Interior — and exterior at/above
      // grade (facade/balcony) — gets cleared to air.
      if (env.isOutside(x, y, z) && y < grade) continue;
      out.push({ state: airIdx, pos: [x, y, z] });
    }
  }
  return { blocks: out, palette: outPalette };
};
