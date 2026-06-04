import { inBounds, posKey } from '../geometry';
import type { Horiz } from '../orientation';
import type { AuthoringOp } from '../types';
import type { OpCtx } from './context';

/** Lay a pitched stair roof over the eave rectangle. `state` must be a `*_stairs`
 *  block; the op derives the per-side facings (and corner shapes for hip), and an
 *  optional `fill` plugs the gap under each step so the roof reads solid. */
export function applyRoof(op: Extract<AuthoringOp, { op: 'roof' }>, ctx: OpCtx): void {
  const { cells, palette, intern, size } = ctx;
  const x0 = Math.min(op.from[0], op.to[0]), x1 = Math.max(op.from[0], op.to[0]);
  const z0 = Math.min(op.from[2], op.to[2]), z1 = Math.max(op.from[2], op.to[2]);
  const y0 = Math.min(op.from[1], op.to[1]);
  const baseName = palette[op.state]?.Name ?? 'minecraft:oak_stairs';
  const slabName = baseName.endsWith('_stairs') ? baseName.replace(/_stairs$/, '_slab') : null;
  const ridge = op.ridge ?? (x1 - x0 >= z1 - z0 ? 'z' : 'x'); // ridge runs along the longer axis
  const hip = op.style === 'hip';

  const stair = (facing: Horiz, shape?: string): number =>
    intern({ Name: baseName, Properties: { facing, half: 'bottom', shape: shape ?? 'straight', waterlogged: 'false' } });
  const set = (x: number, y: number, z: number, st: number): void => {
    if (inBounds([x, y, z], size)) cells.set(posKey(x, y, z), { state: st, pos: [x, y, z] });
  };
  const plug = (x: number, y: number, z: number): void => {
    if (op.fill !== undefined) set(x, y, z, op.fill);
  };

  if (ridge === 'z' || hip) {
    // Slopes across x (eaves on the west/east long sides), climbing inward.
    for (let i = 0; x0 + i <= x1 - i; i++) {
      const y = y0 + i;
      const xl = x0 + i, xr = x1 - i;
      for (let z = z0; z <= z1; z++) {
        const endCap = hip && (z === z0 || z === z1);
        set(xl, y, z, stair(endCap ? (z === z0 ? 'north' : 'south') : 'east', endCap ? (z === z0 ? 'outer_left' : 'outer_right') : 'straight'));
        if (xr !== xl) set(xr, y, z, stair(endCap ? (z === z0 ? 'north' : 'south') : 'west', endCap ? (z === z0 ? 'outer_right' : 'outer_left') : 'straight'));
        plug(xl, y - 1, z);
        if (xr !== xl) plug(xr, y - 1, z);
      }
    }
  }
  if (ridge === 'x' || hip) {
    // Slopes across z (eaves on the north/south sides), climbing inward.
    for (let i = 0; z0 + i <= z1 - i; i++) {
      const y = y0 + i;
      const zl = z0 + i, zr = z1 - i;
      const xa = hip ? x0 + i + 1 : x0, xb = hip ? x1 - i - 1 : x1; // hip: leave corners to the x-slopes
      for (let x = xa; x <= xb; x++) {
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
  if (!hip && op.fill !== undefined) {
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
  if (slabName && !hip) {
    if (ridge === 'z') {
      const i = Math.floor((x1 - x0) / 2);
      if ((x1 - x0) % 2 === 0) {
        const st = intern({ Name: slabName, Properties: { type: 'top', waterlogged: 'false' } });
        for (let z = z0; z <= z1; z++) set(x0 + i, y0 + i, z, st);
      }
    } else {
      const i = Math.floor((z1 - z0) / 2);
      if ((z1 - z0) % 2 === 0) {
        const st = intern({ Name: slabName, Properties: { type: 'top', waterlogged: 'false' } });
        for (let x = x0; x <= x1; x++) set(x, y0 + i, z0 + i, st);
      }
    }
  }
}
