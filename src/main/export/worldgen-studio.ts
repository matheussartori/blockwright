// The Worldgen Studio's IO: read one structure's worldgen files (def + set + start
// pool + biome tag) into an editable model, and write edits back SURGICALLY — each
// file is re-read, only the modeled fields are patched, and everything else
// (processors, spawn_overrides, hand-added keys) survives byte-for-byte in spirit.
// Scope-matched to what the export writes; not a generic datapack editor.
import fs from 'node:fs';
import path from 'node:path';
import type {
  Workspace,
  WorldgenModel,
  WorldgenPoolModel,
  WorldgenWriteResult,
} from '@/shared/types';
import type { TerrainAdaptation } from '@/shared/domain/worldgen';
import { clearJsonCache, getActiveWorkspace } from '../structure/assets/content-pack';
import { saltFor } from './worldgen-json';

const JIGSAW_TYPE = 'minecraft:jigsaw';

function readJson(file: string): Record<string, unknown> | null {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8')) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function writeJson(file: string, json: Record<string, unknown>): void {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(json, null, 2)}\n`);
}

/** Resolve an own-namespace `ns:rel` id to an absolute file, or null when foreign. */
function ownFile(ws: Workspace, id: string, folder: string): string | null {
  const [ns, rel] = id.includes(':') ? (id.split(':', 2) as [string, string]) : ['minecraft', id];
  if (ns !== ws.namespace) return null;
  return path.join(ws.root, 'data', ns, folder, `${rel}.json`);
}

const rel = (ws: Workspace, file: string): string => path.relative(ws.root, file);

/** The jigsaw structure defs the Studio can edit (basenames, sorted). */
export function listDefs(ws: Workspace): string[] {
  const dir = path.join(ws.root, 'data', ws.namespace, 'worldgen', 'structure');
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((f) => f.endsWith('.json'))
    .map((f) => path.basename(f, '.json'))
    .filter((name) => String(readJson(path.join(dir, `${name}.json`))?.type ?? '') === JIGSAW_TYPE)
    .sort();
}

/** Read one def's editable worldgen slice, or null when the def is missing/invalid. */
export function readModel(ws: Workspace, name: string): WorldgenModel | null {
  const defFile = path.join(ws.root, 'data', ws.namespace, 'worldgen', 'structure', `${name}.json`);
  const def = readJson(defFile);
  if (!def || String(def.type ?? '') !== JIGSAW_TYPE) return null;

  const startPool = String(def.start_pool ?? '');

  // Biomes: an own-namespace `#tag` is edited through its tag file; anything else
  // (inline array, foreign tag string) is edited inline on the def.
  let biomes: string[] = [];
  let biomesInline = true;
  const rawBiomes = def.biomes;
  if (typeof rawBiomes === 'string' && rawBiomes.startsWith('#')) {
    const tagFile = ownFile(ws, rawBiomes.slice(1), 'tags/worldgen/biome');
    const tag = tagFile ? readJson(tagFile) : null;
    if (tagFile && tag && Array.isArray(tag.values)) {
      biomes = (tag.values as unknown[]).filter((v): v is string => typeof v === 'string');
      biomesInline = false;
    } else {
      biomes = [rawBiomes];
    }
  } else if (Array.isArray(rawBiomes)) {
    biomes = (rawBiomes as unknown[]).filter((v): v is string => typeof v === 'string');
  }

  // The set that spawns this def (first match wins — the export writes one per def).
  let set: WorldgenModel['set'] = null;
  const setDir = path.join(ws.root, 'data', ws.namespace, 'worldgen', 'structure_set');
  if (fs.existsSync(setDir)) {
    for (const f of fs.readdirSync(setDir).filter((f) => f.endsWith('.json'))) {
      const setFile = path.join(setDir, f);
      const json = readJson(setFile);
      const structures = Array.isArray(json?.structures) ? (json?.structures as { structure?: string }[]) : [];
      if (!structures.some((s) => s?.structure === `${ws.namespace}:${name}`)) continue;
      const placement = (json?.placement ?? {}) as Record<string, unknown>;
      set = {
        file: rel(ws, setFile),
        spacing: Number(placement.spacing ?? 32),
        separation: Number(placement.separation ?? 8),
      };
      break;
    }
  }

  // The start pool, when it's the workspace's own.
  let pool: WorldgenPoolModel | null = null;
  const poolFile = startPool ? ownFile(ws, startPool, 'worldgen/template_pool') : null;
  const poolJson = poolFile ? readJson(poolFile) : null;
  if (poolFile && poolJson) {
    const elements = Array.isArray(poolJson.elements)
      ? (poolJson.elements as { weight?: number; element?: { location?: string } }[])
      : [];
    pool = {
      file: rel(ws, poolFile),
      id: startPool,
      fallback: String(poolJson.fallback ?? 'minecraft:empty'),
      elements: elements
        .map((e, index) => ({ index, location: e?.element?.location, weight: Number(e?.weight ?? 1) }))
        .filter((e): e is { index: number; location: string; weight: number } => typeof e.location === 'string'),
    };
  }

  return {
    name,
    file: rel(ws, defFile),
    terrainAdaptation: String(def.terrain_adaptation ?? 'none') as TerrainAdaptation,
    size: Number(def.size ?? 1),
    maxDistance: Number(def.max_distance_from_center ?? 80),
    startPool,
    biomes,
    biomesInline,
    set,
    pool,
  };
}

