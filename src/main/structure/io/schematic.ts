// Sponge Schematic (`.schem`) interop — WorldEdit's format. Gzipped NBT like vanilla
// `.nbt`, but blocks are a varint-packed palette-index stream instead of an explicit list.
// We decode it into the SAME raw {size, palette, blocks} shape `buildStructureData` takes,
// so a `.schem` renders/edits exactly like a native structure; and encode the reverse (v2,
// the most widely-read version) so a Blockwright build opens in WorldEdit/Litematica.
// Spec: https://github.com/SpongePowered/Schematic-Specification (v2 + v3).
import zlib from 'node:zlib';
import * as nbt from 'prismarine-nbt';
import type { RawBlock, RawPaletteEntry } from './load-structure';
import { inferCompound } from '../authoring/nbt-encode';

/** A block entity (chest contents, sign text, …) at a structure-local position. `nbt` is the
 *  data fields only — `id` (the block-entity type) and the position are kept separate. */
export interface RawBlockEntity {
  pos: [number, number, number];
  id: string;
  nbt: Record<string, unknown>;
}

export interface RawStructure {
  size: [number, number, number];
  palette: RawPaletteEntry[];
  blocks: RawBlock[];
  /** Block-entity data preserved through conversions (absent = none carried). */
  blockEntities?: RawBlockEntity[];
}

/** Drop the given keys from a plain object (the BE id/position live separately). */
export const omitKeys = (obj: Record<string, unknown>, keys: string[]): Record<string, unknown> =>
  Object.fromEntries(Object.entries(obj).filter(([k]) => !keys.includes(k)));

const AIR = 'minecraft:air';
const withNamespace = (name: string): string => (name.includes(':') ? name : `minecraft:${name}`);

/** Parse a block-state string (`minecraft:oak_stairs[facing=east,half=bottom]`) into the
 *  {Name, Properties} palette shape. Property order is not significant. */
export function parseBlockState(s: string): RawPaletteEntry {
  const open = s.indexOf('[');
  if (open < 0) return { Name: withNamespace(s) };
  const name = withNamespace(s.slice(0, open));
  const inner = s.slice(open + 1, s.endsWith(']') ? -1 : undefined);
  const Properties: Record<string, string> = {};
  for (const pair of inner.split(',')) {
    const eq = pair.indexOf('=');
    if (eq > 0) Properties[pair.slice(0, eq).trim()] = pair.slice(eq + 1).trim();
  }
  return Object.keys(Properties).length ? { Name: name, Properties } : { Name: name };
}

/** Build a block-state string from {Name, Properties} (keys sorted for clean round-trips). */
export function blockStateString(entry: RawPaletteEntry): string {
  const props = entry.Properties;
  if (!props || !Object.keys(props).length) return entry.Name;
  const inner = Object.keys(props)
    .sort()
    .map((k) => `${k}=${props[k]}`)
    .join(',');
  return `${entry.Name}[${inner}]`;
}

/** Append `value` (a palette index) as an unsigned LEB128 varint. */
function writeVarInt(out: number[], value: number): void {
  let v = value >>> 0;
  while ((v & ~0x7f) !== 0) {
    out.push((v & 0x7f) | 0x80);
    v >>>= 7;
  }
  out.push(v);
}

/** The `index = x + z*W + y*W*L` cell order both `.schem` and our grid use. */
const cellIndex = (x: number, y: number, z: number, w: number, l: number): number => x + z * w + y * w * l;

// ── Decode ────────────────────────────────────────────────────────────────────────

/** Decode a `.schem` buffer (v2 or v3) into raw {size, palette, blocks} (air dropped). */
export async function decodeSchem(buffer: Buffer): Promise<RawStructure> {
  const { parsed } = await nbt.parse(buffer);
  const root = nbt.simplify(parsed) as Record<string, unknown>;
  // v3 nests everything under `Schematic`; v2 has it at the root.
  const s = (root.Schematic ?? root) as Record<string, unknown>;
  const w = Number(s.Width ?? 0) & 0xffff;
  const h = Number(s.Height ?? 0) & 0xffff;
  const l = Number(s.Length ?? 0) & 0xffff;
  // v3 moves blocks under `Blocks` + renames BlockData → Data; v2 keeps them at the root.
  const blocksNode = (s.Blocks ?? s) as Record<string, unknown>;
  const paletteObj = (blocksNode.Palette ?? s.Palette ?? {}) as Record<string, number>;
  const data = (blocksNode.Data ?? blocksNode.BlockData ?? s.BlockData ?? []) as ArrayLike<number>;

  const palette: RawPaletteEntry[] = [];
  for (const [state, id] of Object.entries(paletteObj)) palette[id] = parseBlockState(state);
  for (let i = 0; i < palette.length; i++) if (!palette[i]) palette[i] = { Name: AIR };

  const total = w * h * l;
  const wl = w * l;
  const blocks: RawBlock[] = [];
  let i = 0;
  for (let cell = 0; cell < total && i < data.length; cell++) {
    // read one unsigned varint
    let id = 0;
    let bits = 0;
    for (;;) {
      const b = data[i++] & 0xff;
      id |= (b & 0x7f) << bits;
      bits += 7;
      if ((b & 0x80) === 0 || bits > 35) break;
    }
    id >>>= 0;
    const entry = palette[id];
    if (!entry || entry.Name === AIR) continue;
    const y = Math.floor(cell / wl);
    const rem = cell % wl;
    blocks.push({ state: id, pos: [rem % w, y, Math.floor(rem / w)] });
  }

  // Block entities: v2 `BlockEntities` at the root, v3 under `Blocks`. Each carries Id + Pos
  // (relative) + the data (flat in v2, under `Data` in v3).
  const beList = (blocksNode.BlockEntities ?? s.BlockEntities ?? []) as Record<string, unknown>[];
  const blockEntities: RawBlockEntity[] = [];
  for (const be of beList) {
    const pos = be.Pos as number[] | undefined;
    if (!pos || pos.length !== 3) continue;
    const data = (be.Data as Record<string, unknown>) ?? omitKeys(be, ['Id', 'Pos', 'Data']);
    blockEntities.push({ pos: [pos[0], pos[1], pos[2]], id: String(be.Id ?? ''), nbt: data });
  }

  return { size: [w, h, l], palette, blocks, blockEntities };
}

