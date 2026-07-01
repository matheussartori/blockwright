// Parse `level.dat` (gzipped NBT) for the bits the shell needs to open a world and seed navigation.
// Everything lives under a top-level `Data` compound; single-player saves embed the last player as
// `Data.Player`. prismarine-nbt auto-inflates the gzip header, so no manual decompression here.
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
}

const num = (v: unknown, fallback = 0): number => (Number.isFinite(Number(v)) ? Number(v) : fallback);

/** Read `<worldDir>/level.dat` into `LevelInfo`. Throws if the file is missing/unparseable. */
export async function readLevelDat(worldDir: string): Promise<LevelInfo> {
  const buf = await fs.readFile(path.join(worldDir, 'level.dat'));
  const { parsed } = await nbt.parse(buf);
  const root = nbt.simplify(parsed) as Record<string, unknown>;
  const data = (root.Data ?? root) as Record<string, unknown>;

  const version = data.Version as { Name?: string } | undefined;
  const player = data.Player as { Pos?: number[] } | undefined;
  const pos = player?.Pos;

  return {
    name: String(data.LevelName ?? path.basename(worldDir)),
    dataVersion: num(data.DataVersion),
    versionName: version?.Name ?? null,
    spawn: [num(data.SpawnX), num(data.SpawnY, 64), num(data.SpawnZ)],
    player: Array.isArray(pos) && pos.length === 3 ? [num(pos[0]), num(pos[1]), num(pos[2])] : null,
  };
}
