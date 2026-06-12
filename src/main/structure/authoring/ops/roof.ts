import { inBounds, posKey } from '../geometry';
import type { Horiz } from '../orientation';
import type { AuthoringOp } from '../types';
import type { OpCtx } from './context';

/** Lay a pitched stair roof over the eave rectangle. `state` must be a `*_stairs`
 *  block; the op derives the per-side facings (and corner shapes for hip), and an
 *  optional `fill` plugs the gap under each step so the roof reads solid. The pitch
 *  never climbs past the op's own box top (`to.y`), so a roof can't overwrite
 *  geometry stacked above it. */
export function applyRoof(op: Extract<AuthoringOp, { op: 'roof' }>, ctx: OpCtx): void {
  const { cells, palette, intern, size } = ctx;
  const x0 = Math.min(op.from[0], op.to[0]), x1 = Math.max(op.from[0], op.to[0]);
  const z0 = Math.min(op.from[2], op.to[2]), z1 = Math.max(op.from[2], op.to[2]);
  const y0 = Math.min(op.from[1], op.to[1]);
  const yMax = Math.max(op.from[1], op.to[1]); // pitch clamp — stay inside the op's box
  const baseName = palette[op.state]?.Name ?? 'minecraft:oak_stairs';
  const slabName = baseName.endsWith('_stairs') ? baseName.replace(/_stairs$/, '_slab') : null;
  // `ridge` = the axis the ridge LINE runs along; default the LONGER side, so the
  // slopes climb the shorter one and the roof stays low (the vanilla silhouette).
  const ridge = op.ridge ?? (x1 - x0 >= z1 - z0 ? 'x' : 'z');
  const hip = op.style === 'hip';

  const stair = (facing: Horiz, shape?: string): number =>
    intern({ Name: baseName, Properties: { facing, half: 'bottom', shape: shape ?? 'straight', waterlogged: 'false' } });
  const set = (x: number, y: number, z: number, st: number): void => {
    if (y <= yMax && inBounds([x, y, z], size)) cells.set(posKey(x, y, z), { state: st, pos: [x, y, z] });
  };
  const plug = (x: number, y: number, z: number): void => {
    if (op.fill !== undefined) set(x, y, z, op.fill);
  };
  const slabTop = (): number | null =>
    slabName ? intern({ Name: slabName, Properties: { type: 'top', waterlogged: 'false' } }) : null;

  if (hip) {
    // Four slopes meeting at a central ridge: each level is the rectangular RING
    // [x0+i, z0+i]..[x1-i, z1-i], so the pitch tops out at half the SHORTER span
    // (where the ring closes into the ridge line — or a point on a square plan),
    // never climbing the longer span like a gable would.
    for (let i = 0; y0 + i <= yMax; i++) {
      const y = y0 + i;
      const xl = x0 + i, xr = x1 - i, zl = z0 + i, zr = z1 - i;
      if (xl > xr || zl > zr) break;
      if (xl === xr || zl === zr) {
        // The shorter axis closed → cap the ridge line (a top slab for a clean seam).
        const cap = slabTop() ?? stair(xl === xr ? 'east' : 'south');
        for (let x = xl; x <= xr; x++) {
          for (let z = zl; z <= zr; z++) { set(x, y, z, cap); plug(x, y - 1, z); }
        }
        break;
      }
      // West/east edges of the ring, with the outer corners at both ends.
      for (let z = zl; z <= zr; z++) {
        const corner = z === zl || z === zr;
        set(xl, y, z, stair(corner ? (z === zl ? 'north' : 'south') : 'east', corner ? (z === zl ? 'outer_left' : 'outer_right') : 'straight'));
        set(xr, y, z, stair(corner ? (z === zl ? 'north' : 'south') : 'west', corner ? (z === zl ? 'outer_right' : 'outer_left') : 'straight'));
        plug(xl, y - 1, z);
        plug(xr, y - 1, z);
      }
      // North/south edges between the corners.
      for (let x = xl + 1; x <= xr - 1; x++) {
        set(x, y, zl, stair('south'));
        set(x, y, zr, stair('north'));
        plug(x, y - 1, zl);
        plug(x, y - 1, zr);
      }
    }
    return;
  }

  if (ridge === 'z') {
    // Ridge along z → slopes across x (eaves on the west/east sides), climbing inward.
    for (let i = 0; x0 + i <= x1 - i && y0 + i <= yMax; i++) {
      const y = y0 + i;
      const xl = x0 + i, xr = x1 - i;
      for (let z = z0; z <= z1; z++) {
        set(xl, y, z, stair('east'));
        if (xr !== xl) set(xr, y, z, stair('west'));
        plug(xl, y - 1, z);
        if (xr !== xl) plug(xr, y - 1, z);
      }
    }
  } else {
    // Ridge along x → slopes across z (eaves on the north/south sides), climbing inward.
    for (let i = 0; z0 + i <= z1 - i && y0 + i <= yMax; i++) {
      const y = y0 + i;
      const zl = z0 + i, zr = z1 - i;
      for (let x = x0; x <= x1; x++) {
        set(x, y, zl, stair('south'));
        if (zr !== zl) set(x, y, zr, stair('north'));
        plug(x, y - 1, zl);
        if (zr !== zl) plug(x, y - 1, zr);
      }
    }
  }
  // Close the gable-end triangles (the vertical wall under each slope at the two
  // ends) so you can't see into the attic. Only for a gabled (non-hip) roof, and
  // only when `fill` is given — the op can't know the wall material otherwise.
  if (op.fill !== undefined) {
    if (ridge === 'z') {
      for (const z of z0 === z1 ? [z0] : [z0, z1]) {
        for (let x = x0; x <= x1; x++) {
          const top = y0 + Math.min(x - x0, x1 - x); // slope height at this column
          for (let y = y0; y < top; y++) set(x, y, z, op.fill);
        }
      }
    } else {
      for (const x of x0 === x1 ? [x0] : [x0, x1]) {
        for (let z = z0; z <= z1; z++) {
          const top = y0 + Math.min(z - z0, z1 - z);
          for (let y = y0; y < top; y++) set(x, y, z, op.fill);
        }
      }
    }
  }

  // Cap the ridge line with a top slab (or leave stairs meeting) for a clean seam.
  if (slabName) {
    if (ridge === 'z') {
      const i = Math.floor((x1 - x0) / 2);
      if ((x1 - x0) % 2 === 0) {
        const st = slabTop() as number;
        for (let z = z0; z <= z1; z++) set(x0 + i, y0 + i, z, st);
      }
    } else {
      const i = Math.floor((z1 - z0) / 2);
      if ((z1 - z0) % 2 === 0) {
        const st = slabTop() as number;
        for (let x = x0; x <= x1; x++) set(x, y0 + i, z0 + i, st);
      }
    }
  }
}
