// Atomic whole-region rewrite — the only way bytes reach a `.mca`. In-place sector patching is
// where vanilla's own historical corruption lives, so we don't do it: untouched chunks' compressed
// sectors are copied VERBATIM (byte-identical), only edited chunks are re-encoded (zlib), both
// header tables are rebuilt sequentially, and the result lands via temp file → fsync → rename.
// Oversized chunks (compressed payload > 255 sectors) spill to the sibling `c.<gx>.<gz>.mcc`
// exactly like vanilla 1.15+.
import { promises as fs } from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';

const SECTOR = 4096;
const HEADER_SECTORS = 2; // location table + timestamp table
const MAX_INLINE_SECTORS = 255; // the sector-count header field is one byte

/** One chunk to re-encode: its local coords + the UNCOMPRESSED big-endian NBT bytes. */
export interface ChunkRewrite {
  lx: number;
  lz: number;
  nbt: Buffer;
}

export interface RegionBuildResult {
  buffer: Buffer;
  /** Oversized edited chunks: `.mcc` payloads to write beside the region (zlib-compressed). */
  external: { lx: number; lz: number; data: Buffer }[];
  /** Previously-external chunks that now fit inline: their stale `.mcc` files to remove. */
  removeExternal: { lx: number; lz: number }[];
}

const slot = (lx: number, lz: number): number => lx + lz * 32;

interface OriginalEntry {
  offsetSectors: number;
  sectorCount: number;
  timestamp: number;
  externalFlag: boolean;
}

function readOriginalEntry(buf: Buffer, i: number): OriginalEntry | null {
  const li = i * 4;
  if (li + 4 > buf.length) return null;
  const offsetSectors = (buf[li] << 16) | (buf[li + 1] << 8) | buf[li + 2];
  const sectorCount = buf[li + 3];
  if (offsetSectors < HEADER_SECTORS || sectorCount === 0) return null;
  const ti = SECTOR + li;
  const timestamp = ti + 4 <= buf.length ? buf.readUInt32BE(ti) : 0;
  const start = offsetSectors * SECTOR;
  const externalFlag = start + 5 <= buf.length ? (buf[start + 4] & 0x80) !== 0 : false;
  return { offsetSectors, sectorCount, timestamp, externalFlag };
}

/**
 * Build the rewritten region file in memory (pure — no IO, unit-testable).
 *
 * Chunks keep their original on-disk ORDER (by offset), so a zero-edit rebuild of a compact
 * region is byte-identical — the golden no-op the test suite pins.
 *
 * @param original The current region file bytes (must contain the two header sectors).
 * @param edits    Chunks to re-encode. Every edit must target a chunk PRESENT in the original —
 *   the edit gate upstream only passes fully generated chunks, so an absent slot is a caller bug.
 * @param nowSec   Timestamp (epoch seconds) stamped on edited chunks' header entries.
 * @throws If an edit targets an absent chunk or the original header is truncated.
 */
