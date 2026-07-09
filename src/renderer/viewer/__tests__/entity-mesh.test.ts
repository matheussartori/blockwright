// The data-driven mob mesh builder: real models assemble at the right size and place
// (feet on the ground plane), scale/baby apply, and a missing texture falls back to the
// colored cube — the same treatment blocks get.
import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import type { StructureEntity } from '@/shared/types';
import { buildEntities } from '../entity-mesh';

function textures(keys: string[]): Map<string, { texture: THREE.Texture }> {
  return new Map(keys.map((k) => [k, { texture: new THREE.Texture() }]));
}

function entity(overrides: Partial<StructureEntity>): StructureEntity {
  return {
    id: 'minecraft:wolf',
    pos: [0, 0, 0],
    rotation: 0,
    color: [1, 0, 0],
    textureKey: null,
    ...overrides,
  };
}

function worldBox(group: THREE.Group): THREE.Box3 {
  group.updateMatrixWorld(true);
  return new THREE.Box3().setFromObject(group);
}

const WOLF_TEX = 'minecraft/entity/wolf/wolf';

describe('buildEntities mob models', () => {
  it('assembles a wolf with its feet on the ground and vanilla proportions', () => {
    const group = buildEntities(
      [entity({ mob: [{ model: 'wolf', textureKey: WOLF_TEX }] })],
      textures([WOLF_TEX]) as never,
    );
    const box = worldBox(group);
    expect(box.min.y).toBeCloseTo(0, 1);
    expect(box.max.y).toBeGreaterThan(0.7); // ears/head
    expect(box.max.y).toBeLessThan(1.2);
    // Longer than wide: head + body + tail span z after the yaw-0 facing.
    expect(box.max.z - box.min.z).toBeGreaterThan(box.max.x - box.min.x);
  });

  it('applies per-type scale and the baby half-scale about the feet', () => {
    const layers = [{ model: 'slime', textureKey: 'minecraft/entity/slime/slime' }];
    const tex = textures(['minecraft/entity/slime/slime']);
    const normal = worldBox(buildEntities([entity({ mob: layers })], tex as never));
    const scaled = worldBox(buildEntities([entity({ mob: layers, scale: 2 })], tex as never));
    const baby = worldBox(buildEntities([entity({ mob: layers, baby: true })], tex as never));
    expect(scaled.max.y).toBeCloseTo(normal.max.y * 2, 4);
    expect(baby.max.y).toBeCloseTo(normal.max.y / 2, 4);
    // Scaling happens about the feet plane (y=0), never sinking the model.
    expect(scaled.min.y).toBeCloseTo(normal.min.y * 2, 4);
  });

  it('falls back to the colored cube when the layer texture never loaded', () => {
    const group = buildEntities([entity({ mob: [{ model: 'wolf', textureKey: WOLF_TEX }] })], new Map() as never);
    const meshes: THREE.Mesh[] = [];
    group.traverse((o) => {
      if (o instanceof THREE.Mesh) meshes.push(o);
    });
    expect(meshes).toHaveLength(1);
    expect(meshes[0].geometry).toBeInstanceOf(THREE.BoxGeometry);
  });
});
