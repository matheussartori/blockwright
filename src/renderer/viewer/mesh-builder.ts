// Turns a resolved StructureData into Three.js meshes, building one merged
// geometry per material (texture or fallback color) for efficient rendering.
import * as THREE from 'three';
import type { StructureData } from '@/shared/types';
import type { LoadedTexture } from './texture-loader';
import { addFallbackCube, addModel, type Accum, type GetAccum } from './model-geometry';

export function buildStructure(
  data: StructureData,
  textures: Map<string, LoadedTexture>,
): THREE.Group {
  const accums = new Map<string, Accum>();

  const getAccum: GetAccum = (key, textured, tex, color) => {
    let a = accums.get(key);
    if (!a) {
      a = { positions: [], normals: [], uvs: [], colors: [], textured, texture: tex, color };
      accums.set(key, a);
    }
    return a;
  };

  for (const block of data.blocks) {
    const entry = data.palette[block.state];
    if (!entry || entry.air || entry.models.length === 0) {
      if (entry && !entry.air) {
        addFallbackCube(getAccum(`c:${entry.color.join(',')}`, false, undefined, entry.color), block.pos);
      }
      continue;
    }
    for (const model of entry.models) {
      addModel(model, block.pos, entry.color, textures, getAccum);
    }
  }

  const group = new THREE.Group();
  for (const a of accums.values()) {
    if (a.positions.length === 0) continue;
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(a.positions, 3));
    geo.setAttribute('normal', new THREE.Float32BufferAttribute(a.normals, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(a.uvs, 2));
    geo.setAttribute('color', new THREE.Float32BufferAttribute(a.colors, 3));

    const mat = new THREE.MeshLambertMaterial({
      vertexColors: true,
      side: THREE.DoubleSide,
    });
    if (a.textured && a.texture) {
      mat.map = a.texture;
      mat.alphaTest = 0.5;
      mat.transparent = false;
    } else if (a.color) {
      mat.color = new THREE.Color(a.color[0], a.color[1], a.color[2]);
    }
    group.add(new THREE.Mesh(geo, mat));
  }
  return group;
}
