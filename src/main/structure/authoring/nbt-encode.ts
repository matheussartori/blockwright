// Authoring JSON → real gzip-compressed Minecraft `.nbt`. This is the layer that
// owns the NBT tag *types* JSON can't express (Int vs Double vs Byte vs String,
// typed lists) and the gzip envelope.
import zlib from 'node:zlib';
import * as nbt from 'prismarine-nbt';
import type { AuthoringBlock, AuthoringEntity, AuthoringPaletteEntry } from './types';

// Raw prismarine-nbt tag nodes ({ type, value }). Built directly instead of via
// the builder helpers so the typed-list shapes stay explicit.
type Tag = { type: string; value: unknown };

const int = (v: number): Tag => ({ type: 'int', value: Math.trunc(v) });
const str = (v: string): Tag => ({ type: 'string', value: v });
const intList = (v: number[]): Tag => ({ type: 'list', value: { type: 'int', value: v.map(Math.trunc) } });
const doubleList = (v: number[]): Tag => ({ type: 'list', value: { type: 'double', value: v } });
const compound = (value: Record<string, Tag>): Tag => ({ type: 'compound', value });

/** List of compounds (the shape `palette`/`blocks`/`entities` use). An empty list
 *  is written with element type `end`, matching vanilla. */
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
    // NBT lists are homogeneous. A mixed int/double array promotes to all-double
    // (e.g. [1, 1.5]); any other mix keeps only the elements matching the first
    // element's type — never write values under a tag type they don't fit.
    const elemType = tags[0].type;
    if (tags.some((t) => t.type !== elemType)) {
      if (tags.every((t) => t.type === 'int' || t.type === 'double')) {
        return { type: 'list', value: { type: 'double', value: tags.map((t) => Number(t.value)) } };
      }
      const kept = tags.filter((t) => t.type === elemType);
      return { type: 'list', value: { type: elemType, value: kept.map((t) => t.value) } };
    }
    return { type: 'list', value: { type: elemType, value: tags.map((t) => t.value) } };
  }
  if (typeof value === 'object') return inferCompound(value as Record<string, unknown>);
  return null;
}

/** Best-effort plain-JSON → NBT compound, for free-form block-entity/entity data. Exported
 *  so the schematic codecs can serialise the block-entity fields they carry. */
export function inferCompound(obj: Record<string, unknown>): { type: string; value: Record<string, Tag> } {
  const value: Record<string, Tag> = {};
  for (const [k, v] of Object.entries(obj)) {
    const tag = inferTag(v);
    if (tag) value[k] = tag;
  }
  return { type: 'compound', value };
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

export interface EncodeInput {
  dataVersion: number;
  size: [number, number, number];
  palette: AuthoringPaletteEntry[];
  blocks: AuthoringBlock[];
  entities: AuthoringEntity[];
}

/** Encode the resolved structure pieces into a gzip-compressed `.nbt` buffer
 *  (Java big-endian). */
export function encodeStructure(input: EncodeInput): Buffer {
  const root = {
    type: 'compound' as const,
    name: '',
    value: {
      DataVersion: int(input.dataVersion),
      size: intList(input.size),
      palette: compoundList(input.palette.map(paletteEntry)),
      blocks: compoundList(input.blocks.map(blockEntry)),
      entities: compoundList(input.entities.map(entityEntry)),
    },
  };
  // prismarine-nbt's NBT type is stricter than our hand-built tree; the shape is
  // correct for the writer, so cast through unknown.
  const uncompressed = nbt.writeUncompressed(root as unknown as nbt.NBT, 'big');
  return zlib.gzipSync(uncompressed);
}
