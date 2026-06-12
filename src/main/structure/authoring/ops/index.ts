// Op expansion: turn the volumetric `ops` (and any explicit `blocks` overlay) into
// a flat, air-free block list. Ops are applied in order (later ops overwrite
// earlier cells); transform/roof/stairs ops read cells placed by earlier ops and
// may intern new palette entries.
import { composeStructure } from '../../domain';
import { cellsInBox, inBounds, lineCells, posKey, rotXZ } from '../geometry';
import { isAir, makeIntern } from '../palette';
import { transformProps, type PropXform } from '../orientation';
import type { AuthoringBlock, AuthoringOp, AuthoringPaletteEntry, AuthoringStructure } from '../types';
import { applyRoof } from './roof';
import { applyStairs } from './stairs';
import type { OpCtx } from './context';

export type { OpCtx } from './context';

/** Apply one op into the cell map (keyed position → block). Transform/roof ops
 *  read cells placed by earlier ops and may intern new palette entries. */
export function applyOp(op: AuthoringOp, ctx: OpCtx): void {
  const { cells, palette, intern, size } = ctx;
  if (op.op === 'template') {
    // Expand the structure type into ordinary ops (interning palette entries by
    // block name) and apply them in order, exactly as if the model had authored them.
    const internByName = (name: string, props?: Record<string, string>): number =>
      intern({ Name: name, Properties: props });
    const warn = (message: string): void => { ctx.warnings?.push(message); };
    for (const inner of composeStructure(op.name, op.from, op.to, op.params ?? {}, internByName, warn)) {
      applyOp(inner, ctx);
    }
    return;
  }
  if (op.op === 'block') {
    cells.set(posKey(...op.pos), { state: op.state, pos: op.pos, ...(op.nbt ? { nbt: op.nbt } : {}) });
    return;
  }
  if (op.op === 'line') {
    for (const pos of lineCells(op.from, op.to)) cells.set(posKey(...pos), { state: op.state, pos });
    return;
  }
  if (op.op === 'mirror' || op.op === 'rotate') {
    const a = op.from, b = op.to;
    const xform: PropXform = op.op === 'mirror' ? { kind: 'mirror', axis: op.axis } : { kind: 'rotate', turns: op.turns };
    const px = op.op === 'rotate' ? (op.pivot?.[0] ?? Math.floor((Math.min(a[0], b[0]) + Math.max(a[0], b[0])) / 2)) : 0;
    const pz = op.op === 'rotate' ? (op.pivot?.[1] ?? Math.floor((Math.min(a[2], b[2]) + Math.max(a[2], b[2])) / 2)) : 0;
    const turns = op.op === 'rotate' ? (((op.turns % 4) + 4) % 4) : 0;
    for (const c of cellsInBox(cells, a, b)) {
      let x = c.pos[0], z = c.pos[2];
      const y = c.pos[1];
      if (op.op === 'mirror') {
        if (op.axis === 'x') x = Math.min(a[0], b[0]) + Math.max(a[0], b[0]) - x;
        else z = Math.min(a[2], b[2]) + Math.max(a[2], b[2]) - z;
      } else {
        for (let q = 0; q < turns; q++) [x, z] = rotXZ(x, z, px, pz);
      }
      const entry = palette[c.state];
      if (!entry) continue;
      const ns = intern({ Name: entry.Name, Properties: transformProps(entry.Properties, xform) });
      const np: [number, number, number] = [x, y, z];
      if (inBounds(np, size)) cells.set(posKey(...np), { state: ns, pos: np, ...(c.nbt ? { nbt: c.nbt } : {}) });
    }
    return;
  }
  if (op.op === 'repeat') {
    const ai = op.axis === 'x' ? 0 : op.axis === 'y' ? 1 : 2;
    const src = cellsInBox(cells, op.from, op.to);
    for (let k = 1; k < op.count; k++) {
      const d = op.step * k;
      for (const c of src) {
        const np: [number, number, number] = [...c.pos];
        np[ai] += d;
        if (inBounds(np, size)) cells.set(posKey(...np), { state: c.state, pos: np, ...(c.nbt ? { nbt: c.nbt } : {}) });
      }
    }
    return;
  }
  if (op.op === 'roof') {
    applyRoof(op, ctx);
    return;
  }
  if (op.op === 'stairs') {
    applyStairs(op, ctx);
    return;
  }
  const [ax, ay, az] = op.from, [bx, by, bz] = op.to;
  const x0 = Math.min(ax, bx), x1 = Math.max(ax, bx);
  const y0 = Math.min(ay, by), y1 = Math.max(ay, by);
  const z0 = Math.min(az, bz), z1 = Math.max(az, bz);
  for (let x = x0; x <= x1; x++) {
    for (let y = y0; y <= y1; y++) {
      for (let z = z0; z <= z1; z++) {
        const onShell = x === x0 || x === x1 || y === y0 || y === y1 || z === z0 || z === z1;
        const onWall = x === x0 || x === x1 || z === z0 || z === z1;
        if (op.op === 'hollow' && !onShell) continue;
        if (op.op === 'walls' && !onWall) continue;
        cells.set(posKey(x, y, z), { state: op.state, pos: [x, y, z] });
      }
    }
  }
}

/** Expand `ops` (in order) then overlay explicit `blocks`, dropping air cells.
 *  Transform/roof ops can intern new palette entries (rotated stairs, slab ridge,
 *  …), so this returns the possibly-extended palette alongside the blocks, plus any
 *  expansion `warnings` (e.g. a template that skipped its selected basement).
 *  `validateAuthoring` must pass first (it bounds-checks the inputs). */
export function resolveBlocks(
  s: AuthoringStructure,
): { blocks: AuthoringBlock[]; palette: AuthoringPaletteEntry[]; warnings: string[] } {
  const palette = (s.palette ?? []).slice();
  const intern = makeIntern(palette);
  const size = (s.size ?? [0, 0, 0]) as [number, number, number];
  const cells = new Map<string, AuthoringBlock>();
  const warnings: string[] = [];
  const ctx: OpCtx = { cells, palette, intern, size, warnings };
  for (const op of s.ops ?? []) applyOp(op, ctx);
  for (const b of s.blocks ?? []) cells.set(posKey(...b.pos), b);
  const out: AuthoringBlock[] = [];
  for (const b of cells.values()) {
    if (!isAir(palette[b.state]?.Name ?? '')) out.push(b);
  }
  return { blocks: out, palette, warnings };
}
