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
  blocks?: AuthoringBlock[];
  entities?: AuthoringEntity[];
}

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
  const blocks = s.blocks ?? [];
  if (!Array.isArray(blocks) || blocks.length === 0) throw new Error('blocks must be a non-empty array');
  blocks.forEach((b, i) => {
    if (typeof b.state !== 'number' || b.state < 0 || b.state >= palette.length) {
      throw new Error(`blocks[${i}].state ${b.state} is out of palette range (0..${palette.length - 1})`);
    }
    if (!Array.isArray(b.pos) || b.pos.length !== 3) throw new Error(`blocks[${i}].pos must be [x, y, z]`);
    b.pos.forEach((c, axis) => {
      if (typeof c !== 'number' || c < 0 || c >= size[axis]) {
        throw new Error(`blocks[${i}].pos[${axis}] = ${c} is out of bounds (0..${size[axis] - 1})`);
      }
    });
  });
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
      blocks: compoundList((s.blocks ?? []).map(blockEntry)),
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
