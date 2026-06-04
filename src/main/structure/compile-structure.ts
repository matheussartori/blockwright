// Compiles the Blockwright "authoring JSON" (what the AI emits — see
// knowledge/nbt/01-nbt-format.md) into a real gzip-compressed Minecraft `.nbt`
// structure file. This is the JSON→NBT step the knowledge base describes as
// "not built yet": it owns the NBT tag *types* JSON can't express (Int vs Double
// vs Byte vs String, typed lists) and the gzip envelope.
import fs from 'node:fs/promises';
import zlib from 'node:zlib';
import * as nbt from 'prismarine-nbt';
import { expandTemplate, isTemplateName, TEMPLATE_NAMES } from './templates';

/** The loose JSON the agent emits. Mirrors the structure tag tree, but untyped
 *  (the compiler applies the NBT type rules) with the air-omission convenience. */
export interface AuthoringStructure {
  DataVersion?: number;
  size?: [number, number, number];
  palette?: AuthoringPaletteEntry[];
  /** Volumetric build ops, expanded to blocks before compile. Applied in order
   *  (later ops overwrite earlier cells), then any explicit `blocks` overlay on
   *  top. Lets the model describe big builds in ~ops instead of ~thousands of
   *  per-block entries — the dominant generation cost (see knowledge 00). */
  ops?: AuthoringOp[];
  blocks?: AuthoringBlock[];
  entities?: AuthoringEntity[];
}

/** A volumetric build op. `fill` = solid box; `hollow` = 6-face shell; `walls` =
 *  the 4 vertical sides only (no floor/ceiling); `line` = a 3D line between two
 *  cells; `block` = a single cell (the only op that may carry block-entity nbt).
 *  Write an air palette index to carve.
 *
 *  Transform ops operate on cells ALREADY placed by earlier ops (apply order
 *  matters) and rewrite orientation blockstates as they copy — so a symmetric
 *  build can be authored once and reflected/rotated/tiled with stairs, doors and
 *  logs pointing the right way (the #1 manual-symmetry bug). `mirror` reflects a
 *  region onto itself across its centre plane; `rotate` turns it about a pivot;
 *  `repeat` tiles it along an axis. `roof` synthesises a pitched stair roof. */
export type AuthoringOp =
  | { op: 'fill' | 'hollow' | 'walls'; from: [number, number, number]; to: [number, number, number]; state: number }
  | { op: 'line'; from: [number, number, number]; to: [number, number, number]; state: number }
  | { op: 'block'; pos: [number, number, number]; state: number; nbt?: Record<string, unknown> }
  | { op: 'mirror'; from: [number, number, number]; to: [number, number, number]; axis: 'x' | 'z' }
  | { op: 'rotate'; from: [number, number, number]; to: [number, number, number]; turns: number; pivot?: [number, number] }
  | { op: 'repeat'; from: [number, number, number]; to: [number, number, number]; axis: 'x' | 'y' | 'z'; step: number; count: number }
  | { op: 'roof'; from: [number, number, number]; to: [number, number, number]; state: number; style?: 'gable' | 'hip'; ridge?: 'x' | 'z'; fill?: number }
  | { op: 'stairs'; from: [number, number, number]; to: [number, number, number]; state: number; fill?: number; clear?: number }
  | { op: 'template'; name: string; from: [number, number, number]; to: [number, number, number]; params?: Record<string, unknown> };

interface AuthoringPaletteEntry {
  Name: string;
  Properties?: Record<string, unknown>;
}
interface AuthoringBlock {
  state: number;
  pos: [number, number, number];
  /** Block-entity NBT (chests, signs, …). Encoded best-effort; the preview
   *  ignores it (it renders from block name + properties), so type fidelity here
   *  matters only if the file is later opened in Minecraft. */
  nbt?: Record<string, unknown>;
}
interface AuthoringEntity {
  pos: [number, number, number];
  blockPos: [number, number, number];
  nbt?: Record<string, unknown>;
}

// Raw prismarine-nbt tag nodes ({ type, value }). Built directly instead of via
// the builder helpers so the typed-list shapes stay explicit.
type Tag = { type: string; value: unknown };

const int = (v: number): Tag => ({ type: 'int', value: Math.trunc(v) });
const str = (v: string): Tag => ({ type: 'string', value: v });
const intList = (v: number[]): Tag => ({ type: 'list', value: { type: 'int', value: v.map(Math.trunc) } });
const doubleList = (v: number[]): Tag => ({ type: 'list', value: { type: 'double', value: v } });
const compound = (value: Record<string, Tag>): Tag => ({ type: 'compound', value });

/** List of compounds (the shape `palette`/`blocks`/`entities` use). An empty
 *  list is written with element type `end`, matching vanilla. */
