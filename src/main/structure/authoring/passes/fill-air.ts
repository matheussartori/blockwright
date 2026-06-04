// Clear a build's interior with explicit `minecraft:air` — but only inside its own
// footprint, so placement doesn't gouge the surrounding terrain.
//
// On placement a Minecraft structure leaves OMITTED positions unchanged (the
// world's existing block stays), and writes whatever IS in the file. Air-filling
// the WHOLE bounding box would carve a rectangular hole in the terrain around any
// non-rectangular build (a cross/L footprint loses its concave corners; a manor
// deletes a 40×40 block of world). Instead we fill air only **per occupied (x,z)
// column, between that column's lowest and highest block** — so enclosed room
// interiors get cleared, but cells outside the build (empty columns, and the space
// above/below each column) stay OMITTED and the terrain is preserved, exactly like
// a vanilla worldgen piece.
import { posKey } from '../geometry';
import { isAir } from '../palette';
import type { AuthoringBlock } from '../types';
import type { Pass } from './types';

export const fillInteriorAir: Pass = (blocks, palette) => {
  let airIdx = palette.findIndex((p) => isAir(p.Name));
  let outPalette = palette;
  if (airIdx < 0) {
    airIdx = palette.length;
    outPalette = [...palette, { Name: 'minecraft:air' }];
  }
  // `blocks` here is already air-free (resolveBlocks drops air). Find each column's
  // vertical extent, then air-fill the gaps within it.
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
      if (!occupied.has(posKey(x, y, z))) out.push({ state: airIdx, pos: [x, y, z] });
    }
  }
  return { blocks: out, palette: outPalette };
};