/** Patch the modeled fields back into their files (unmodeled fields untouched),
 *  then drop the JSON cache so the assembler / pool inspector see the edits. */
export function writeModel(ws: Workspace, model: WorldgenModel): WorldgenWriteResult {
  try {
    const defFile = path.join(ws.root, 'data', ws.namespace, 'worldgen', 'structure', `${model.name}.json`);
    const def = readJson(defFile);
    if (!def) return { ok: false, error: `missing def: ${model.file}` };
    def.terrain_adaptation = model.terrainAdaptation;
    def.size = model.size;
    def.max_distance_from_center = model.maxDistance;
    if (model.biomesInline) def.biomes = model.biomes;
    writeJson(defFile, def);

    if (!model.biomesInline && typeof def.biomes === 'string') {
      const tagFile = ownFile(ws, (def.biomes as string).slice(1), 'tags/worldgen/biome');
      if (tagFile) {
        const tag = readJson(tagFile) ?? {};
        tag.values = model.biomes;
        writeJson(tagFile, tag);
      }
    }

    if (model.set) {
      const setFile = path.join(ws.root, model.set.file);
      const json = readJson(setFile);
      if (json) {
        const placement = (json.placement ?? {
          type: 'minecraft:random_spread',
          salt: saltFor(`${ws.namespace}:${model.name}`),
        }) as Record<string, unknown>;
        placement.spacing = model.set.spacing;
        placement.separation = model.set.separation;
        json.placement = placement;
        writeJson(setFile, json);
      }
    }

    if (model.pool) {
      const poolFile = path.join(ws.root, model.pool.file);
      const json = readJson(poolFile);
      if (json) {
        json.fallback = model.pool.fallback;
        const elements = Array.isArray(json.elements) ? (json.elements as Record<string, unknown>[]) : [];
        for (const el of model.pool.elements) {
          if (elements[el.index]) elements[el.index].weight = el.weight;
        }
        writeJson(poolFile, json);
      }
    }

    clearJsonCache(); // pool/def resolutions must see the new content immediately
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

// --- IPC entry points (active workspace) --------------------------------------

export function listWorldgenDefs(): string[] {
  const ws = getActiveWorkspace();
  return ws ? listDefs(ws) : [];
}

export function readWorldgenModel(name: string): WorldgenModel | null {
  const ws = getActiveWorkspace();
  return ws ? readModel(ws, name) : null;
}

export function writeWorldgenModel(model: WorldgenModel): WorldgenWriteResult {
  const ws = getActiveWorkspace();
  return ws ? writeModel(ws, model) : { ok: false, error: 'no workspace' };
}