function compoundList(items: Record<string, Tag>[]): Tag {
  return {
    type: 'list',
    value: items.length
      ? { type: 'compound', value: items.map((v) => v) }
      : { type: 'end', value: [] },
  };
}

/** Best-effort JSON value → NBT tag for free-form block-entity / entity `nbt`.
 *  Numbers become Int when integral else Double; booleans Byte; arrays typed
 *  lists; objects compounds. */
function inferTag(value: unknown): Tag | null {
  if (value === null || value === undefined) return null;
  if (typeof value === 'boolean') return { type: 'byte', value: value ? 1 : 0 };
  if (typeof value === 'number') {
    return Number.isInteger(value) ? int(value) : { type: 'double', value };
  }
  if (typeof value === 'string') return str(value);
  if (Array.isArray(value)) {
    const tags = value.map(inferTag).filter((t): t is Tag => t !== null);
    if (tags.length === 0) return { type: 'list', value: { type: 'end', value: [] } };
    const elemType = tags[0].type;
    return { type: 'list', value: { type: elemType, value: tags.map((t) => t.value) } };
  }
  if (typeof value === 'object') return inferCompound(value as Record<string, unknown>);
  return null;
}

function inferCompound(obj: Record<string, unknown>): Tag {
  const value: Record<string, Tag> = {};
  for (const [k, v] of Object.entries(obj)) {
    const tag = inferTag(v);
    if (tag) value[k] = tag;
  }
  return compound(value);
}

function paletteEntry(entry: AuthoringPaletteEntry): Record<string, Tag> {
  const out: Record<string, Tag> = { Name: str(entry.Name) };
  if (entry.Properties && Object.keys(entry.Properties).length > 0) {
    const props: Record<string, Tag> = {};
    // Blockstate property values are *always* strings in NBT, even "true"/"8".
    for (const [k, v] of Object.entries(entry.Properties)) props[k] = str(String(v));
    out.Properties = compound(props);
  }
  return out;
}

function blockEntry(block: AuthoringBlock): Record<string, Tag> {
  const out: Record<string, Tag> = {
    state: int(block.state),
    pos: intList(block.pos),
  };
  if (block.nbt && Object.keys(block.nbt).length > 0) out.nbt = inferCompound(block.nbt);
  return out;
}

function entityEntry(entity: AuthoringEntity): Record<string, Tag> {
  const out: Record<string, Tag> = {
    pos: doubleList(entity.pos),
    blockPos: intList(entity.blockPos),
  };
  if (entity.nbt && Object.keys(entity.nbt).length > 0) out.nbt = inferCompound(entity.nbt);
  return out;
}

/** Air block names that are placeholders, not geometry — omitted from output so
 *  ops can write them to carve holes (and stray air in `blocks` is harmless). */
function isAir(name: string): boolean {
  const id = name.includes(':') ? name.slice(name.indexOf(':') + 1) : name;
  return id === 'air' || id === 'cave_air' || id === 'void_air';
}

const posKey = (x: number, y: number, z: number): string => `${x},${y},${z}`;

