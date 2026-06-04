// Enumerates the placeable blocks in the active content — the bundled vanilla
// pack (the `minecraft` namespace) plus the active mod workspace's own namespace
// — and resolves a representative texture for each, for the Block Catalog
// browser. This gives the app (and the user) a concrete, namespace-aware list of
// every block it can render, and is the seed for future inspector ↔ block links
// and mod-block-aware generation.
import fs from 'node:fs';
import path from 'node:path';
import type { CatalogBlock, PaletteEntry, StructureData } from '@/shared/types';
import { assetsDir, getActiveWorkspace, hasContent, loadJson } from '../assets/content-pack';
import { parseRef, buildResolvedModel, collectTextures } from '../assets/model-loader';
import { isAir, resolveBlock } from '../assets/blockstate-resolver';
import { fallbackColor } from '../assets/fallback-color';

interface VariantModel {
  model: string;
  x?: number;
  y?: number;
  uvlock?: boolean;
}
interface BlockstateJson {
  variants?: Record<string, VariantModel | VariantModel[]>;
  multipart?: { apply: VariantModel | VariantModel[] }[];
}

const first = <T>(v: T | T[]): T => (Array.isArray(v) ? v[0] : v);

/** Resolve a single representative texture key ("namespace/path") for a block by
 *  reading its blockstate, taking the first variant/multipart model, and picking
 *  the most icon-worthy face texture. Returns null when nothing resolves (e.g.
 *  particle-only models like fluids/entities) — the UI falls back to a colour. */
function representativeTexture(name: string): string | null {
  const { namespace, path: id } = parseRef(name);
  const state = loadJson(path.join(assetsDir(namespace), 'blockstates', `${id}.json`)) as BlockstateJson | null;
  if (!state) return null;

  let v: VariantModel | undefined;
  if (state.variants) {
    const entry = Object.values(state.variants)[0];
    if (entry) v = first(entry);
  } else if (state.multipart) {
    const part = state.multipart.find((p) => p.apply);
    if (part) v = first(part.apply);
  }
  if (!v?.model) return null;

  const model = buildResolvedModel(v.model, v);
  if (!model) return null;
  const textures = new Set<string>();
  collectTextures([model], textures);
  const keys = [...textures];
  if (keys.length === 0) return null;
  // Prefer a texture named after the block, then a "side"/"all" face (reads best
  // as a flat icon), else just the first one referenced.
  return (
    keys.find((k) => k.endsWith(`/${id}`)) ??
    keys.find((k) => /(_side|_all|\/all|\/side)$/.test(k)) ??
    keys[0]
  );
}

/** Every block in one namespace = one blockstate JSON each, sorted by id. */
function listNamespace(namespace: string): CatalogBlock[] {
  const dir = path.join(assetsDir(namespace), 'blockstates');
  let files: string[];
  try {
    files = fs.readdirSync(dir);
  } catch {
    return [];
  }
  const out: CatalogBlock[] = [];
  for (const file of files) {
    if (!file.endsWith('.json')) continue;
    const block = file.slice(0, -5);
    const id = `${namespace}:${block}`;
    out.push({ id, namespace, block, texture: representativeTexture(id) });
  }
  return out.sort((a, b) => a.block.localeCompare(b.block));
}

// Memoized per content state (vanilla, or vanilla + a specific workspace), since
// resolving every block's texture walks a lot of models. The key changes when the
// workspace does, and the model/json caches it reads are cleared on that switch,
// so the rebuild always reflects the live content.
let cache: { key: string; blocks: CatalogBlock[] } | null = null;

/** All placeable blocks across the vanilla pack and the active workspace namespace. */
export function listCatalog(): CatalogBlock[] {
  const ws = getActiveWorkspace();
  const key = ws ? `${ws.namespace}@${ws.root}` : 'vanilla';
  if (cache && cache.key === key) return cache.blocks;
  const blocks = [
    ...listNamespace('minecraft'),
    ...(ws && ws.namespace !== 'minecraft' ? listNamespace(ws.namespace) : []),
  ];
  cache = { key, blocks };
  return blocks;
}

/** Resolve one block into a minimal 1×1×1 StructureData so the renderer can show
 *  it in the catalog's 3D preview, reusing the normal mesh-building path. */
export function previewBlock(id: string): StructureData {
  const { namespace, path: name } = parseRef(id);
  const fullName = `${namespace}:${name}`;
  const air = isAir(fullName);
  const canResolve = hasContent() || getActiveWorkspace() !== null;
  const models = !air && canResolve ? resolveBlock(fullName) : [];
  const entry: PaletteEntry = {
    name: fullName,
    properties: {},
    models,
    color: fallbackColor(fullName),
    air,
  };
  const textures = new Set<string>();
  collectTextures(models, textures);
  return {
    name: fullName,
    path: '',
    size: [1, 1, 1],
    palette: [entry],
    blocks: [{ state: 0, pos: [0, 0, 0] }],
    textures: [...textures],
    hasContent: hasContent(),
    blockCount: air ? 0 : 1,
    jigsaws: [],
  };
}
