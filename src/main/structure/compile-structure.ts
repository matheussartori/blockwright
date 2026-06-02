// Compiles the Blockwright "authoring JSON" (what the AI emits — see
// knowledge/nbt/01-nbt-format.md) into a real gzip-compressed Minecraft `.nbt`
// structure file. This is the JSON→NBT step the knowledge base describes as
// "not built yet": it owns the NBT tag *types* JSON can't express (Int vs Double
// vs Byte vs String, typed lists) and the gzip envelope.
import fs from 'node:fs/promises';
import zlib from 'node:zlib';
import * as nbt from 'prismarine-nbt';

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
 *  Write an air palette index to carve. */
export type AuthoringOp =
  | { op: 'fill' | 'hollow' | 'walls'; from: [number, number, number]; to: [number, number, number]; state: number }
  | { op: 'line'; from: [number, number, number]; to: [number, number, number]; state: number }
  | { op: 'block'; pos: [number, number, number]; state: number; nbt?: Record<string, unknown> };

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

/** Apply one op into the cell map (keyed position → block). */
function applyOp(op: AuthoringOp, cells: Map<string, AuthoringBlock>): void {
  if (op.op === 'block') {
    cells.set(posKey(...op.pos), { state: op.state, pos: op.pos, ...(op.nbt ? { nbt: op.nbt } : {}) });
    return;
  }
  if (op.op === 'line') {
    for (const pos of lineCells(op.from, op.to)) cells.set(posKey(...pos), { state: op.state, pos });
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
 *  This is the final block list compiled to NBT; `validateAuthoring` must pass
 *  first (it bounds-checks the inputs). */
export function resolveBlocks(s: AuthoringStructure): AuthoringBlock[] {
  const palette = s.palette ?? [];
  const cells = new Map<string, AuthoringBlock>();
  for (const op of s.ops ?? []) applyOp(op, cells);
  for (const b of s.blocks ?? []) cells.set(posKey(...b.pos), b);
  const out: AuthoringBlock[] = [];
  for (const b of cells.values()) {
    if (!isAir(palette[b.state]?.Name ?? '')) out.push(b);
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
  const OP_KINDS = ['fill', 'hollow', 'walls', 'line', 'block'];
  ops.forEach((o, i) => {
    if (!o || !OP_KINDS.includes((o as AuthoringOp).op)) {
      throw new Error(`ops[${i}].op must be one of ${OP_KINDS.join(', ')}`);
    }
    checkState((o as { state: unknown }).state, `ops[${i}].state`);
    if (o.op === 'block') checkPos(o.pos, `ops[${i}].pos`);
    else { checkPos(o.from, `ops[${i}].from`); checkPos(o.to, `ops[${i}].to`); }
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

/** Compile authoring JSON to a gzip-compressed `.nbt` buffer (Java big-endian). */
export function compileStructure(s: AuthoringStructure): Buffer {
  validateAuthoring(s);
  const root = {
    type: 'compound' as const,
    name: '',
    value: {
      DataVersion: int(s.DataVersion ?? 3955),
      size: intList(s.size as [number, number, number]),
      palette: compoundList((s.palette ?? []).map(paletteEntry)),
      blocks: compoundList(resolveBlocks(s).map(blockEntry)),
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
