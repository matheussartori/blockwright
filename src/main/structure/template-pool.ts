// Resolves jigsaw template pools and structure templates from the data packs,
// namespace-aware like the asset layer: a pool/structure id "namespace:path"
// loads from that namespace's `data` root (the workspace for its own namespace,
// the bundled pack for "minecraft"). Pool JSON is cached via content-pack.
import fs from 'node:fs';
import path from 'node:path';
import { dataDir, loadJson } from './content-pack';

const EMPTY_ID = 'minecraft:empty';

/** Split "namespace:path" into parts, defaulting the namespace to "minecraft". */
function parseId(id: string): { namespace: string; path: string } {
  const colon = id.indexOf(':');
  if (colon < 0) return { namespace: 'minecraft', path: id };
  return { namespace: id.slice(0, colon), path: id.slice(colon + 1) };
}

/** Recover a structure id ("namespace:path") from an absolute `.nbt` path that
 *  sits under `data/<namespace>/structure/...`. Falls back to the bare filename. */
export function structureIdFromPath(filePath: string): string {
  const parts = filePath.split(path.sep);
  const dataIdx = parts.lastIndexOf('data');
  if (dataIdx >= 0 && parts[dataIdx + 2] === 'structure') {
    const namespace = parts[dataIdx + 1];
    const rel = parts.slice(dataIdx + 3).join('/').replace(/\.nbt$/, '');
    return `${namespace}:${rel}`;
  }
  return path.basename(filePath).replace(/\.nbt$/, '');
}

/** Absolute path to a structure template `.nbt`, or null when it's not on disk. */
export function resolveStructurePath(structureId: string): string | null {
  const { namespace, path: rel } = parseId(structureId);
  const file = path.join(dataDir(namespace), 'structure', `${rel}.nbt`);
  return fs.existsSync(file) ? file : null;
}

/** One placeable element of a pool, with its template resolved to a file. */
export interface ResolvedPoolElement {
  structureId: string;
  /** Resolved `.nbt` path, or null when the referenced template is missing. */
  structurePath: string | null;
  weight: number;
  projection: string;
  /** A terminal "place nothing" outcome: `empty_pool_element` (vanilla's slot
   *  terminator) or a `feature_pool_element` we can't render. It keeps its weight
   *  so a connector terminates as often as it does in worldgen. */
  empty?: boolean;
}

export interface ResolvedPool {
  id: string;
  /** Whether the pool JSON itself was found. */
  exists: boolean;
  elements: ResolvedPoolElement[];
  /** Fallback pool id (`minecraft:empty` for terminal pools), if declared. */
  fallback: string | null;
}

// --- Raw JSON shapes (only the fields we use) --------------------------------

interface RawElement {
  element_type?: string;
  location?: string;
  projection?: string;
  // list_pool_element nests its own single elements here:
  elements?: RawElement[];
}
interface RawPoolEntry {
  weight?: number;
  element?: RawElement;
}
interface RawPool {
  fallback?: string;
  elements?: RawPoolEntry[];
}

/** Element types that place a single structure template by `location`. "legacy"
 *  is the terrain-matching variant villages use; both resolve the same way. */
const SINGLE_TYPES = new Set([
  'minecraft:single_pool_element',
  'minecraft:legacy_single_pool_element',
]);

/** The structure location of a pool element, flattening a list element to its
 *  first template (we don't render stacked list placements). Null when the
 *  element places no structure (feature/empty/unknown types). */
function elementLocation(el: RawElement | undefined): string | null {
  if (!el) return null;
  if (el.element_type && SINGLE_TYPES.has(el.element_type)) return el.location ?? null;
  if (el.element_type === 'minecraft:list_pool_element') return elementLocation(el.elements?.[0]);
  return null;
}

/** Load and resolve a template pool by id. A missing pool yields `exists:false`
 *  with no elements (the caller treats that as a dead reference). */
export function resolvePool(poolId: string): ResolvedPool {
  const { namespace, path: rel } = parseId(poolId);
  const file = path.join(dataDir(namespace), 'worldgen', 'template_pool', `${rel}.json`);
  const raw = loadJson(file) as RawPool | null;
  if (!raw) return { id: poolId, exists: false, elements: [], fallback: null };

  const elements: ResolvedPoolElement[] = [];
  for (const entry of raw.elements ?? []) {
    const weight = typeof entry.weight === 'number' ? entry.weight : 1;
    const location = elementLocation(entry.element);
    if (!location) {
      // empty/feature/unknown: a terminal outcome that still consumes its weight,
      // so a slot is left bare as often as worldgen leaves it bare.
      elements.push({ structureId: entry.element?.element_type ?? EMPTY_ID, structurePath: null, weight, projection: 'rigid', empty: true });
      continue;
    }
    elements.push({
      structureId: location,
      structurePath: resolveStructurePath(location),
      weight,
      projection: entry.element?.projection ?? 'rigid',
    });
  }
  return { id: poolId, exists: true, elements, fallback: raw.fallback ?? null };
}
