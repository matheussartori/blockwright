// Litematica (`.litematic`) interop. Gzipped NBT, but the hard part is the block storage:
// a MULTI-region schematic where each region's blocks are a **bit-packed long array** (the
// pre-1.16 SPANNING scheme — entries cross long boundaries, unlike vanilla 1.16+). We decode
// every region into the shared raw {size, palette, blocks} shape (so it renders/edits like a
// native structure) and encode a single-region `.litematic` back. 64-bit math needs BigInt;
// prismarine-nbt stores each long as a [high, low] signed-int32 pair.
// Spec: Litematica LitematicaBitArray / LitematicaBlockStateContainer / LitematicaSchematic.
import zlib from 'node:zlib';
import * as nbt from 'prismarine-nbt';
import { AIR, omitKeys, type RawBlock, type RawBlockEntity, type RawStructure } from './raw';
import { compound, compoundList, createPaletteInterner, emptyList, int, longArray, longFromMs, str, xyz, type Tag } from './nbt-tags';
import { inferCompound } from '../authoring/nbt-encode';
import { DEFAULT_DATA_VERSION } from '../mc-data-version';

const U64 = (1n << 64n) - 1n;

// ── bit-packed long array (the spanning scheme) ─────────────────────────────────────

/** Bits per palette index: `max(2, ceil(log2(paletteSize)))`, minimum 2. */
export function bitsForPalette(paletteSize: number): number {
  return Math.max(2, 32 - Math.clz32(Math.max(1, paletteSize - 1)));
}

/** Read entry `index` from the packed longs (entries may span two longs). */
function getAt(longs: bigint[], bits: number, index: number): number {
  const mask = (1n << BigInt(bits)) - 1n;
  const startOffset = index * bits;
  const startArr = Math.floor(startOffset / 64);
  const endArr = Math.floor(((index + 1) * bits - 1) / 64);
  const startBit = BigInt(startOffset % 64);
  const lo = longs[startArr] ?? 0n;
  if (startArr === endArr) return Number((lo >> startBit) & mask);
  const endOffset = BigInt(64 - (startOffset % 64));
  return Number((((lo >> startBit) | ((longs[endArr] ?? 0n) << endOffset)) & mask));
}

/** Write `value` at entry `index` into the packed longs. */
function setAt(longs: bigint[], bits: number, index: number, value: number): void {
  const mask = (1n << BigInt(bits)) - 1n;
  const v = BigInt(value) & mask;
  const startOffset = index * bits;
  const startArr = Math.floor(startOffset / 64);
  const endArr = Math.floor(((index + 1) * bits - 1) / 64);
  const startBit = BigInt(startOffset % 64);
  longs[startArr] = (((longs[startArr] ?? 0n) & (U64 ^ ((mask << startBit) & U64))) | ((v << startBit) & U64)) & U64;
  if (startArr !== endArr) {
    const endOffset = 64 - (startOffset % 64);
    const j1 = BigInt(bits - endOffset);
    longs[endArr] = ((((longs[endArr] ?? 0n) >> j1) << j1) | (v >> BigInt(endOffset))) & U64;
  }
}

/** Pack `ids` (count entries of `bits` each) into the long array. */
export function packBlockStates(ids: number[], bits: number): bigint[] {
  const longs = new Array<bigint>(Math.max(0, Math.ceil((ids.length * bits) / 64))).fill(0n);
  for (let i = 0; i < ids.length; i++) setAt(longs, bits, i, ids[i]);
  return longs;
}

/** Unpack `count` entries of `bits` each from the long array. */
export function unpackBlockStates(longs: bigint[], bits: number, count: number): number[] {
  const ids = new Array<number>(count);
  for (let i = 0; i < count; i++) ids[i] = getAt(longs, bits, i);
  return ids;
}

// prismarine-nbt long ↔ unsigned BigInt
const pairsToBig = (pairs: [number, number][]): bigint[] =>
  pairs.map(([hi, lo]) => ((BigInt(hi >>> 0) << 32n) | BigInt(lo >>> 0)) & U64);
