// World folder layout + coordinate math. A save is a valid world iff it holds `level.dat`. Region
// data lives per dimension. CLASSIC layout (through 1.21): the overworld = `region/`, nether =
// `DIM-1/region/`, end = `DIM1/region/`, MOD dimensions under `dimensions/<namespace>/<path>/region/`.
// Since the 26.x saves the VANILLA dimensions moved under `dimensions/minecraft/<path>/` too
// (`dimensions/minecraft/overworld/region/`, …), so every vanilla dim resolves through BOTH layouts
// (modern first — an upgraded save's authoritative data is there). A dimension is only offered if its
// `region/` actually holds `.mca` (an ungenerated nether/end you never visited isn't listed).
// A region file `r.<rx>.<rz>.mca` covers 32×32 chunks; `rx = chunkX >> 5`, `lx = chunkX & 31`.
import { promises as fs } from 'node:fs';
import path from 'node:path';
import type { DimensionId, RegionRef, WorldDimension } from '@/shared/types';

export const OVERWORLD = 'minecraft:overworld';
export const NETHER = 'minecraft:the_nether';
export const END = 'minecraft:the_end';

/** Candidate data sub-folders (`region`, `entities`, …) for a dimension id, MOST authoritative
 *  first. Every id resolves under the 26.x `dimensions/<ns>/<path>/<sub>` layout; the vanilla three
 *  ALSO resolve to their classic pre-26 folder, so both save generations open. */
function dimSubdirs(root: string, dim: DimensionId, sub: string): string[] {
  const [ns, ...rest] = dim.split(':');
  const modern = path.join(root, 'dimensions', ns, rest.join(':'), sub);
  if (dim === NETHER) return [modern, path.join(root, 'DIM-1', sub)];
  if (dim === END) return [modern, path.join(root, 'DIM1', sub)];
  if (dim === OVERWORLD) return [modern, path.join(root, sub)];
  return [modern];
}

/** Candidate block-region folders for a dimension id (modern layout first). */
export function regionDirs(root: string, dim: DimensionId): string[] {
  return dimSubdirs(root, dim, 'region');
}

/** Candidate entity folders for a dimension id. Since Minecraft 1.17 entities live in their OWN
 *  region set (`entities/r.<rx>.<rz>.mca`), separate from the block `region/` files (older worlds
 *  stored them inside the chunk itself). */
export function entitiesDirs(root: string, dim: DimensionId): string[] {
  return dimSubdirs(root, dim, 'entities');
}

/** Candidate POI folders for a dimension id (`poi/r.<rx>.<rz>.mca` — villager workstations,
 *  nether portals, …). Edited terrain sections invalidate their POI counterparts. */
export function poiDirs(root: string, dim: DimensionId): string[] {
  return dimSubdirs(root, dim, 'poi');
}

/** Candidate absolute paths to one POI region file. */
export function poiFilePaths(root: string, dim: DimensionId, rx: number, rz: number): string[] {
  return poiDirs(root, dim).map((d) => path.join(d, `r.${rx}.${rz}.mca`));
}

/** Candidate absolute paths to one block-region file (only one layout exists on disk). */
export function regionFilePaths(root: string, dim: DimensionId, rx: number, rz: number): string[] {
  return regionDirs(root, dim).map((d) => path.join(d, `r.${rx}.${rz}.mca`));
}

/** Candidate absolute paths to one entity-region file (1.17+ `entities/` set). */
export function entitiesFilePaths(root: string, dim: DimensionId, rx: number, rz: number): string[] {
  return entitiesDirs(root, dim).map((d) => path.join(d, `r.${rx}.${rz}.mca`));
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

/** Region coordinates present in a dimension's region folder(s) — the union over both layout
 *  candidates, deduped (in practice only one exists on disk). Empty if neither folder is present. */
export async function listRegions(root: string, dim: DimensionId): Promise<RegionRef[]> {
  const seen = new Set<string>();
  const out: RegionRef[] = [];
  for (const dir of regionDirs(root, dim)) {
    for (const ref of await listRegionDir(dir)) {
      const key = `${ref.rx},${ref.rz}`;
      if (!seen.has(key)) {
        seen.add(key);
        out.push(ref);
      }
    }
  }
  return out;
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
  const have = new Set<DimensionId>();
  const add = (id: DimensionId) => {
    if (!have.has(id)) {
      have.add(id);
      found.push({ id, label: dimensionLabel(id) });
    }
  };
  add(OVERWORLD);
  if ((await listRegions(root, NETHER)).length > 0) add(NETHER);
  if ((await listRegions(root, END)).length > 0) add(END);

  // Mod dimensions: dimensions/<namespace>/<path>/region/*.mca. On a 26.x save the VANILLA dims
  // live here too (dimensions/minecraft/overworld/…) — `have` keeps them from double-listing.
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
      const id: DimensionId = `${ns}:${p}`;
      if (!have.has(id) && (await listRegionDir(path.join(modRoot, ns, p, 'region'))).length > 0) {
        add(id);
      }
    }
  }
  return found;
}
