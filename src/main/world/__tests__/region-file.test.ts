import { afterAll, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import zlib from 'node:zlib';
import * as nbt from 'prismarine-nbt';
import LZ4 from 'lz4js';
import { RegionFile, decompressChunk } from '../anvil/region-file';

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'bw-region-'));
afterAll(() => fs.rmSync(tmp, { recursive: true, force: true }));

/** A tiny valid chunk NBT (uncompressed prismarine buffer). */
function chunkBuffer(): Buffer {
  const tag = {
    type: 'compound' as const,
    name: '',
    value: {
      DataVersion: { type: 'int' as const, value: 3955 },
      xPos: { type: 'int' as const, value: 0 },
      zPos: { type: 'int' as const, value: 0 },
      Status: { type: 'string' as const, value: 'minecraft:full' },
    },
  };
  return nbt.writeUncompressed(tag as unknown as nbt.NBT, 'big');
}

/** Assemble a one-chunk region file (chunk at local 0,0) with the given compression type byte. */
function writeRegion(name: string, compType: number, compressed: Buffer): string {
  const payload = Buffer.concat([Buffer.alloc(4), Buffer.from([compType]), compressed]);
  payload.writeUInt32BE(compressed.length + 1, 0); // length includes the type byte
  const sectors = Math.ceil(payload.length / 4096);
  const region = Buffer.alloc(8192 + sectors * 4096);
  // Location entry for chunk (0,0): offset = sector 2, count = sectors.
  region[0] = 0;
  region[1] = 0;
  region[2] = 2;
  region[3] = sectors;
  payload.copy(region, 8192);
  const file = path.join(tmp, name);
  fs.writeFileSync(file, region);
  return file;
}

describe('decompressChunk', () => {
  const src = Buffer.from('the quick brown fox '.repeat(50), 'utf8');
  it('handles gzip (1), zlib (2), none (3) and LZ4 (4)', () => {
    expect(decompressChunk(1, zlib.gzipSync(src)).equals(src)).toBe(true);
    expect(decompressChunk(2, zlib.deflateSync(src)).equals(src)).toBe(true);
    expect(decompressChunk(3, src).equals(src)).toBe(true);
    expect(decompressChunk(4, Buffer.from(LZ4.compress(src))).equals(src)).toBe(true);
  });
  it('ignores the 0x80 external flag when picking the codec', () => {
    expect(decompressChunk(2 | 0x80, zlib.deflateSync(src)).equals(src)).toBe(true);
  });
  it('throws on an unknown codec', () => {
    expect(() => decompressChunk(9, src)).toThrow(/unsupported/);
  });
});

describe('RegionFile', () => {
  it('reads header + decompresses + parses a zlib chunk', async () => {
    const file = writeRegion('r.0.0.mca', 2, zlib.deflateSync(chunkBuffer()));
    const region = await RegionFile.open(file);
    expect(region.rx).toBe(0);
    expect(region.rz).toBe(0);
    expect(region.hasChunk(0, 0)).toBe(true);
    expect(region.hasChunk(1, 0)).toBe(false);
    expect(region.listPresent()).toEqual([{ lx: 0, lz: 0 }]);

    const nbtOut = await region.readChunkNBT(0, 0);
    expect(nbtOut).not.toBeNull();
    expect(nbtOut!.DataVersion).toBe(3955);
    expect(nbtOut!.Status).toBe('minecraft:full');
    expect(await region.readChunkNBT(1, 0)).toBeNull();
  });

  it('reads a gzip-compressed chunk too', async () => {
    const file = writeRegion('r.1.2.mca', 1, zlib.gzipSync(chunkBuffer()));
    const region = await RegionFile.open(file);
    expect(region.rx).toBe(1);
    expect(region.rz).toBe(2);
    const nbtOut = await region.readChunkNBT(0, 0);
    expect(nbtOut!.DataVersion).toBe(3955);
  });

  it('rejects a non-region filename', async () => {
    const bad = path.join(tmp, 'not-a-region.dat');
    fs.writeFileSync(bad, Buffer.alloc(8192));
    await expect(RegionFile.open(bad)).rejects.toThrow(/not a region file/);
  });
});
