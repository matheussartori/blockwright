import { access, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { RegionFile } from '../../anvil/region-file';
import { encodeTagRoot } from '../nbt-tree';
import { buildRegionBuffer, rewriteRegion } from '../region-write';
import { chunkTag, regionFixture, SECTOR } from './fixtures';

/** Deterministic incompressible bytes (zlib can't shrink them) to force the `.mcc` path. */
function noise(len: number, seed = 1): Buffer {
  const buf = Buffer.alloc(len);
  let s = seed >>> 0 || 1;
  for (let i = 0; i < len; i++) {
    // xorshift32, HIGH byte — an LCG's low byte has period 256 and zlib flattens it.
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    s >>>= 0;
    buf[i] = s >>> 24;
  }
  return buf;
}

const chunkBytes = (cx: number, cz: number) => encodeTagRoot(chunkTag({ cx, cz }));

describe('buildRegionBuffer', () => {
  it('golden no-op: zero edits rebuild byte-identically', () => {
    const { buffer } = regionFixture([
      { lx: 0, lz: 0, nbt: chunkBytes(0, 0), timestamp: 111 },
      { lx: 5, lz: 3, nbt: chunkBytes(5, 3), timestamp: 222 },
      { lx: 31, lz: 31, nbt: chunkBytes(31, 31), timestamp: 333 },
    ]);
    const rebuilt = buildRegionBuffer(buffer, [], 999);
    expect(rebuilt.buffer.equals(buffer)).toBe(true);
    expect(rebuilt.external).toEqual([]);
    expect(rebuilt.removeExternal).toEqual([]);
  });

  it('re-encodes only the edited chunk; untouched sectors are byte-identical', async () => {
    const { buffer } = regionFixture([
      { lx: 0, lz: 0, nbt: chunkBytes(0, 0), timestamp: 111 },
      { lx: 1, lz: 0, nbt: chunkBytes(1, 0), timestamp: 222 },
    ]);
    const edited = encodeTagRoot(chunkTag({ cx: 1, cz: 0, dataVersion: 4082 }));
    const { buffer: out } = buildRegionBuffer(buffer, [{ lx: 1, lz: 0, nbt: edited }], 999);

    // Untouched chunk (slot 0): sectors copied verbatim.
    const locOf = (buf: Buffer, i: number) => ({
      offset: (buf[i * 4] << 16) | (buf[i * 4 + 1] << 8) | buf[i * 4 + 2],
      count: buf[i * 4 + 3],
    });
    const origLoc = locOf(buffer, 0);
    const newLoc = locOf(out, 0);
    const origPayload = buffer.subarray(origLoc.offset * SECTOR, (origLoc.offset + origLoc.count) * SECTOR);
    const newPayload = out.subarray(newLoc.offset * SECTOR, (newLoc.offset + newLoc.count) * SECTOR);
    expect(newPayload.equals(origPayload)).toBe(true);

    // Timestamps: untouched preserved, edited stamped.
    expect(out.readUInt32BE(SECTOR + 0)).toBe(111);
    expect(out.readUInt32BE(SECTOR + 4)).toBe(999);
  });

  it('refuses an edit on an absent chunk (the gate upstream owns generation)', () => {
    const { buffer } = regionFixture([{ lx: 0, lz: 0, nbt: chunkBytes(0, 0) }]);
    expect(() => buildRegionBuffer(buffer, [{ lx: 9, lz: 9, nbt: chunkBytes(9, 9) }], 0)).toThrow(/absent chunk/);
  });

  it('refuses a truncated region file', () => {
    expect(() => buildRegionBuffer(Buffer.alloc(100), [], 0)).toThrow(/truncated/);
  });

  it('spills an oversized chunk to an external `.mcc` stub (255-sector boundary)', () => {
    const { buffer } = regionFixture([{ lx: 2, lz: 2, nbt: chunkBytes(2, 2) }]);
    // > 255 sectors compressed ⇒ needs > 255*4096 ≈ 1.04 MB of incompressible payload.
    const huge = noise(300 * SECTOR);
    const { buffer: out, external } = buildRegionBuffer(buffer, [{ lx: 2, lz: 2, nbt: huge }], 7);
    expect(external).toHaveLength(1);
    expect(external[0]).toMatchObject({ lx: 2, lz: 2 });

    const i = (2 + 2 * 32) * 4;
    const offset = (out[i] << 16) | (out[i + 1] << 8) | out[i + 2];
    expect(out[i + 3]).toBe(1); // 1-sector stub
    expect(out.readUInt32BE(offset * SECTOR)).toBe(1); // length = just the type byte
    expect(out[offset * SECTOR + 4]).toBe(0x80 | 2); // zlib | external flag
  });

  it('flags a previously-external chunk for `.mcc` cleanup when it fits inline again', () => {
    const { buffer } = regionFixture([{ lx: 4, lz: 4, nbt: noise(300 * SECTOR), external: true }]);
    const { removeExternal, external } = buildRegionBuffer(buffer, [{ lx: 4, lz: 4, nbt: chunkBytes(4, 4) }], 7);
    expect(external).toEqual([]);
    expect(removeExternal).toEqual([{ lx: 4, lz: 4 }]);
  });
});

describe('rewriteRegion (disk)', () => {
  let dir: string;
  beforeEach(async () => {
    dir = await mkdtemp(path.join(tmpdir(), 'bw-region-'));
  });
  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it('rewrites atomically and the result round-trips through our own reader', async () => {
    const file = path.join(dir, 'r.0.0.mca');
    const { buffer } = regionFixture([
      { lx: 0, lz: 0, nbt: chunkBytes(0, 0) },
      { lx: 1, lz: 1, nbt: chunkBytes(1, 1) },
    ]);
    await writeFile(file, buffer);

    const edited = encodeTagRoot(chunkTag({ cx: 1, cz: 1, dataVersion: 4189 }));
    await rewriteRegion(file, [{ lx: 1, lz: 1, nbt: edited }], 555);

    const region = await RegionFile.open(file);
    const read = await region.readChunkNBT(1, 1);
    expect(read?.DataVersion).toBe(4189);
    const untouched = await region.readChunkNBT(0, 0);
    expect(untouched?.DataVersion).toBe(3955);
    await expect(access(`${file}.bw-tmp`)).rejects.toThrow(); // no temp litter
  });

  it('writes and reads back an external `.mcc` chunk, and cleans it up when it shrinks', async () => {
    const file = path.join(dir, 'r.1.-1.mca');
    const { buffer } = regionFixture([{ lx: 3, lz: 0, nbt: chunkBytes(35, -32) }]);
    await writeFile(file, buffer);

    // Make a chunk NBT whose *compressed* size forces the external path: a root with a huge
    // incompressible byteArray. Easier: raw noise is not valid NBT, but the region layer never
    // parses payloads — only the round-trip READ below needs validity, so build a valid root.
    const bigRoot = chunkTag({ cx: 35, cz: -32 });
    (bigRoot.value as Record<string, unknown>)['blob'] = {
      type: 'byteArray',
      value: Array.from(noise(280 * SECTOR)).map((b) => (b << 24) >> 24),
    };
    const bigBytes = encodeTagRoot(bigRoot);
    await rewriteRegion(file, [{ lx: 3, lz: 0, nbt: bigBytes }], 1);

    // gx = 1*32+3 = 35, gz = -1*32+0 = -32.
    const mcc = path.join(dir, 'c.35.-32.mcc');
    await expect(access(mcc)).resolves.toBeUndefined();
    const region = await RegionFile.open(file);
    const read = await region.readChunkNBT(3, 0);
    expect(read?.xPos).toBe(35);

    // Shrink it back inline: the stale `.mcc` is removed.
    await rewriteRegion(file, [{ lx: 3, lz: 0, nbt: chunkBytes(35, -32) }], 2);
    await expect(access(mcc)).rejects.toThrow();
    const again = await RegionFile.open(file);
    expect((await again.readChunkNBT(3, 0))?.xPos).toBe(35);
  });
});
