// Pure integer geometry helpers shared by the op-expansion code. No knowledge of
// blocks or palettes beyond the cell map — just coordinates.
import type { AuthoringBlock } from './types';

export type Vec3 = [number, number, number];

export const posKey = (x: number, y: number, z: number): string => `${x},${y},${z}`;

export const inBounds = (p: Vec3, s: Vec3): boolean =>
  p[0] >= 0 && p[0] < s[0] && p[1] >= 0 && p[1] < s[1] && p[2] >= 0 && p[2] < s[2];

/** Integer 3D line (DDA over the dominant axis) between two inclusive endpoints. */
export function lineCells(a: Vec3, b: Vec3): Vec3[] {
  let [x, y, z] = a;
  const [x1, y1, z1] = b;
  const dx = Math.abs(x1 - x), dy = Math.abs(y1 - y), dz = Math.abs(z1 - z);
  const sx = x < x1 ? 1 : -1, sy = y < y1 ? 1 : -1, sz = z < z1 ? 1 : -1;
  const cells: Vec3[] = [];
  if (dx >= dy && dx >= dz) {
    let ey = 2 * dy - dx, ez = 2 * dz - dx;
    for (let i = 0; i <= dx; i++) {
      cells.push([x, y, z]);
      if (ey > 0) { y += sy; ey -= 2 * dx; }
      if (ez > 0) { z += sz; ez -= 2 * dx; }
      ey += 2 * dy; ez += 2 * dz; x += sx;
    }
  } else if (dy >= dx && dy >= dz) {
    let ex = 2 * dx - dy, ez = 2 * dz - dy;
    for (let i = 0; i <= dy; i++) {
      cells.push([x, y, z]);
      if (ex > 0) { x += sx; ex -= 2 * dy; }
      if (ez > 0) { z += sz; ez -= 2 * dy; }
      ex += 2 * dx; ez += 2 * dz; y += sy;
    }
  } else {
    let ex = 2 * dx - dz, ey = 2 * dy - dz;
    for (let i = 0; i <= dz; i++) {
      cells.push([x, y, z]);
      if (ex > 0) { x += sx; ex -= 2 * dz; }
      if (ey > 0) { y += sy; ey -= 2 * dz; }
      ex += 2 * dx; ey += 2 * dy; z += sz;
    }
  }
  return cells;
}

/** Snapshot the cells currently inside an inclusive box (source for the transform
 *  ops, taken before we start writing copies). */
export function cellsInBox(cells: Map<string, AuthoringBlock>, a: Vec3, b: Vec3): AuthoringBlock[] {
  const x0 = Math.min(a[0], b[0]), x1 = Math.max(a[0], b[0]);
  const y0 = Math.min(a[1], b[1]), y1 = Math.max(a[1], b[1]);
  const z0 = Math.min(a[2], b[2]), z1 = Math.max(a[2], b[2]);
  const out: AuthoringBlock[] = [];
  for (const c of cells.values()) {
    const [x, y, z] = c.pos;
    if (x >= x0 && x <= x1 && y >= y0 && y <= y1 && z >= z0 && z <= z1) out.push(c);
  }
  return out;
}

/** One clockwise quarter-turn of (x,z) about pivot (px,pz), viewed from above. */
export function rotXZ(x: number, z: number, px: number, pz: number): [number, number] {
  return [px - (z - pz), pz + (x - px)];
}
