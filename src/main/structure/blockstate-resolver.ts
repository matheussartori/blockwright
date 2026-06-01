// Resolves a block (name + properties) into renderable models by reading its
// blockstate definition (variants or multipart) from the content pack.
import path from 'node:path';
import type { ResolvedModel } from '@/shared/types';
import { assetsDir, loadJson } from './content-pack';
import { buildResolvedModel, parseRef } from './model-loader';
import { resolveBlockEntity } from './block-entity';

const AIR = new Set([
  'minecraft:air',
  'minecraft:cave_air',
  'minecraft:void_air',
  'minecraft:structure_void',
]);

export function isAir(name: string): boolean {
  return AIR.has(name);
}

interface VariantModel {
  model: string;
  x?: number;
  y?: number;
  uvlock?: boolean;
}

function pickVariant(value: VariantModel | VariantModel[]): VariantModel {
  return Array.isArray(value) ? value[0] : value;
}

/** Does a variant key like "facing=east,half=bottom" match the block properties? */
function variantMatches(key: string, props: Record<string, string>): boolean {
  if (key === '') return true;
  return key.split(',').every((pair) => {
    const [k, v] = pair.split('=');
    return props[k] === v;
  });
}

type MultipartWhen = Record<string, string> & {
  OR?: Record<string, string>[];
  AND?: Record<string, string>[];
};

function whenMatches(when: MultipartWhen | undefined, props: Record<string, string>): boolean {
  if (!when) return true;
  if (when.OR) return when.OR.some((w) => whenMatches(w, props));
  if (when.AND) return when.AND.every((w) => whenMatches(w, props));
  return Object.entries(when).every(([k, v]) => {
    if (k === 'OR' || k === 'AND') return true;
    return String(v).split('|').includes(props[k]);
  });
}

/** Resolve a block (name + properties) into one or more renderable models. */
export function resolveBlock(
  name: string,
  properties: Record<string, string> = {},
): ResolvedModel[] {
  // Block entities (chests) bypass the blockstate/model path — their vanilla
  // model is particle-only, so we synthesize their geometry from the atlas.
  const entity = resolveBlockEntity(name, properties);
  if (entity) return entity;

  const { namespace, path: key } = parseRef(name);
  const file = path.join(assetsDir(namespace), 'blockstates', `${key}.json`);
  const state = loadJson(file) as
    | { variants?: Record<string, VariantModel | VariantModel[]>; multipart?: { when?: MultipartWhen; apply: VariantModel | VariantModel[] }[] }
    | null;
  if (!state) return [];

  const out: ResolvedModel[] = [];

  if (state.variants) {
    const entry = Object.entries(state.variants).find(([k]) => variantMatches(k, properties));
    if (entry) {
      const v = pickVariant(entry[1]);
      const m = buildResolvedModel(v.model, v);
      if (m) out.push(m);
    }
  } else if (state.multipart) {
    for (const part of state.multipart) {
      if (!whenMatches(part.when, properties)) continue;
      const v = pickVariant(part.apply);
      const m = buildResolvedModel(v.model, v);
      if (m) out.push(m);
    }
  }
  return out;
}