// ── Encode ────────────────────────────────────────────────────────────────────────

type Tag = { type: string; value: unknown };
const int = (v: number): Tag => ({ type: 'int', value: Math.trunc(v) });
const str = (v: string): Tag => ({ type: 'string', value: v });
const short = (v: number): Tag => ({ type: 'short', value: Math.trunc(v) });
const intArray = (v: number[]): Tag => ({ type: 'intArray', value: v.map(Math.trunc) });
const byteArray = (v: number[]): Tag => ({ type: 'byteArray', value: v });
const compound = (value: Record<string, Tag>): Tag => ({ type: 'compound', value });
const emptyList = (): Tag => ({ type: 'list', value: { type: 'end', value: [] } });
function compoundList(items: Record<string, Tag>[]): Tag {
  return { type: 'list', value: items.length ? { type: 'compound', value: items } : { type: 'end', value: [] } };
}

/** A Sponge v2 BlockEntity compound: `Id` + relative `Pos` + the data fields, flat. */
function blockEntityTag(be: RawBlockEntity): Record<string, Tag> {
  return { Id: str(be.id), Pos: intArray(be.pos), ...inferCompound(be.nbt).value };
}

/** The Minecraft 1.21.1 data version we stamp when encoding. */
const DEFAULT_DATA_VERSION = 3955;

/** Encode raw {size, palette, blocks} into a gzipped `.schem` (Sponge v2). Every cell is
 *  written (absent cells become air); block entities are not carried in this pass. */
export function encodeSchem(s: RawStructure, dataVersion = DEFAULT_DATA_VERSION): Buffer {
  const [w, h, l] = s.size;
  const total = Math.max(0, w * h * l);

  // Intern each used block-state into a fresh palette (air first, so it's id 0).
  const idByState = new Map<string, number>();
  const entries: RawPaletteEntry[] = [];
  const intern = (entry: RawPaletteEntry): number => {
    const key = blockStateString(entry);
    let id = idByState.get(key);
    if (id === undefined) {
      id = entries.length;
      idByState.set(key, id);
      entries.push(entry);
    }
    return id;
  };
  const airId = intern({ Name: AIR });

  const grid = new Array<number>(total).fill(airId);
  for (const b of s.blocks) {
    const [x, y, z] = b.pos;
    if (x < 0 || y < 0 || z < 0 || x >= w || y >= h || z >= l) continue;
    const entry = s.palette[b.state];
    if (entry) grid[cellIndex(x, y, z, w, l)] = intern(entry);
  }

  const varints: number[] = [];
  for (let i = 0; i < total; i++) writeVarInt(varints, grid[i]);
  // NBT byte array is signed two's-complement.
  const signed = varints.map((v) => (v > 127 ? v - 256 : v));

  const paletteTags: Record<string, Tag> = {};
  entries.forEach((e, id) => {
    paletteTags[blockStateString(e)] = int(id);
  });

  const root = {
    type: 'compound' as const,
    name: '',
    value: {
      Version: int(2),
      DataVersion: int(dataVersion),
      Width: short(w),
      Height: short(h),
      Length: short(l),
      Offset: intArray([0, 0, 0]),
      PaletteMax: int(entries.length),
      Palette: compound(paletteTags),
      BlockData: byteArray(signed),
      BlockEntities: compoundList((s.blockEntities ?? []).map(blockEntityTag)),
      Entities: emptyList(),
    },
  };
  return zlib.gzipSync(nbt.writeUncompressed(root as unknown as nbt.NBT, 'big'));
}
