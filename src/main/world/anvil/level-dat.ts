// Parse `level.dat` (gzipped NBT) for the bits the shell needs to open a world and seed navigation.
// Everything lives under a top-level `Data` compound; single-player saves embed the last player as
// `Data.Player` — until the 26.x saves, which moved the spawn into a `spawn` compound
// (`spawn.pos: [x,y,z]`) and the player out to `players/data/<uuid>.dat` (pointed at by
// `singleplayer_uuid`). Both generations are handled here. prismarine-nbt auto-inflates the gzip
// header, so no manual decompression.
import { promises as fs } from 'node:fs';
import path from 'node:path';
import * as nbt from 'prismarine-nbt';

/** The level-specific fields of `WorldMeta` (dimensions are derived from disk in `world-paths.ts`). */
export interface LevelInfo {
  name: string;
  dataVersion: number;
  versionName: string | null;
  spawn: [number, number, number];
  player: [number, number, number] | null;
  /** World-generation seed as a decimal string (a signed 64-bit value doesn't fit a JS
   *  number), or null when the save doesn't record one. Drives the slime-chunk overlay. */
  seed: string | null;
}

const num = (v: unknown, fallback = 0): number => (Number.isFinite(Number(v)) ? Number(v) : fallback);

const xyz = (v: unknown): [number, number, number] | null =>
  Array.isArray(v) && v.length === 3 ? [num(v[0]), num(v[1]), num(v[2])] : null;

/** A simplified NBT long → its SIGNED 64-bit decimal string. prismarine-nbt's `simplify`
 *  yields `[high, low]` int32 pairs for longs (BigInt/number tolerated for safety). */
function longStr(v: unknown): string | null {
  if (typeof v === 'bigint') return BigInt.asIntN(64, v).toString();
  if (typeof v === 'number' && Number.isFinite(v)) return String(Math.trunc(v));
  if (Array.isArray(v) && v.length === 2 && v.every((n) => typeof n === 'number')) {
    const unsigned = (BigInt(v[0] >>> 0) << 32n) | BigInt(v[1] >>> 0);
    return BigInt.asIntN(64, unsigned).toString();
  }
  return null;
}

/** Read `<worldDir>/level.dat` into `LevelInfo`. Throws if the file is missing/unparseable. */
export async function readLevelDat(worldDir: string): Promise<LevelInfo> {
  const buf = await fs.readFile(path.join(worldDir, 'level.dat'));
  const { parsed } = await nbt.parse(buf);
  const root = nbt.simplify(parsed) as Record<string, unknown>;
  const data = (root.Data ?? root) as Record<string, unknown>;

  const version = data.Version as { Name?: string } | undefined;
  // 26.x: `spawn: {pos:[x,y,z], …}`; classic: flat SpawnX/SpawnY/SpawnZ.
  const spawnPos = xyz((data.spawn as { pos?: unknown } | undefined)?.pos);
  const inlinePlayer = xyz((data.Player as { Pos?: unknown } | undefined)?.Pos);

  return {
    name: String(data.LevelName ?? path.basename(worldDir)),
    dataVersion: num(data.DataVersion),
    versionName: version?.Name ?? null,
    spawn: spawnPos ?? [num(data.SpawnX), num(data.SpawnY, 64), num(data.SpawnZ)],
    player: inlinePlayer ?? (await singleplayerPos(worldDir, data)),
    // Modern: WorldGenSettings.seed; legacy (pre-1.16): flat RandomSeed.
    seed: longStr((data.WorldGenSettings as { seed?: unknown } | undefined)?.seed) ?? longStr(data.RandomSeed),
  };
}

/** 26.x saves keep the last player in `players/data/<uuid>.dat`; `Data.singleplayer_uuid` (four
 *  signed int32s, big-endian) names the file. Best-effort — a miss just leaves the camera at spawn. */
async function singleplayerPos(worldDir: string, data: Record<string, unknown>): Promise<[number, number, number] | null> {
  const ints = data.singleplayer_uuid;
  if (!Array.isArray(ints) || ints.length !== 4) return null;
  const hex = ints.map((n) => (num(n) >>> 0).toString(16).padStart(8, '0')).join('');
  const uuid = `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
  try {
    const buf = await fs.readFile(path.join(worldDir, 'players', 'data', `${uuid}.dat`));
    const player = nbt.simplify((await nbt.parse(buf)).parsed) as { Pos?: unknown };
    return xyz(player.Pos);
  } catch {
    return null;
  }
}
