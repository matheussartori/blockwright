// World folder layout + coordinate math. A save is a valid world iff it holds `level.dat`. Region
// data lives per dimension: the overworld = `region/`, nether = `DIM-1/region/`, end = `DIM1/region/`,
// and MOD dimensions under `dimensions/<namespace>/<path>/region/`. A dimension is only offered if its
// `region/` actually holds `.mca` (an ungenerated nether/end you never visited isn't listed).
// A region file `r.<rx>.<rz>.mca` covers 32×32 chunks; `rx = chunkX >> 5`, `lx = chunkX & 31`.
import { promises as fs } from 'node:fs';
import path from 'node:path';
import type { DimensionId, RegionRef, WorldDimension } from '@/shared/types';

export const OVERWORLD = 'minecraft:overworld';
export const NETHER = 'minecraft:the_nether';
export const END = 'minecraft:the_end';

/** Region sub-folder for a dimension id, relative to the world root. Vanilla ids map to the classic
 *  folders; any other `ns:path` id resolves under `dimensions/ns/path/region`. */
export function regionDir(root: string, dim: DimensionId): string {
  if (dim === NETHER) return path.join(root, 'DIM-1', 'region');
  if (dim === END) return path.join(root, 'DIM1', 'region');
  if (dim === OVERWORLD) return path.join(root, 'region');
  const [ns, ...rest] = dim.split(':');
  return path.join(root, 'dimensions', ns, rest.join(':'), 'region');
}

/** Absolute path to one region file. */
export function regionFilePath(root: string, dim: DimensionId, rx: number, rz: number): string {
  return path.join(regionDir(root, dim), `r.${rx}.${rz}.mca`);
}

/** Split a chunk coordinate into its region + local (in-region) coordinates. */
export function regionForChunk(cx: number, cz: number): { rx: number; rz: number; lx: number; lz: number } {
  return { rx: cx >> 5, rz: cz >> 5, lx: cx & 31, lz: cz & 31 };
}

/** A world folder is valid iff it contains `level.dat`. */
export async function isWorldDir(root: string): Promise<boolean> {
  try {
    await fs.access(path.join(root, 'level.dat'));
    return true;
  } catch {
    return false;
  }
}

/** Region coordinates present in a dimension's region folder (empty if the folder is absent). */
export async function listRegions(root: string, dim: DimensionId): Promise<RegionRef[]> {
  return listRegionDir(regionDir(root, dim));
}

async function listRegionDir(dir: string): Promise<RegionRef[]> {
  let names: string[];
  try {
    names = await fs.readdir(dir);
  } catch {
    return [];
  }
  const out: RegionRef[] = [];
  for (const name of names) {
    const m = name.match(/^r\.(-?\d+)\.(-?\d+)\.mca$/);
    if (m) out.push({ rx: Number(m[1]), rz: Number(m[2]) });
  }
  return out;
}

/** A human label for a dimension id (vanilla ids get friendly names; a mod dim shows its path). */
function dimensionLabel(id: DimensionId): string {
  if (id === OVERWORLD) return 'Overworld';
  if (id === NETHER) return 'Nether';
  if (id === END) return 'End';
  const rest = id.split(':').slice(1).join(':');
  return rest || id;
}

/** Every dimension with region data on disk: the vanilla three (if generated) + each mod dimension
 *  under `dimensions/<ns>/<path>/region`. The overworld is always offered (a fresh world has it). */
export async function availableDimensions(root: string): Promise<WorldDimension[]> {
  const found: WorldDimension[] = [];
  const add = async (id: DimensionId, always = false) => {
    if (always || (await listRegions(root, id)).length > 0) found.push({ id, label: dimensionLabel(id) });
  };
  await add(OVERWORLD, true);
  await add(NETHER);
  await add(END);

  // Mod dimensions: dimensions/<namespace>/<path>/region/*.mca
  const modRoot = path.join(root, 'dimensions');
  let namespaces: string[];
  try {
    namespaces = await fs.readdir(modRoot);
  } catch {
    namespaces = [];
  }
  for (const ns of namespaces) {
    let paths: string[];
    try {
      paths = await fs.readdir(path.join(modRoot, ns));
    } catch {
      continue;
    }
    for (const p of paths) {
      if ((await listRegionDir(path.join(modRoot, ns, p, 'region'))).length > 0) {
        const id = `${ns}:${p}`;
        found.push({ id, label: dimensionLabel(id) });
      }
    }
  }
  return found;
}
