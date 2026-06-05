// Compute the exterior "shell" of a build: its watertight outer skin — the outer
// walls, the roof, and any exposed underside. Destructive passes (stairwell carving,
// air-fill) must NOT punch through it, or they produce the recurring defects of a
// stairwell that "destroys the roof" or "guts a structural wall" to make headroom or
// a landing. The block list is flat (no notion of wall vs roof vs partition), so we
// recover the skin geometrically.
//
// Method (terrain-free, the way a vanilla piece sits in the world): flood-fill
// "outside" from a 1-cell-padded bounding-box border through every cell that is NOT
// a present block (air or omitted). Any present block touching that outside region
// (or the padded border directly) is shell. Interior partitions, floors and ceilings
// — sealed away from the outside by the shell — are NOT shell, so they stay carvable.
//
// Caveat: a large unsealed opening (a doorway with no door block, an open archway)
// lets "outside" leak in, which can mark nearby interior blocks as shell too. That
// only ever makes the protection MORE conservative (we skip a carve and warn instead
// of gouging), so it fails safe.
import { posKey } from '../geometry';
import { isAir } from '../palette';
import type { AuthoringBlock, AuthoringPaletteEntry } from '../types';

const N6: [number, number, number][] = [
  [1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1],
];

export interface Envelope {
  /** posKey(x,y,z) of every block cell on the exterior skin. */
  shell: Set<string>;
  /** Whether the cell at (x,y,z) is part of the protected exterior shell. */
  isShell: (x: number, y: number, z: number) => boolean;
}

/** Recover the exterior shell from a resolved block list (see file header). */
export function computeEnvelope(
  blocks: AuthoringBlock[],
  palette: AuthoringPaletteEntry[],
): Envelope {
  // Present (non-air) cells are flood-fill barriers; also track the bounding box.
  const barrier = new Set<string>();
  let minX = Infinity, minY = Infinity, minZ = Infinity;
  let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
  for (const b of blocks) {
    const name = palette[b.state]?.Name ?? '';
    if (isAir(name)) continue;
    const [x, y, z] = b.pos;
    barrier.add(posKey(x, y, z));
    if (x < minX) minX = x; if (y < minY) minY = y; if (z < minZ) minZ = z;
    if (x > maxX) maxX = x; if (y > maxY) maxY = y; if (z > maxZ) maxZ = z;
  }
  if (barrier.size === 0) return { shell: new Set(), isShell: () => false };

  // Pad the box by 1 so the border is guaranteed to be outside the build.
  const lo: [number, number, number] = [minX - 1, minY - 1, minZ - 1];
  const hi: [number, number, number] = [maxX + 1, maxY + 1, maxZ + 1];
  const inPad = (x: number, y: number, z: number): boolean =>
    x >= lo[0] && x <= hi[0] && y >= lo[1] && y <= hi[1] && z >= lo[2] && z <= hi[2];

  // Flood the empty space from a padded corner; everything reached is "outside".
  const outside = new Set<string>();
  const start = posKey(...lo);
  outside.add(start);
  const stack: [number, number, number][] = [lo];
  while (stack.length) {
    const [x, y, z] = stack.pop() as [number, number, number];
    for (const [dx, dy, dz] of N6) {
      const nx = x + dx, ny = y + dy, nz = z + dz;
      if (!inPad(nx, ny, nz)) continue;
      const k = posKey(nx, ny, nz);
      if (outside.has(k) || barrier.has(k)) continue;
      outside.add(k);
      stack.push([nx, ny, nz]);
    }
  }

  // A barrier cell is shell if any 6-neighbour is outside (or beyond the padded box).
  const shell = new Set<string>();
  for (const key of barrier) {
    const [x, y, z] = key.split(',').map(Number) as [number, number, number];
    for (const [dx, dy, dz] of N6) {
      const nx = x + dx, ny = y + dy, nz = z + dz;
      if (!inPad(nx, ny, nz) || outside.has(posKey(nx, ny, nz))) { shell.add(key); break; }
    }
  }
  return { shell, isShell: (x, y, z) => shell.has(posKey(x, y, z)) };
}