const bigToPairs = (longs: bigint[]): [number, number][] =>
  longs.map((u) => [Number((u >> 32n) & 0xffffffffn) | 0, Number(u & 0xffffffffn) | 0]);

/** Litematica's cell order: `i = y*sizeX*sizeZ + z*sizeX + x` (Y outer, Z, X inner). */
const litIndex = (x: number, y: number, z: number, sx: number, sz: number): number => y * sx * sz + z * sx + x;

// ── Decode ──────────────────────────────────────────────────────────────────────────

interface RegionNBT {
  Position?: { x: number; y: number; z: number };
  Size?: { x: number; y: number; z: number };
  BlockStatePalette?: { Name: string; Properties?: Record<string, string> }[];
  BlockStates?: [number, number][];
  TileEntities?: Record<string, unknown>[];
}

/** Decode a `.litematic` buffer (all regions) into raw {size, palette, blocks} (air dropped). */
export async function decodeLitematic(buffer: Buffer): Promise<RawStructure> {
  const { parsed } = await nbt.parse(buffer);
  const root = nbt.simplify(parsed) as { Regions?: Record<string, RegionNBT> };
  const regions = Object.values(root.Regions ?? {});

  const { intern, entries: palette } = createPaletteInterner();

  const placed: { pos: [number, number, number]; state: number }[] = [];
  const tiles: { pos: [number, number, number]; id: string; nbt: Record<string, unknown> }[] = [];
  // Bounds come from the DECLARED region extents (so air margins survive — matching a `.nbt`'s
  // declared size), not from the non-air block bounding box.
  const lo: [number, number, number] = [Infinity, Infinity, Infinity];
  const hi: [number, number, number] = [-Infinity, -Infinity, -Infinity];

  for (const region of regions) {
    const pal = region.BlockStatePalette ?? [];
    if (!pal.length || !region.Size || !region.Position) continue;
    const P = region.Position;
    const S = region.Size;
    const ax = Math.abs(S.x);
    const ay = Math.abs(S.y);
    const az = Math.abs(S.z);
    const dir = [Math.sign(S.x) || 1, Math.sign(S.y) || 1, Math.sign(S.z) || 1];
    // The region's min/max corner in schematic space (S<0 means it was dragged negatively).
    const minC = [P.x + (S.x < 0 ? S.x + 1 : 0), P.y + (S.y < 0 ? S.y + 1 : 0), P.z + (S.z < 0 ? S.z + 1 : 0)];
    const maxC = [minC[0] + ax - 1, minC[1] + ay - 1, minC[2] + az - 1];
    for (let k = 0; k < 3; k++) {
      if (minC[k] < lo[k]) lo[k] = minC[k];
      if (maxC[k] > hi[k]) hi[k] = maxC[k];
    }
    const bits = bitsForPalette(pal.length);
    const longs = pairsToBig(region.BlockStates ?? []);
    const volume = ax * ay * az;
    const ids = unpackBlockStates(longs, bits, volume);
    const axz = ax * az;
    for (let i = 0; i < volume; i++) {
      const entry = pal[ids[i]];
      if (!entry || entry.Name === AIR) continue;
      const ly = Math.floor(i / axz);
      const rem = i % axz;
      const lz = Math.floor(rem / ax);
      const lx = rem % ax;
      placed.push({
        pos: [P.x + dir[0] * lx, P.y + dir[1] * ly, P.z + dir[2] * lz],
        state: intern({ Name: entry.Name, Properties: entry.Properties }),
      });
    }
    // Block entities: x/y/z are region-local; map to the same world frame as the blocks.
    for (const te of region.TileEntities ?? []) {
      const tx = Number(te.x);
      const ty = Number(te.y);
      const tz = Number(te.z);
      if (!Number.isFinite(tx) || !Number.isFinite(ty) || !Number.isFinite(tz)) continue;
      tiles.push({
        pos: [P.x + dir[0] * tx, P.y + dir[1] * ty, P.z + dir[2] * tz],
        id: String(te.id ?? te.Id ?? ''),
        nbt: omitKeys(te, ['x', 'y', 'z', 'id', 'Id']),
      });
    }
  }

  if (!Number.isFinite(lo[0])) return { size: [0, 0, 0], palette, blocks: [] };
  const shift = (p: [number, number, number]): [number, number, number] => [p[0] - lo[0], p[1] - lo[1], p[2] - lo[2]];
  const blocks: RawBlock[] = placed.map((p) => ({ state: p.state, pos: shift(p.pos) }));
  const blockEntities: RawBlockEntity[] = tiles.map((t) => ({ pos: shift(t.pos), id: t.id, nbt: t.nbt }));
  return { size: [hi[0] - lo[0] + 1, hi[1] - lo[1] + 1, hi[2] - lo[2] + 1], palette, blocks, blockEntities };
}

