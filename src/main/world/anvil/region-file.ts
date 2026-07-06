// The Anvil region container (`r.<rx>.<rz>.mca`). Layout: a 4 KiB LOCATION table (1024 entries ×
// [3-byte sector offset | 1-byte sector count]) + a 4 KiB TIMESTAMP table, then the chunk payloads
// packed into 4 KiB sectors. Each payload is `[4-byte big-endian length][1-byte compression type]
// [compressed data]`. Compression: 1=gzip, 2=zlib (the common case), 3=none, 4=LZ4; bit 0x80 on the
// type means the chunk is stored EXTERNALLY in a sibling `c.<gx>.<gz>.mcc` file (oversized chunks,
// 1.15+). A region spans 32×32 chunks; local (lx,lz) = (chunkX & 31, chunkZ & 31).
import { promises as fs } from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import * as nbt from 'prismarine-nbt';
import LZ4 from 'lz4js';

const SECTOR = 4096;

/** Decompress one chunk payload by its Anvil compression type. Throws on an unknown/unsupported
 *  codec (the caller fails soft, skipping the chunk with a log). */
export function decompressChunk(type: number, data: Buffer): Buffer {
  const kind = type & 0x7f; // strip the external-file flag
  if (kind === 1) return zlib.gunzipSync(data);
  if (kind === 2) return zlib.inflateSync(data);
  if (kind === 3) return data;
  if (kind === 4) return Buffer.from(LZ4.decompress(data));
  throw new Error(`unsupported Anvil compression type ${type}`);
}

/** An opened `.mca` file: the raw buffer plus enough context to resolve external `.mcc` chunks. */
export class RegionFile {
  private constructor(
    private readonly buf: Buffer,
    private readonly dir: string,
    readonly rx: number,
    readonly rz: number,
  ) {}

  /** Open and slurp a region file. Its name must be `r.<rx>.<rz>.mca`. */
  static async open(filePath: string): Promise<RegionFile> {
    const buf = await fs.readFile(filePath);
    const m = path.basename(filePath).match(/^r\.(-?\d+)\.(-?\d+)\.mca$/);
    if (!m) throw new Error(`not a region file name: ${filePath}`);
    return new RegionFile(buf, path.dirname(filePath), Number(m[1]), Number(m[2]));
  }

  /** Header entry for a chunk at local (lx,lz): its sector offset + sector count (both 0 = absent). */
  private location(lx: number, lz: number): { offsetSectors: number; sectorCount: number } {
    const i = (lx + lz * 32) * 4;
    if (i + 4 > this.buf.length) return { offsetSectors: 0, sectorCount: 0 };
    const offsetSectors = (this.buf[i] << 16) | (this.buf[i + 1] << 8) | this.buf[i + 2];
    return { offsetSectors, sectorCount: this.buf[i + 3] };
  }

  /** True if the chunk at local (lx,lz) has data on disk. */
  hasChunk(lx: number, lz: number): boolean {
    const { offsetSectors, sectorCount } = this.location(lx, lz);
    return offsetSectors >= 2 && sectorCount > 0;
  }

  /** Every present chunk's local coordinates, in header order. */
  listPresent(): { lx: number; lz: number }[] {
    const out: { lx: number; lz: number }[] = [];
    for (let lz = 0; lz < 32; lz++) {
      for (let lx = 0; lx < 32; lx++) {
        if (this.hasChunk(lx, lz)) out.push({ lx, lz });
      }
    }
    return out;
  }

  /** Read + decompress the raw chunk NBT bytes at local (lx,lz), or null if absent. Handles the
   *  external `.mcc` overflow file transparently. */
  async readChunkBytes(lx: number, lz: number): Promise<Buffer | null> {
    const { offsetSectors } = this.location(lx, lz);
    if (offsetSectors < 2) return null;
    const start = offsetSectors * SECTOR;
    if (start + 5 > this.buf.length) return null;
    const length = this.buf.readUInt32BE(start); // includes the 1 compression byte
    const type = this.buf[start + 4];

    let raw: Buffer;
    if ((type & 0x80) !== 0) {
      // External chunk: the region holds only the header; data lives in c.<gx>.<gz>.mcc.
      const gx = this.rx * 32 + lx;
      const gz = this.rz * 32 + lz;
      raw = await fs.readFile(path.join(this.dir, `c.${gx}.${gz}.mcc`));
    } else {
      raw = this.buf.subarray(start + 5, start + 5 + (length - 1));
    }

    return decompressChunk(type, raw);
  }

  /** Read + parse + simplify the chunk NBT at local (lx,lz), or null if absent — the READ path's
   *  shape (types dropped). The WRITE path uses `readChunkParsed` instead. */
  async readChunkNBT(lx: number, lz: number): Promise<Record<string, unknown> | null> {
    const decompressed = await this.readChunkBytes(lx, lz);
    if (!decompressed) return null;
    const { parsed } = await nbt.parse(decompressed);
    return nbt.simplify(parsed) as Record<string, unknown>;
  }

  /** Read + parse the chunk NBT at local (lx,lz) keeping the TAG-TYPED tree ({type,value} nodes),
   *  or null if absent. The write path patches this tree and re-encodes it — types intact, so
   *  every tag we don't own survives byte-for-byte. */
  async readChunkParsed(lx: number, lz: number): Promise<nbt.NBT | null> {
    const decompressed = await this.readChunkBytes(lx, lz);
    if (!decompressed) return null;
    const { parsed } = await nbt.parse(decompressed);
    return parsed;
  }
}
