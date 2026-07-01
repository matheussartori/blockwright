// Turns a resolved StructureData into Three.js meshes, one merged geometry per material (texture or
// fallback colour). The pure geometry math lives in the shared, worker-safe `geometry-core`; this
// module only WRAPS the resulting buffers into BufferGeometry + Material + Mesh, where it has the
// real GPU textures. (The world chunk-mesh worker reuses the same core.)
import * as THREE from 'three';
import type { StructureData } from '@/shared/types';
import type { LoadedTexture } from './texture-loader';
import { buildGeometryBuffers, type MaterialBuffers } from './geometry-core';

export function buildStructure(
  data: StructureData,
  textures: Map<string, LoadedTexture>,
  showJigsaw = false,
  hideShell = false,
): THREE.Group {
  // LoadedTexture is a structural superset of the core's TexInfo (frames + translucent).
  const buffers = buildGeometryBuffers(data, textures, { showJigsaw, hideShell });
  const group = new THREE.Group();
  for (const mb of buffers) group.add(new THREE.Mesh(geometryFor(mb), materialFor(mb, textures)));
  return group;
}

/** Wrap a material's transferable buffers into a Three.js BufferGeometry. Shared by the structure
 *  path and the world chunk-mesh assembly (both receive `MaterialBuffers`). */
export function geometryFor(mb: MaterialBuffers): THREE.BufferGeometry {
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(mb.positions, 3));
  geo.setAttribute('normal', new THREE.BufferAttribute(mb.normals, 3));
  geo.setAttribute('uv', new THREE.BufferAttribute(mb.uvs, 2));
  geo.setAttribute('color', new THREE.BufferAttribute(mb.colors, 3));
  return geo;
}

/** Build the Lambert material for a set of buffers, resolving the GPU texture by key. */
export function materialFor(mb: MaterialBuffers, textures: Map<string, LoadedTexture>): THREE.MeshLambertMaterial {
  // Full opaque cubes backface-cull (FrontSide) so flying inside terrain reveals cave interiors from
  // the player's side, not the outer shell's back faces; plants/panes/glass stay DoubleSide.
  const mat = new THREE.MeshLambertMaterial({ vertexColors: true, side: mb.doubleSided ? THREE.DoubleSide : THREE.FrontSide });
  const loaded = mb.textured && mb.textureKey ? textures.get(mb.textureKey) : undefined;
  if (loaded) {
    mat.map = loaded.texture;
    if (mb.translucent) {
      // Stained glass & panes: blend the partially-transparent body instead of discarding it.
      // depthWrite off so blocks behind stay visible through it.
      mat.transparent = true;
      mat.alphaTest = 0;
      mat.depthWrite = false;
    } else {
      // Opaque/cutout textures (incl. plain glass's binary alpha): hard cut.
      mat.alphaTest = 0.5;
      mat.transparent = false;
    }
  } else if (mb.color) {
    mat.color = new THREE.Color(mb.color[0], mb.color[1], mb.color[2]);
  }
  return mat;
}
