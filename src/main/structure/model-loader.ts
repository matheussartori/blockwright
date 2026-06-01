// Loads Minecraft block models from the content pack: walking the parent chain,
// resolving texture references, and flattening into renderable ResolvedModels.
import path from 'node:path';
import type {
  FaceDir,
  ModelElement,
  ModelFace,
  ResolvedModel,
} from '@/shared/types';
import { assetsDir, loadJson } from './content-pack';

export const FACES: FaceDir[] = ['down', 'up', 'north', 'south', 'east', 'west'];

/** Strip the "minecraft:" namespace from a resource reference. */
export function bare(ref: string): string {
  return ref.replace(/^minecraft:/, '');
}

interface RawModel {
  textures: Record<string, string>;
  elements: RawElement[] | undefined;
}
interface RawElement {
  from: [number, number, number];
  to: [number, number, number];
  rotation?: ModelElement['rotation'];
  faces?: Record<string, { texture?: string; uv?: number[]; rotation?: number; tintindex?: number }>;
}

const modelCache = new Map<string, RawModel | null>();

/** Walk the parent chain, merging textures (child wins) and inheriting elements. */
function loadModel(ref: string, seen = new Set<string>()): RawModel | null {
  const key = bare(ref);
  if (modelCache.has(key)) return modelCache.get(key) ?? null;
  if (seen.has(key)) return null;
  seen.add(key);

  const file = path.join(assetsDir(), 'models', `${key}.json`);
  const json = loadJson(file) as
    | { parent?: string; textures?: Record<string, string>; elements?: RawElement[] }
    | null;
  if (!json) {
    modelCache.set(key, null);
    return null;
  }

  const parent = json.parent ? loadModel(json.parent, seen) : null;
  const resolved: RawModel = {
    textures: { ...(parent?.textures ?? {}), ...(json.textures ?? {}) },
    elements: json.elements ?? parent?.elements,
  };
  modelCache.set(key, resolved);
  return resolved;
}

/** Follow "#ref" texture indirection to a concrete texture key. */
function resolveTexture(ref: string | undefined, textures: Record<string, string>): string | null {
  let cur = ref;
  for (let i = 0; i < 10 && cur; i++) {
    if (!cur.startsWith('#')) return bare(cur);
    cur = textures[cur.slice(1)];
  }
  return null;
}

/** Convert a raw model + blockstate transform into a renderable ResolvedModel. */
export function buildResolvedModel(
  modelRef: string,
  transform: { x?: number; y?: number; uvlock?: boolean },
): ResolvedModel | null {
  const raw = loadModel(modelRef);
  if (!raw || !raw.elements) return null;

  const elements: ModelElement[] = raw.elements.map((el) => {
    const faces: Partial<Record<FaceDir, ModelFace>> = {};
    for (const dir of FACES) {
      const f = el.faces?.[dir];
      if (!f) continue;
      faces[dir] = {
        texture: resolveTexture(f.texture, raw.textures),
        uv: f.uv && f.uv.length === 4 ? (f.uv as [number, number, number, number]) : undefined,
        rotation: f.rotation,
        tintindex: f.tintindex,
      };
    }
    return { from: el.from, to: el.to, rotation: el.rotation, faces };
  });

  return { elements, x: transform.x, y: transform.y, uvlock: transform.uvlock };
}

/** Collect the unique texture keys referenced by a set of models. */
export function collectTextures(models: ResolvedModel[], into: Set<string>): void {
  for (const m of models) {
    for (const el of m.elements) {
      for (const dir of FACES) {
        const t = el.faces[dir]?.texture;
        if (t) into.add(t);
      }
    }
  }
}