/** Integer 3D line (DDA over the dominant axis) between two inclusive endpoints. */
function lineCells(a: [number, number, number], b: [number, number, number]): [number, number, number][] {
  let [x, y, z] = a;
  const [x1, y1, z1] = b;
  const dx = Math.abs(x1 - x), dy = Math.abs(y1 - y), dz = Math.abs(z1 - z);
  const sx = x < x1 ? 1 : -1, sy = y < y1 ? 1 : -1, sz = z < z1 ? 1 : -1;
  const cells: [number, number, number][] = [];
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

// ── Orientation blockstate transforms (mirror / rotate ops) ──────────────────
// Copying a region symmetrically must rewrite directional blockstates, or stairs/
// doors/logs point the wrong way after the copy. These rewrite one property; the
// transform ops apply them per copied cell and intern a palette entry for the
// result. Convention matches shared/jigsaw.ts: CW = clockwise viewed from above.

const FACING_CW = { north: 'east', east: 'south', south: 'west', west: 'north' } as const;
type Horiz = keyof typeof FACING_CW;
const isHoriz = (v: unknown): v is Horiz => v === 'north' || v === 'south' || v === 'east' || v === 'west';
const SHAPE_MIRROR: Record<string, string> = {
  inner_left: 'inner_right', inner_right: 'inner_left',
  outer_left: 'outer_right', outer_right: 'outer_left',
};

type PropXform = { kind: 'mirror'; axis: 'x' | 'z' } | { kind: 'rotate'; turns: number };

function rotFacing(f: Horiz, q: number): Horiz {
  let out: Horiz = f;
  const n = (((q % 4) + 4) % 4);
  for (let i = 0; i < n; i++) out = FACING_CW[out];
  return out;
}
function mirrorFacing(f: Horiz, axis: 'x' | 'z'): Horiz {
  if (axis === 'x') return f === 'east' ? 'west' : f === 'west' ? 'east' : f;
  return f === 'north' ? 'south' : f === 'south' ? 'north' : f;
}

/** Rewrite a block's orientation properties under a mirror/rotate, so the copied
 *  geometry stays physically consistent (facing/axis/shape/hinge/rotation). */
function transformProps(
  props: Record<string, unknown> | undefined,
  t: PropXform,
): Record<string, unknown> | undefined {
  if (!props) return props;
  const out: Record<string, unknown> = { ...props };
  if (isHoriz(out.facing)) {
    out.facing = t.kind === 'rotate' ? rotFacing(out.facing, t.turns) : mirrorFacing(out.facing, t.axis);
  }
  if ((out.axis === 'x' || out.axis === 'z') && t.kind === 'rotate' && (((t.turns % 2) + 2) % 2) === 1) {
    out.axis = out.axis === 'x' ? 'z' : 'x';
  }
  if (typeof out.shape === 'string' && t.kind === 'mirror' && SHAPE_MIRROR[out.shape]) {
    out.shape = SHAPE_MIRROR[out.shape];
  }
  if ((out.hinge === 'left' || out.hinge === 'right') && t.kind === 'mirror') {
    out.hinge = out.hinge === 'left' ? 'right' : 'left';
  }
  if (out.rotation !== undefined) {
    const r = Number(out.rotation);
    if (Number.isFinite(r)) {
      const nr = t.kind === 'rotate' ? (((r + 4 * t.turns) % 16) + 16) % 16 : (((16 - r) % 16) + 16) % 16;
      out.rotation = String(nr);
    }
  }
  return out;
}

const inBounds = (p: [number, number, number], s: [number, number, number]): boolean =>
  p[0] >= 0 && p[0] < s[0] && p[1] >= 0 && p[1] < s[1] && p[2] >= 0 && p[2] < s[2];

/** Snapshot the non-air cells currently inside an inclusive box (source for the
 *  transform ops, taken before we start writing copies). */
function cellsInBox(
  cells: Map<string, AuthoringBlock>,
  a: [number, number, number],
  b: [number, number, number],
): AuthoringBlock[] {
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
function rotXZ(x: number, z: number, px: number, pz: number): [number, number] {
  return [px - (z - pz), pz + (x - px)];
}

interface OpCtx {
  cells: Map<string, AuthoringBlock>;
  palette: AuthoringPaletteEntry[];
  intern: (entry: AuthoringPaletteEntry) => number;
  size: [number, number, number];
}

/** Lay a pitched stair roof over the eave rectangle. `state` must be a `*_stairs`
 *  block; the op derives the per-side facings (and corner shapes for hip), and an
 *  optional `fill` plugs the gap under each step so the roof reads solid. */
function applyRoof(op: Extract<AuthoringOp, { op: 'roof' }>, ctx: OpCtx): void {
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

/** Build a real, climbable staircase from `from` (the BOTTOM step) up to `to`
 *  (the TOP step). The run is axis-aligned: it travels along whichever horizontal
 *  axis differs between `from`/`to`, gaining one block of height per cell, so a
 *  flight that rises N blocks is N+1 steps long. `state` must be a `*_stairs`
 *  block; every step is placed `half:bottom` with `facing` set to the ASCENT
 *  direction (so the player walks up it — never an inverted/blocking step, and
 *  never a missing top step, the two failure modes of hand-placed stairs). Width
 *  comes from the perpendicular extent of the box (give `from`/`to` a spread on
 *  the other horizontal axis for a wider flight). Optional `fill` puts a solid
 *  support block under each tread (a stringer, so the run never floats); optional
 *  `clear` (an air index) carves 2 blocks of headroom above every tread, cutting
 *  the stairwell hole through any floor/ceiling above so the climb isn't blocked. */
function applyStairs(op: Extract<AuthoringOp, { op: 'stairs' }>, ctx: OpCtx): void {
  const { cells, palette, intern, size } = ctx;
  const [ax, ay, az] = op.from;
  const [bx, by, bz] = op.to;
  const dx = bx - ax, dz = bz - az, dy = by - ay;
  const runX = Math.abs(dx) >= Math.abs(dz); // run along x, else along z
  const runLen = runX ? Math.abs(dx) : Math.abs(dz);
  const steps = runLen + 1; // inclusive of both ends
  const runSign = (runX ? Math.sign(dx) : Math.sign(dz)) || 1;
  const ySign = Math.sign(dy) || 1;
  // facing = the horizontal direction the flight ascends toward.
  const facing: Horiz = runX ? (runSign >= 0 ? 'east' : 'west') : (runSign >= 0 ? 'south' : 'north');
  // Perpendicular (width) extent — the flight is this many cells wide.
  const wMin = runX ? Math.min(az, bz) : Math.min(ax, bx);
  const wMax = runX ? Math.max(az, bz) : Math.max(ax, bx);
  const runStart = runX ? ax : az;
  const baseName = palette[op.state]?.Name ?? 'minecraft:oak_stairs';
  const stairIdx = intern({ Name: baseName, Properties: { facing, half: 'bottom', shape: 'straight', waterlogged: 'false' } });
  const set = (x: number, y: number, z: number, st: number): void => {
    if (inBounds([x, y, z], size)) cells.set(posKey(x, y, z), { state: st, pos: [x, y, z] });
  };
  for (let i = 0; i < steps; i++) {
    const along = runStart + runSign * i;
    const y = ay + ySign * i;
    for (let w = wMin; w <= wMax; w++) {
      const x = runX ? along : w;
      const z = runX ? w : along;
      set(x, y, z, stairIdx);
      if (op.fill !== undefined) set(x, y - 1, z, op.fill); // solid tread support (stringer)
      if (op.clear !== undefined) { set(x, y + 1, z, op.clear); set(x, y + 2, z, op.clear); } // headroom + stairwell hole
    }
  }
}

/** Apply one op into the cell map (keyed position → block). Transform/roof ops
 *  read cells placed by earlier ops and may intern new palette entries. */
function applyOp(op: AuthoringOp, ctx: OpCtx): void {
  const { cells, palette, intern, size } = ctx;
  if (op.op === 'template') {
    // Expand the template into ordinary ops (interning palette entries by block
    // name) and apply them in order, exactly as if the model had authored them.
    const internByName = (name: string, props?: Record<string, string>): number =>
      intern({ Name: name, Properties: props });
    for (const inner of expandTemplate(op.name, op.from, op.to, op.params ?? {}, internByName)) {
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
 *  …), so this returns the possibly-extended palette alongside the blocks.
 *  `validateAuthoring` must pass first (it bounds-checks the inputs). */
export function resolveBlocks(s: AuthoringStructure): { blocks: AuthoringBlock[]; palette: AuthoringPaletteEntry[] } {
  const palette = (s.palette ?? []).slice();
  const index = new Map<string, number>();
  palette.forEach((p, i) => index.set(paletteKey(p), i));
  const intern = (entry: AuthoringPaletteEntry): number => {
    const key = paletteKey(entry);
    const hit = index.get(key);
    if (hit !== undefined) return hit;
    const i = palette.push(entry) - 1;
    index.set(key, i);
    return i;
  };
  const size = (s.size ?? [0, 0, 0]) as [number, number, number];
  const cells = new Map<string, AuthoringBlock>();
  const ctx: OpCtx = { cells, palette, intern, size };
  for (const op of s.ops ?? []) applyOp(op, ctx);
  for (const b of s.blocks ?? []) cells.set(posKey(...b.pos), b);
  const out: AuthoringBlock[] = [];
  for (const b of cells.values()) {
    if (!isAir(palette[b.state]?.Name ?? '')) out.push(b);
  }
  return { blocks: out, palette };
}

// ── Stairwell headroom ────────────────────────────────────────────────────
// A real staircase needs an open shaft above it: 2 blocks of headroom over every
// tread, and a hole through whatever floor/ceiling sits at the top. The `stairs`
// op carves that automatically (its `clear` arg), but models routinely *hand*-
// place a flight of `*_stairs` and then cap it with a solid floor resting on the
// top tread — so the stairs "lead nowhere", with no room to climb. This pass
// repairs that for any flight regardless of how it was authored: it finds treads
// that belong to an actual climbing run (a same-facing stair one step up or down
// along the ascent diagonal) and removes whatever solid block occupies the 2
// cells of headroom directly above each tread. It only fires on real flights and
// never deletes another stair, so decorative single stairs (chairs, desks) and
// open roof slopes are left untouched.

const STAIR_DIR: Record<string, [number, number]> = {
  north: [0, -1], south: [0, 1], west: [-1, 0], east: [1, 0],
};

function carveStairwells(
  blocks: AuthoringBlock[],
  palette: AuthoringPaletteEntry[],
): AuthoringBlock[] {
  const isBottomStair = (state: number): boolean => {
    const p = palette[state];
    if (!p || !bareId(p.Name).endsWith('_stairs')) return false;
    const half = p.Properties?.half;
    return half === undefined || half === 'bottom';
  };
  const facingOf = (state: number): string | undefined => {
    const f = palette[state]?.Properties?.facing;
    return typeof f === 'string' ? f : undefined;
  };
  const at = new Map<string, AuthoringBlock>();
  for (const b of blocks) at.set(posKey(...b.pos), b);
  const stairAt = (x: number, y: number, z: number, facing: string): boolean => {
    const b = at.get(posKey(x, y, z));
    return !!b && isBottomStair(b.state) && facingOf(b.state) === facing;
  };
  const remove = new Set<string>();
  for (const b of blocks) {
    if (!isBottomStair(b.state)) continue;
    const facing = facingOf(b.state);
    const dir = facing ? STAIR_DIR[facing] : undefined;
    if (!dir) continue;
    const [fx, fz] = dir;
    const [x, y, z] = b.pos;
    // Part of a climbing flight if a same-facing tread sits one step up the
    // ascent diagonal (toward `facing`) or one step down behind it.
    const inFlight = stairAt(x + fx, y + 1, z + fz, facing) || stairAt(x - fx, y - 1, z - fz, facing);
    if (!inFlight) continue;
    for (const dy of [1, 2]) {
      const key = posKey(x, y + dy, z);
      const above = at.get(key);
      if (above && !isBottomStair(above.state)) remove.add(key); // clear the headroom; keep stairs
    }
  }
  if (remove.size === 0) return blocks;
  return blocks.filter((b) => !remove.has(posKey(...b.pos)));
}

// ── Neighbour-aware connections ───────────────────────────────────────────
// Glass panes, iron bars, fences and walls are *connecting* blocks: their visual
// shape comes from the north/south/east/west (and, for walls, up) blockstate
// properties, which vanilla computes from neighbours at placement time. A real
// structure-block save bakes those booleans into the palette; the authoring JSON
// the AI emits does not, so an isolated pane keeps all-false and renders as the
// bare `_post` column (the "laser beam"). This pass reproduces vanilla's
// placement logic: it derives each connecting block's sides from its neighbours
// and splits palette entries per distinct combination.

type ConnFamily = 'pane' | 'fence_wood' | 'fence_nether' | 'wall';

const DIRS: { dx: number; dz: number; key: 'north' | 'south' | 'east' | 'west' }[] = [
  { dx: 0, dz: -1, key: 'north' },
  { dx: 0, dz: 1, key: 'south' },
  { dx: 1, dz: 0, key: 'east' },
  { dx: -1, dz: 0, key: 'west' },
];

function bareId(name: string): string {
  return name.includes(':') ? name.slice(name.indexOf(':') + 1) : name;
}

/** Which connecting family a block belongs to, or null if it doesn't connect. */
function connFamily(name: string): ConnFamily | null {
  const id = bareId(name);
  if (id === 'glass_pane' || id.endsWith('_glass_pane') || id === 'iron_bars' || id.endsWith('_bars')) return 'pane';
  if (id === 'nether_brick_fence') return 'fence_nether';
  if (id.endsWith('_fence')) return 'fence_wood'; // `_fence_gate` ends in `_gate`, excluded
  if (id.endsWith('_wall')) return 'wall'; // wall_sign/_banner/_torch end in other suffixes
  return null;
}

// Thin / non-full neighbours a connecting block does NOT attach to (beyond its
// own family, handled separately). A pragmatic denylist: anything not matched
// here counts as a full block the connection grabs onto. Not 100% vanilla-exact
// (e.g. directional stair faces), but right for the common cases.
const NON_SOLID_SUFFIX = [
  '_slab', '_stairs', '_door', '_trapdoor', '_button', '_pressure_plate', '_sign',
  '_banner', '_carpet', '_torch', '_sapling', '_rail', '_head', '_skull', '_bed',
  '_candle', '_fan', '_fence_gate', '_hanging_sign',
];
const NON_SOLID_IDS = new Set([
  'air', 'cave_air', 'void_air', 'water', 'lava', 'torch', 'redstone_wire', 'lever',
  'ladder', 'vine', 'scaffolding', 'chain', 'lantern', 'soul_lantern', 'tripwire',
  'tripwire_hook', 'flower_pot', 'snow', 'cobweb', 'end_rod', 'lightning_rod', 'conduit',
]);

/** Whether a neighbour presents a full face that a pane/fence/wall connects to. */
function isSolidNeighbour(name: string): boolean {
  const id = bareId(name);
  if (NON_SOLID_IDS.has(id)) return false;
  if (NON_SOLID_SUFFIX.some((s) => id.endsWith(s))) return false;
  return true;
}

/** Does a block of `family` connect to a neighbour named `neighbour`? Same-family
 *  members connect to each other (panes also grab iron bars — one family); any
 *  family also connects to a full solid block. */
function connectsTo(family: ConnFamily, neighbour: string): boolean {
  if (connFamily(neighbour) === family) return true;
  return isSolidNeighbour(neighbour);
}

/** Bake neighbour-derived connection properties into connecting blocks, splitting
 *  palette entries per distinct (name, properties) combination. Returns the
 *  possibly-extended palette and the blocks remapped onto it. */
export function connectBlocks(
  blocks: AuthoringBlock[],
  palette: AuthoringPaletteEntry[],
): { blocks: AuthoringBlock[]; palette: AuthoringPaletteEntry[] } {
  const families = palette.map((p) => connFamily(p.Name));
  if (!families.some(Boolean)) return { blocks, palette }; // nothing to connect

  // Name lookup by cell, to test neighbours.
  const nameAt = new Map<string, string>();
  for (const b of blocks) nameAt.set(posKey(...b.pos), palette[b.state]?.Name ?? '');

  // Find-or-append a palette entry for a (name, props) combo, deduped by key.
  const outPalette = palette.slice();
  const index = new Map<string, number>();
  outPalette.forEach((p, i) => index.set(paletteKey(p), i));
  const intern = (entry: AuthoringPaletteEntry): number => {
    const key = paletteKey(entry);
    const hit = index.get(key);
    if (hit !== undefined) return hit;
    const i = outPalette.push(entry) - 1;
    index.set(key, i);
    return i;
  };

  const outBlocks = blocks.map((b) => {
    const family = families[b.state];
    if (!family) return b;
    const base = palette[b.state];
    const [x, y, z] = b.pos;
    const sides: Record<string, boolean> = {};
    for (const { dx, dz, key } of DIRS) {
      const n = nameAt.get(posKey(x + dx, y, z + dz));
      sides[key] = n !== undefined && connectsTo(family, n);
    }
    const props = connectionProps(family, sides, base.Properties);
    const state = intern({ Name: base.Name, Properties: props });
    return { ...b, state };
  });

  return { blocks: outBlocks, palette: outPalette };
}

/** Stable key for palette dedupe: name + sorted props. */
function paletteKey(entry: AuthoringPaletteEntry): string {
  const props = entry.Properties ?? {};
  const parts = Object.keys(props).sort().map((k) => `${k}=${String(props[k])}`);
  return `${entry.Name}|${parts.join(',')}`;
}

/** Merge the original props with the computed connection properties. Panes/bars/
 *  fences use boolean sides; walls use up + none|low|tall per side. */
function connectionProps(
  family: ConnFamily,
  sides: Record<string, boolean>,
  base: Record<string, unknown> | undefined,
): Record<string, unknown> {
  const out: Record<string, unknown> = { ...(base ?? {}) };
  if (family === 'wall') {
    const { north: n, south: s, east: e, west: w } = sides;
    // Vanilla heights: tall against full blocks/walls — which is all we connect to.
    for (const k of ['north', 'south', 'east', 'west'] as const) out[k] = sides[k] ? 'tall' : 'none';
    // Post (up) shows unless the wall passes straight through (two opposite sides).
    const straight = (n && s && !e && !w) || (e && w && !n && !s);
    out.up = straight ? 'false' : 'true';
  } else {
    for (const k of ['north', 'south', 'east', 'west'] as const) out[k] = sides[k] ? 'true' : 'false';
  }
  return out;
}

/** Validate the authoring JSON against the hard rules, throwing a human-readable
 *  message on the first violation so the AI loop gets actionable feedback. */
export function validateAuthoring(s: AuthoringStructure): void {
  if (!s || typeof s !== 'object') throw new Error('structure is not an object');
  const size = s.size;
  if (!Array.isArray(size) || size.length !== 3 || size.some((n) => typeof n !== 'number' || n <= 0)) {
    throw new Error('size must be three positive integers [sx, sy, sz]');
  }
  const palette = s.palette ?? [];
  if (!Array.isArray(palette) || palette.length === 0) throw new Error('palette must be a non-empty array');
  palette.forEach((p, i) => {
    if (!p || typeof p.Name !== 'string') throw new Error(`palette[${i}] is missing a string Name`);
  });

  // A position triple within bounds.
  const checkPos = (pos: unknown, label: string): void => {
    if (!Array.isArray(pos) || pos.length !== 3) throw new Error(`${label} must be [x, y, z]`);
    pos.forEach((c, axis) => {
      if (typeof c !== 'number' || !Number.isInteger(c) || c < 0 || c >= size[axis]) {
        throw new Error(`${label}[${axis}] = ${c} is out of bounds (0..${size[axis] - 1})`);
      }
    });
  };
  const checkState = (state: unknown, label: string): void => {
    if (typeof state !== 'number' || state < 0 || state >= palette.length) {
      throw new Error(`${label} ${state} is out of palette range (0..${palette.length - 1})`);
    }
  };

  const ops = s.ops ?? [];
  if (!Array.isArray(ops)) throw new Error('ops must be an array');
  const OP_KINDS = ['fill', 'hollow', 'walls', 'line', 'block', 'mirror', 'rotate', 'repeat', 'roof', 'stairs', 'template'];
  ops.forEach((o, i) => {
    const op = o as AuthoringOp;
    if (!o || !OP_KINDS.includes(op.op)) {
      throw new Error(`ops[${i}].op must be one of ${OP_KINDS.join(', ')}`);
    }
    if (op.op === 'block') {
      checkState(op.state, `ops[${i}].state`);
      checkPos(op.pos, `ops[${i}].pos`);
      return;
    }
    if (op.op === 'template') {
      // Template ops carry a name + bounding box (no palette index — the template
      // interns its own entries on expand). The box must sit inside `size`.
      if (!isTemplateName(op.name)) {
        throw new Error(`ops[${i}].name "${op.name}" is not a known template (${TEMPLATE_NAMES.join(', ')})`);
      }
      checkPos(op.from, `ops[${i}].from`);
      checkPos(op.to, `ops[${i}].to`);
      if (op.params !== undefined && (typeof op.params !== 'object' || op.params === null || Array.isArray(op.params))) {
        throw new Error(`ops[${i}].params must be an object`);
      }
      return;
    }
    // All remaining ops take a from/to box.
    checkPos(op.from, `ops[${i}].from`);
    checkPos(op.to, `ops[${i}].to`);
    if (op.op === 'fill' || op.op === 'hollow' || op.op === 'walls' || op.op === 'line' || op.op === 'roof' || op.op === 'stairs') {
      checkState(op.state, `ops[${i}].state`);
    }
    if (op.op === 'roof' && op.fill !== undefined) checkState(op.fill, `ops[${i}].fill`);
    if (op.op === 'stairs') {
      if (op.fill !== undefined) checkState(op.fill, `ops[${i}].fill`);
      if (op.clear !== undefined) checkState(op.clear, `ops[${i}].clear`);
      if (op.from[1] === op.to[1]) throw new Error(`ops[${i}] stairs must change height (from.y !== to.y) — a flat row is not a staircase`);
    }
    if (op.op === 'mirror' && op.axis !== 'x' && op.axis !== 'z') {
      throw new Error(`ops[${i}].axis must be "x" or "z"`);
    }
    if (op.op === 'rotate') {
      if (!Number.isInteger(op.turns)) throw new Error(`ops[${i}].turns must be an integer (1, 2 or 3 quarter-turns)`);
      if (op.pivot !== undefined) {
        if (!Array.isArray(op.pivot) || op.pivot.length !== 2) throw new Error(`ops[${i}].pivot must be [x, z]`);
        if (op.pivot[0] < 0 || op.pivot[0] >= size[0] || op.pivot[1] < 0 || op.pivot[1] >= size[2]) {
          throw new Error(`ops[${i}].pivot is out of bounds`);
        }
      }
    }
    if (op.op === 'repeat') {
      if (op.axis !== 'x' && op.axis !== 'y' && op.axis !== 'z') throw new Error(`ops[${i}].axis must be "x", "y" or "z"`);
      if (!Number.isInteger(op.step) || op.step === 0) throw new Error(`ops[${i}].step must be a non-zero integer`);
      if (!Number.isInteger(op.count) || op.count < 1) throw new Error(`ops[${i}].count must be a positive integer`);
    }
  });

  const blocks = s.blocks ?? [];
  if (!Array.isArray(blocks)) throw new Error('blocks must be an array');
  blocks.forEach((b, i) => {
    checkState(b.state, `blocks[${i}].state`);
    checkPos(b.pos, `blocks[${i}].pos`);
  });

  if (ops.length === 0 && blocks.length === 0) {
    throw new Error('place at least one block via "ops" (preferred) or "blocks"');
  }
}

/** Clear a build's interior with explicit `minecraft:air` — but only inside its
 *  own footprint, so placement doesn't gouge the surrounding terrain.
 *
 *  On placement a Minecraft structure leaves OMITTED positions unchanged (the
 *  world's existing block stays), and writes whatever IS in the file. The old
 *  approach air-filled the WHOLE bounding box, which carves a rectangular hole in
 *  the terrain around any non-rectangular build (a cross/L footprint loses its
 *  concave corners; a manor deletes a 40×40 block of world). Instead we fill air
 *  only **per occupied (x,z) column, between that column's lowest and highest
 *  block** — so enclosed room interiors get cleared, but cells outside the build
 *  (empty columns, and the space above/below each column) stay OMITTED and the
 *  terrain is preserved, exactly like a vanilla worldgen piece. */
function fillBoxWithAir(
  blocks: AuthoringBlock[],
  palette: AuthoringPaletteEntry[],
): { blocks: AuthoringBlock[]; palette: AuthoringPaletteEntry[] } {
  let airIdx = palette.findIndex((p) => isAir(p.Name));
  let outPalette = palette;
  if (airIdx < 0) {
    airIdx = palette.length;
    outPalette = [...palette, { Name: 'minecraft:air' }];
  }
  // `blocks` here is already air-free (resolveBlocks drops air). Find each
  // column's vertical extent, then air-fill the gaps within it.
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
  const out = blocks.slice();
  for (const [col, y0] of colMin) {
    const y1 = colMax.get(col) as number;
    const [xs, zs] = col.split(',');
    const x = Number(xs), z = Number(zs);
    for (let y = y0 + 1; y < y1; y++) {
      if (!occupied.has(posKey(x, y, z))) out.push({ state: airIdx, pos: [x, y, z] });
    }
  }
  return { blocks: out, palette: outPalette };
}

/** Compile authoring JSON to a gzip-compressed `.nbt` buffer (Java big-endian). */
export function compileStructure(s: AuthoringStructure): Buffer {
  validateAuthoring(s);
  // Expand ops → blocks (transform/roof ops may extend the palette), then derive
  // connecting-block sides from neighbours (panes/bars/fences/walls), which may
  // append palette entries too.
  const resolved = resolveBlocks(s);
  // Open the shaft above any climbing staircase (hand-placed flights often get a
  // solid floor dropped on the top tread, leaving no room to climb).
  const carved = carveStairwells(resolved.blocks, resolved.palette);
  const connected = connectBlocks(carved, resolved.palette);
  // Then air-fill each column's interior so placing the structure clears its own
  // rooms without gouging the surrounding terrain (non-rectangular footprints).
  const { blocks, palette } = fillBoxWithAir(connected.blocks, connected.palette);
  const root = {
    type: 'compound' as const,
    name: '',
    value: {
      DataVersion: int(s.DataVersion ?? 3955),
      size: intList(s.size as [number, number, number]),
      palette: compoundList(palette.map(paletteEntry)),
      blocks: compoundList(blocks.map(blockEntry)),
      entities: compoundList((s.entities ?? []).map(entityEntry)),
    },
  };
  // prismarine-nbt's NBT type is stricter than our hand-built tree; the shape is
  // correct for the writer, so cast through unknown.
  const uncompressed = nbt.writeUncompressed(root as unknown as nbt.NBT, 'big');
  return zlib.gzipSync(uncompressed);
}

/** Compile and write the authoring JSON to `filePath` as a gzipped `.nbt`. */
export async function writeStructureFile(s: AuthoringStructure, filePath: string): Promise<void> {
  await fs.writeFile(filePath, compileStructure(s));
}

/** Read an existing `.nbt` back into authoring JSON — the inverse of compile, so
 *  the AI generator can be seeded with the file the user already has open and
 *  EDIT it rather than building from scratch. Air cells are dropped (the
 *  authoring format omits air by convention; compile re-materialises it), which
 *  also keeps the seed small. Blockstate property values are normalised to
 *  strings. The result is a flat `blocks` list (no `ops`) since the geometry is
 *  already baked. */
export async function readAuthoring(filePath: string): Promise<AuthoringStructure> {
  const buffer = await fs.readFile(filePath);
  const { parsed } = await nbt.parse(buffer);
  const root = nbt.simplify(parsed) as {
    DataVersion?: number;
    size?: number[];
    palette?: { Name: string; Properties?: Record<string, string | number> }[];
    blocks?: { state: number; pos: number[]; nbt?: Record<string, unknown> }[];
  };
  const palette: AuthoringPaletteEntry[] = (root.palette ?? []).map((p) => {
    const out: AuthoringPaletteEntry = { Name: p.Name };
    if (p.Properties && Object.keys(p.Properties).length > 0) {
      const props: Record<string, string> = {};
      for (const [k, v] of Object.entries(p.Properties)) props[k] = String(v);
      out.Properties = props;
    }
    return out;
  });
  const blocks: AuthoringBlock[] = (root.blocks ?? [])
    .filter((b) => Array.isArray(b.pos) && typeof b.state === 'number' && !isAir(palette[b.state]?.Name ?? ''))
    .map((b) => ({
      state: b.state,
      pos: b.pos as [number, number, number],
      ...(b.nbt && Object.keys(b.nbt).length > 0 ? { nbt: b.nbt } : {}),
    }));
  return {
    DataVersion: root.DataVersion ?? 3955,
    size: (root.size ?? [0, 0, 0]) as [number, number, number],
    palette,
    blocks,
  };
}
