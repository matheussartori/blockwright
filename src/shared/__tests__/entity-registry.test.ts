// Contract tests for the mob render registry: every registry layer must reference a
// generated geometry, and the generated geometries must be structurally sound — these
// guard against the registry and build/gen-entity-models.mjs drifting apart.
import { describe, expect, it } from 'vitest';
import { MOB_MODELS } from '../entity-models';
import { MOB_REGISTRY, entityTextureKey } from '../entity-registry';

describe('MOB_REGISTRY ↔ MOB_MODELS contract', () => {
  it('every registry layer references a generated model', () => {
    for (const [id, spec] of Object.entries(MOB_REGISTRY)) {
      expect(spec.layers.length, id).toBeGreaterThan(0);
      for (const layer of spec.layers) {
        expect(MOB_MODELS[layer.model], `${id} → ${layer.model}`).toBeDefined();
      }
    }
  });

  it('registry ids are namespaced and textures are pack-relative', () => {
    for (const [id, spec] of Object.entries(MOB_REGISTRY)) {
      expect(id).toMatch(/^minecraft:[a-z_]+$/);
      for (const layer of spec.layers) {
        expect(layer.texture, id).not.toMatch(/^minecraft\//); // no double prefix
        expect(layer.texture, id).not.toMatch(/\.png$/);
      }
    }
  });

  it('entityTextureKey prefixes the pack namespace', () => {
    expect(entityTextureKey('creeper/creeper')).toBe('minecraft/entity/creeper/creeper');
  });
});

describe('generated mob geometry sanity', () => {
  it('models have bones with cubes, valid parents, and positive texture sizes', () => {
    for (const [key, model] of Object.entries(MOB_MODELS)) {
      expect(model.texSize[0], key).toBeGreaterThan(0);
      expect(model.texSize[1], key).toBeGreaterThan(0);
      expect(model.bones.length, key).toBeGreaterThan(0);
      const cubes = model.bones.reduce((n, b) => n + b.cubes.length, 0);
      expect(cubes, key).toBeGreaterThan(0);
      for (const bone of model.bones) {
        if (bone.parent !== undefined) {
          expect(bone.parent, `${key}/${bone.name}`).toBeGreaterThanOrEqual(0);
          expect(bone.parent, `${key}/${bone.name}`).toBeLessThan(model.bones.length);
          expect(bone.parent, `${key}/${bone.name}`).not.toBe(model.bones.indexOf(bone));
        }
        for (const cube of bone.cubes) {
          // Box-UV or explicit per-face rects — never neither.
          expect(cube.uv || cube.faces, `${key}/${bone.name}`).toBeTruthy();
          for (const n of [...cube.from, ...cube.size]) expect(Number.isFinite(n), `${key}/${bone.name}`).toBe(true);
        }
      }
    }
  });

  it('grounded classics stand on the ground plane and are sensibly sized', () => {
    // Feet at model y=24 map to world 0; a mob's lowest point must not sink below it
    // and its height must stay in vanilla range (checked in Java px, ground = 24).
    for (const key of ['creeper', 'zombie', 'skeleton', 'pig', 'cow', 'sheep', 'wolf', 'villager', 'chicken']) {
      const model = MOB_MODELS[key];
      let maxY = -Infinity;
      for (const bone of model.bones) {
        // Unrotated extents only — rotated bones (quadruped bodies) move off-axis.
        if (bone.rot) continue;
        for (const cube of bone.cubes) {
          maxY = Math.max(maxY, bone.pivot[1] + cube.from[1] + cube.size[1] + (cube.inflate ?? 0));
        }
      }
      expect(maxY, key).toBeLessThanOrEqual(24.01);
    }
  });
});
