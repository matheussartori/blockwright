// Shared synthetic-world fixtures for the write-path suite: tag-typed chunk builders and an
// INDEPENDENT region-file writer (deliberately not `buildRegionBuffer` — a test fixture built by
// the code under test would prove nothing).
import zlib from 'node:zlib';
import { bigToPairs, bitsForBlockStates, packNonSpanning } from '../../../structure/io/long-bits';
import type { RawPaletteEntry } from '../../../structure/io/raw';
import {
  byteTag,
  compoundListTag,
  compoundTag,
  intTag,
  longArrayTag,
  stringTag,
  type Compound,
  type Tag,
} from '../nbt-tree';

export const SECTOR = 4096;

/** A section record: uniform when `cells` is omitted (whole section = palette[0]). */
export function sectionTag(
  y: number,
  palette: RawPaletteEntry[],
  cells?: number[],
  opts: { light?: boolean; biomes?: boolean } = {},
): Compound {
  const states: Compound = {
    palette: compoundListTag(
      palette.map((p) => {
        const entry: Compound = { Name: stringTag(p.Name) };
        if (p.Properties && Object.keys(p.Properties).length) {
          const props: Compound = {};
          for (const [k, v] of Object.entries(p.Properties)) props[k] = stringTag(String(v));
          entry.Properties = compoundTag(props);
        }
        return entry;
      }),
    ),
  };
  if (cells) {
    states.data = longArrayTag(bigToPairs(packNonSpanning(cells, bitsForBlockStates(palette.length))));
  }
  const record: Compound = { Y: byteTag(y), block_states: compoundTag(states) };
  if (opts.biomes !== false) {
    record.biomes = compoundTag({ palette: { type: 'list', value: { type: 'string', value: ['minecraft:plains'] } } });
  }
  if (opts.light !== false) {
    record.BlockLight = { type: 'byteArray', value: new Array(2048).fill(0) };
    record.SkyLight = { type: 'byteArray', value: new Array(2048).fill(15) };
  }
  return record;
}

export interface ChunkTagOpts {
  cx: number;
  cz: number;
  dataVersion?: number;
  status?: string;
  yPos?: number;
  sections?: Compound[];
  blockEntities?: Compound[];
  extra?: Compound;
}

/** A realistic-enough 1.18+ chunk root: sections + heightmaps + light flag + a mod tag. */
export function chunkTag(opts: ChunkTagOpts): Tag {
  const value: Compound = {
    DataVersion: intTag(opts.dataVersion ?? 3955),
    xPos: intTag(opts.cx),
    zPos: intTag(opts.cz),
    yPos: intTag(opts.yPos ?? 0),
    Status: stringTag(opts.status ?? 'minecraft:full'),
    isLightOn: byteTag(1),
    sections: compoundListTag(opts.sections ?? [sectionTag(0, [{ Name: 'minecraft:stone' }])]),
    block_entities: compoundListTag(opts.blockEntities ?? []),
    Heightmaps: compoundTag({
      MOTION_BLOCKING: longArrayTag(new Array<[number, number]>(37).fill([0, 0])),
    }),
    // A tag we don't own — must ride through any patch untouched.
    'themod:custom': compoundTag({ marker: stringTag('keep-me') }),
    ...opts.extra,
  };
  return { type: 'compound', value } as Tag;
}

export interface FixtureChunk {
  lx: number;
  lz: number;
  /** Uncompressed NBT bytes (deflated by the fixture writer), or raw stub for external. */
  nbt: Buffer;
  timestamp?: number;
  /** Write this chunk as an EXTERNAL `.mcc` stub (payload goes to the returned externals). */
  external?: boolean;
}

/** Build a region file the straightforward way: sequential sectors in the given chunk order. */
export function regionFixture(chunks: FixtureChunk[]): { buffer: Buffer; externals: { lx: number; lz: number; data: Buffer }[] } {
  const location = Buffer.alloc(SECTOR);
  const timestamps = Buffer.alloc(SECTOR);
  const payloads: Buffer[] = [];
  const externals: { lx: number; lz: number; data: Buffer }[] = [];
  let offset = 2;
  for (const chunk of chunks) {
    const compressed = zlib.deflateSync(chunk.nbt);
    let payload: Buffer;
    if (chunk.external) {
      payload = Buffer.alloc(SECTOR);
      payload.writeUInt32BE(1, 0);
      payload[4] = 0x80 | 2;
      externals.push({ lx: chunk.lx, lz: chunk.lz, data: compressed });
    } else {
      const sectors = Math.ceil((compressed.length + 5) / SECTOR);
      payload = Buffer.alloc(sectors * SECTOR);
      payload.writeUInt32BE(compressed.length + 1, 0);
      payload[4] = 2;
      compressed.copy(payload, 5);
    }
    const i = (chunk.lx + chunk.lz * 32) * 4;
    const sectors = payload.length / SECTOR;
    location[i] = (offset >> 16) & 0xff;
    location[i + 1] = (offset >> 8) & 0xff;
    location[i + 2] = offset & 0xff;
    location[i + 3] = sectors;
    timestamps.writeUInt32BE((chunk.timestamp ?? 1234567890) >>> 0, i);
    payloads.push(payload);
    offset += sectors;
  }
  return { buffer: Buffer.concat([location, timestamps, ...payloads]), externals };
}

/** A poi chunk root: `Sections.<y>.{Valid, Records}`. */
export function poiChunkTag(sectionYs: number[], valid = 1): Tag {
  const sections: Compound = {};
  for (const y of sectionYs) {
    sections[String(y)] = compoundTag({
      Valid: byteTag(valid),
      Records: compoundListTag([]),
    });
  }
  return {
    type: 'compound',
    value: { DataVersion: intTag(3955), Sections: compoundTag(sections) },
  } as unknown as Tag;
}
