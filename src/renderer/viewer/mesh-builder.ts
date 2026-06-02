// Turns a resolved StructureData into Three.js meshes, building one merged
// geometry per material (texture or fallback color) for efficient rendering.
import * as THREE from 'three';
import type { StructureData } from '@/shared/types';
import type { LoadedTexture } from './texture-loader';
import { addFallbackCube, addModel, type Accum, type GetAccum } from './model-geometry';

/** Blocks that are worldgen markers rather than real geometry. Hidden unless the
 *  matching setting is on; vanilla replaces a jigsaw with its `final_state`. */
const JIGSAW_NAME = 'minecraft:jigsaw';

export function buildStructure(
  data: StructureData,
  textures: Map<string, LoadedTexture>,
  showJigsaw = false,
  hideShell = false,
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

  // When hiding the shell, find the occupied bounding box once so we can drop any
  // block sitting on one of its six boundary planes — the piece's outer "casco".
  const bounds = hideShell ? occupiedBounds(data) : null;

  for (const block of data.blocks) {
    const entry = data.palette[block.state];
    if (entry && !showJigsaw && entry.name === JIGSAW_NAME) continue;
    if (bounds && isShell(block.pos, bounds)) continue;
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

/** Min/max of the piece's non-air blocks — the box whose surface is the shell.
 *  We use the actual occupied extent (not the declared `size`) so air padding
 *  around a structure doesn't push the shell plane out into empty space. */
type Bounds = { min: [number, number, number]; max: [number, number, number] };
function occupiedBounds(data: StructureData): Bounds | null {
  const min: [number, number, number] = [Infinity, Infinity, Infinity];
  const max: [number, number, number] = [-Infinity, -Infinity, -Infinity];
  let any = false;
  for (const block of data.blocks) {
    const entry = data.palette[block.state];
    if (!entry || entry.air) continue;
    any = true;
    for (let i = 0; i < 3; i++) {
      if (block.pos[i] < min[i]) min[i] = block.pos[i];
      if (block.pos[i] > max[i]) max[i] = block.pos[i];
    }
  }
  return any ? { min, max } : null;
}

/** A block is shell if it lies on any of the bounding box's six boundary planes. */
function isShell(pos: [number, number, number], b: Bounds): boolean {
  return (
    pos[0] === b.min[0] || pos[0] === b.max[0] ||
    pos[1] === b.min[1] || pos[1] === b.max[1] ||
    pos[2] === b.min[2] || pos[2] === b.max[2]
  );
}
