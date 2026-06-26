// The inverse of compile: read an existing `.nbt` back into authoring JSON, so the
// AI generator can be seeded with the file the user already has open and EDIT it
// rather than building from scratch.
import fs from 'node:fs/promises';
import * as nbt from 'prismarine-nbt';
import { isAir } from './palette';
import type { AuthoringBlock, AuthoringEntity, AuthoringPaletteEntry, AuthoringStructure } from './types';
import { DEFAULT_DATA_VERSION } from '../mc-data-version';

/** Read an existing `.nbt` into authoring JSON. Air cells are dropped (the
 *  authoring format omits air by convention; compile re-materialises it), which
 *  also keeps the seed small. Blockstate property values are normalised to
 *  strings. The result is a flat `blocks` list (no `ops`) since the geometry is
 *  already baked. */
export async function readAuthoring(filePath: string): Promise<AuthoringStructure> {
  const buffer = await fs.readFile(filePath);
  const { parsed } = await nbt.parse(buffer);
  const root = nbt.simplify(parsed) as {
    DataVersion?: number;
    size?: number[];
    palette?: { Name: string; Properties?: Record<string, string | number> }[];
    blocks?: { state: number; pos: number[]; nbt?: Record<string, unknown> }[];
    entities?: { pos?: number[]; blockPos?: number[]; nbt?: Record<string, unknown> }[];
  };
  const palette: AuthoringPaletteEntry[] = (root.palette ?? []).map((p) => {
    const out: AuthoringPaletteEntry = { Name: p.Name };
    if (p.Properties && Object.keys(p.Properties).length > 0) {
      const props: Record<string, string> = {};
      for (const [k, v] of Object.entries(p.Properties)) props[k] = String(v);
      out.Properties = props;
    }
    return out;
  });
  const blocks: AuthoringBlock[] = (root.blocks ?? [])
    .filter((b) => Array.isArray(b.pos) && typeof b.state === 'number' && !isAir(palette[b.state]?.Name ?? ''))
    .map((b) => ({
      state: b.state,
      pos: b.pos as [number, number, number],
      ...(b.nbt && Object.keys(b.nbt).length > 0 ? { nbt: b.nbt } : {}),
    }));
  // Entities (armor stands, item frames, mobs) carry a precise `pos` + the `blockPos` they
  // sit in; kept so format conversions / the jigsaw split don't silently drop them.
  const entities: AuthoringEntity[] = (root.entities ?? [])
    .filter((e) => Array.isArray(e.pos) && Array.isArray(e.blockPos))
    .map((e) => ({
      pos: e.pos as [number, number, number],
      blockPos: e.blockPos as [number, number, number],
      ...(e.nbt && Object.keys(e.nbt).length > 0 ? { nbt: e.nbt } : {}),
    }));
  return {
    DataVersion: root.DataVersion ?? DEFAULT_DATA_VERSION,
    size: (root.size ?? [0, 0, 0]) as [number, number, number],
    palette,
    blocks,
    ...(entities.length > 0 ? { entities } : {}),
  };
}