// ── Encode ──────────────────────────────────────────────────────────────────────────

/** Encode raw {size, palette, blocks, blockEntities} into a gzipped single-region `.litematic`.
 *  `now` is the create/modify timestamp (ms); block entities ARE carried (region TileEntities). */
export function encodeLitematic(s: RawStructure, now: number, dataVersion = DEFAULT_DATA_VERSION): Buffer {
  const [sx, sy, sz] = s.size;
  const volume = Math.max(0, sx * sy * sz);

  const { intern, entries } = createPaletteInterner(true);
  const airId = 0;

  const grid = new Array<number>(volume).fill(airId);
  let nonAir = 0;
  for (const b of s.blocks) {
    const [x, y, z] = b.pos;
    if (x < 0 || y < 0 || z < 0 || x >= sx || y >= sy || z >= sz) continue;
    const entry = s.palette[b.state];
    if (!entry) continue;
    grid[litIndex(x, y, z, sx, sz)] = intern(entry);
    nonAir++;
  }

  const bits = bitsForPalette(entries.length);
  const blockStates = bigToPairs(packBlockStates(grid, bits));

  const paletteList = entries.map((e) => {
    const tag: Record<string, Tag> = { Name: str(e.Name) };
    if (e.Properties && Object.keys(e.Properties).length) {
      const props: Record<string, Tag> = {};
      for (const [k, v] of Object.entries(e.Properties)) props[k] = str(String(v));
      tag.Properties = compound(props);
    }
    return tag;
  });

  const tileEntities = (s.blockEntities ?? []).map((be) => ({
    x: int(be.pos[0]),
    y: int(be.pos[1]),
    z: int(be.pos[2]),
    id: str(be.id),
    ...inferCompound(be.nbt).value,
  }));

  const region = compound({
    Position: xyz(0, 0, 0),
    Size: xyz(sx, sy, sz),
    BlockStatePalette: compoundList(paletteList),
    BlockStates: longArray(blockStates),
    TileEntities: compoundList(tileEntities),
    Entities: emptyList(),
    PendingBlockTicks: emptyList(),
    PendingFluidTicks: emptyList(),
  });

  const root = {
    type: 'compound' as const,
    name: '',
    value: {
      MinecraftDataVersion: int(dataVersion),
      Version: int(6),
      SubVersion: int(1),
      Metadata: compound({
        Name: str('Blockwright export'),
        Author: str('Blockwright'),
        Description: str(''),
        RegionCount: int(1),
        TotalVolume: int(volume),
        TotalBlocks: int(nonAir),
        TimeCreated: longFromMs(now),
        TimeModified: longFromMs(now),
        EnclosingSize: xyz(sx, sy, sz),
      }),
      Regions: compound({ main: region }),
    },
  };
  return zlib.gzipSync(nbt.writeUncompressed(root as unknown as nbt.NBT, 'big'));
}