export function buildRegionBuffer(original: Buffer, edits: ChunkRewrite[], nowSec: number): RegionBuildResult {
  if (original.length < HEADER_SECTORS * SECTOR) {
    throw new Error(`region file is truncated (${original.length} bytes) — refusing to rewrite`);
  }
  const editBySlot = new Map<number, ChunkRewrite>();
  for (const e of edits) editBySlot.set(slot(e.lx, e.lz), e);

  // Every present chunk, in original offset order (stable layout ⇒ byte-identical no-op).
  const present: { i: number; entry: OriginalEntry }[] = [];
  for (let i = 0; i < 1024; i++) {
    const entry = readOriginalEntry(original, i);
    if (entry) present.push({ i, entry });
  }
  present.sort((a, b) => a.entry.offsetSectors - b.entry.offsetSectors);
  const presentSlots = new Set(present.map((p) => p.i));
  for (const e of edits) {
    if (!presentSlots.has(slot(e.lx, e.lz))) {
      throw new Error(`edit targets absent chunk ${e.lx},${e.lz} — the edit gate should have refused it`);
    }
  }

  const external: RegionBuildResult['external'] = [];
  const removeExternal: RegionBuildResult['removeExternal'] = [];
  const location = Buffer.alloc(SECTOR);
  const timestamps = Buffer.alloc(SECTOR);
  const payloads: Buffer[] = [];
  let nextOffset = HEADER_SECTORS;

  for (const { i, entry } of present) {
    const lx = i & 31;
    const lz = i >> 5;
    const edit = editBySlot.get(i);

    let payload: Buffer;
    let timestamp: number;
    if (edit) {
      const compressed = zlib.deflateSync(edit.nbt);
      const inlineSectors = Math.ceil((compressed.length + 5) / SECTOR);
      if (inlineSectors > MAX_INLINE_SECTORS) {
        // Oversized: region keeps a 1-sector stub (length=1, type=zlib|external); data → `.mcc`.
        payload = Buffer.alloc(SECTOR);
        payload.writeUInt32BE(1, 0);
        payload[4] = 0x80 | 2;
        external.push({ lx, lz, data: compressed });
      } else {
        payload = Buffer.alloc(inlineSectors * SECTOR);
        payload.writeUInt32BE(compressed.length + 1, 0);
        payload[4] = 2; // zlib
        compressed.copy(payload, 5);
        if (entry.externalFlag) removeExternal.push({ lx, lz });
      }
      timestamp = nowSec;
    } else {
      // Untouched: full sectors copied verbatim, padding bytes included.
      const start = entry.offsetSectors * SECTOR;
      const end = Math.min(start + entry.sectorCount * SECTOR, original.length);
      payload = Buffer.alloc(entry.sectorCount * SECTOR);
      original.copy(payload, 0, start, end);
      timestamp = entry.timestamp;
    }

    const sectorCount = payload.length / SECTOR;
    if (sectorCount > MAX_INLINE_SECTORS) {
      throw new Error(`chunk ${lx},${lz} spans ${sectorCount} sectors — over the header's 255 limit`);
    }
    const li = i * 4;
    location[li] = (nextOffset >> 16) & 0xff;
    location[li + 1] = (nextOffset >> 8) & 0xff;
    location[li + 2] = nextOffset & 0xff;
    location[li + 3] = sectorCount;
    timestamps.writeUInt32BE(timestamp >>> 0, li);
    payloads.push(payload);
    nextOffset += sectorCount;
  }

  return { buffer: Buffer.concat([location, timestamps, ...payloads]), external, removeExternal };
}

/** Write a buffer atomically: temp file in the SAME directory → fsync → rename over. The dir
 *  fsync is best-effort (not supported on Windows). */
export async function writeFileAtomic(filePath: string, data: Buffer): Promise<void> {
  const tmp = `${filePath}.bw-tmp`;
  const handle = await fs.open(tmp, 'w');
  try {
    await handle.writeFile(data);
    await handle.sync();
  } finally {
    await handle.close();
  }
  await fs.rename(tmp, filePath);
  try {
    const dir = await fs.open(path.dirname(filePath), 'r');
    await dir.sync().catch(() => undefined);
    await dir.close();
  } catch {
    /* directory fsync is best-effort */
  }
}

/**
 * Rewrite one region file on disk with the given chunk edits.
 *
 * Ordering: new `.mcc` payloads land (atomically) BEFORE the region swap so the region never
 * references a missing external file; stale `.mcc` files are removed only AFTER the swap.
 *
 * @param filePath Absolute path to the `r.<rx>.<rz>.mca` (must exist).
 * @param edits    Chunks to re-encode (see `buildRegionBuffer`).
 * @param nowSec   Header timestamp for edited chunks (defaults to now).
 */
export async function rewriteRegion(filePath: string, edits: ChunkRewrite[], nowSec = Math.floor(Date.now() / 1000)): Promise<void> {
  const m = path.basename(filePath).match(/^r\.(-?\d+)\.(-?\d+)\.mca$/);
  if (!m) throw new Error(`not a region file name: ${filePath}`);
  const rx = Number(m[1]);
  const rz = Number(m[2]);
  const dir = path.dirname(filePath);
  const mccPath = (lx: number, lz: number) => path.join(dir, `c.${rx * 32 + lx}.${rz * 32 + lz}.mcc`);

  const original = await fs.readFile(filePath);
  const { buffer, external, removeExternal } = buildRegionBuffer(original, edits, nowSec);

  for (const ext of external) await writeFileAtomic(mccPath(ext.lx, ext.lz), ext.data);
  await writeFileAtomic(filePath, buffer);
  for (const stale of removeExternal) await fs.rm(mccPath(stale.lx, stale.lz), { force: true });
}
