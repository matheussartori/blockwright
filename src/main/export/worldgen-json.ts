// The four worldgen JSON files that turn a bare `.nbt` into a structure Minecraft
// generates in-world. Pure builders (no fs), unit-tested, so the shapes stay correct.
// Targets the 1.21 jigsaw format the rest of the app is validated against. A generated
// build is a single self-contained piece, so the pool has one rigid element and no
// connectors — the simplest thing that reliably places.
import type { FileKind, WorldgenOptions } from '@/shared/domain/worldgen';

/** A small deterministic positive salt from the resource id, so two structures in one
 *  pack don't share a placement grid (which would make them mutually exclusive). */
export function saltFor(id: string): number {
  let h = 2166136261;
  for (let i = 0; i < id.length; i++) {
    h ^= id.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  // ≥1: 0 is Minecraft's "no salt" sentinel, so keep the placement salt out of it.
  return (Math.abs(h | 0) % 2147483646) + 1;
}

/** `worldgen/structure/<name>.json` — the jigsaw structure definition. `spawn_overrides`
 *  is a REQUIRED field in 1.21's structure codec (`.fieldOf`, not optional), so it must be
 *  present even when empty, or the datapack fails to load. */
export function structureJson(namespace: string, name: string, w: WorldgenOptions): unknown {
  return {
    type: 'minecraft:jigsaw',
    biomes: `#${namespace}:has_structure/${name}`,
    step: 'surface_structures',
    spawn_overrides: {},
    terrain_adaptation: w.terrainAdaptation,
    start_pool: `${namespace}:${name}/start`,
    size: 1,
    start_height: { absolute: 0 },
    project_start_to_heightmap: 'WORLD_SURFACE_WG',
    max_distance_from_center: 80,
    use_expansion_hack: false,
  };
}

/** `worldgen/template_pool/<name>/start.json` — the single-element start pool. */
export function templatePoolJson(namespace: string, name: string): unknown {
  return {
    name: `${namespace}:${name}/start`,
    fallback: 'minecraft:empty',
    elements: [
      {
        weight: 1,
        element: {
          element_type: 'minecraft:single_pool_element',
          location: `${namespace}:${name}`,
          processors: 'minecraft:empty',
          projection: 'rigid',
        },
      },
    ],
  };
}

/** `worldgen/structure_set/<name>.json` — where/how often it spawns. */
export function structureSetJson(namespace: string, name: string, w: WorldgenOptions): unknown {
  return {
    structures: [{ structure: `${namespace}:${name}`, weight: 1 }],
    placement: {
      type: 'minecraft:random_spread',
      spacing: w.spacing,
      separation: w.separation,
      salt: saltFor(`${namespace}:${name}`),
    },
  };
}

/** `tags/worldgen/biome/has_structure/<name>.json` — the biomes it may spawn in. */
export function biomeTagJson(w: WorldgenOptions): unknown {
  return { values: w.biomes };
}

/** The JSON object for a planned worldgen file (everything but the `.nbt` copy). */
export function jsonFor(kind: FileKind, namespace: string, name: string, w: WorldgenOptions): unknown {
  switch (kind) {
    case 'structure':
      return structureJson(namespace, name, w);
    case 'template_pool':
      return templatePoolJson(namespace, name);
    case 'structure_set':
      return structureSetJson(namespace, name, w);
    case 'biome_tag':
      return biomeTagJson(w);
    case 'nbt':
      return null; // copied, not serialized
  }
}
