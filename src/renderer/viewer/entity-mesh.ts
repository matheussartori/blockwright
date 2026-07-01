// Builds Three.js meshes for structure ENTITIES (armor stands, item frames, mobs).
// Unlike blocks — and unlike block entities, which are synthesized from the block name —
// entities have no palette block, so they'd be invisible. The armor stand is rendered as
// the REAL Minecraft model (its vanilla box proportions + entity texture, loaded from the
// content pack / workspace, with `Pose` limb rotations applied). When the texture isn't
// available — no pack, or the file is missing — it falls back to a plain colored cube, the
// same treatment blocks get. Every other entity type gets the fallback cube too.
//
// Coordinates: a block at pos occupies its cell, so an entity's float `pos` is its world
// position (feet at `pos`). The armor stand model is authored in Minecraft's entity model
// space (pixels, Y-down, box coords relative to each bone's pivot); we map it to world
// space with the linear transform diag(-1,-1,1) — two axis flips, a proper 180° rotation
// about Z, so winding/normals stay consistent — plus a lift so the feet land on `pos.y`.
import * as THREE from 'three';
import type { ArmorStandPose, StructureEntity } from '@/shared/types';
import type { LoadedTexture } from './texture-loader';

const DEG = Math.PI / 180;
const ATLAS = 64; // entity texture size in px
const PX = 1 / 16; // model pixel → block
// Model-space Y of the feet (lowest point: leg pivot 12 + leg height 11). Lifting the
// model by this (in blocks) after the Y-flip puts the feet at world y = 0.
const FEET_MODEL_Y = 23;

type Vec3 = [number, number, number];

interface Bone {
  /** Box origin (px) relative to the bone pivot: [x, y, z]. */
  from: Vec3;
  /** Box size (px): [w, h, d]. */
  size: Vec3;
  /** Bone pivot (px) in model space. */
  pivot: Vec3;
  /** Atlas offset (px) for the box-UV unwrap. */
  tex: [number, number];
  /** Which `Pose` bone rotates this part (structural connectors have none). */
  pose?: keyof ArmorStandPose;
  /** Only drawn when ShowArms is set. */
  arm?: boolean;
  /** The stone base plate — skipped when NoBasePlate is set. */
  base?: boolean;
}

// Vanilla armor stand model. The six humanoid sticks (head/body/arms/legs) PLUS the two
// structural connectors that fill the waist — a central spine (2×6×2 @ 16,0) and a hip bar
// (8×2×2 @ 0,48) — and the stone base plate (12×1×12 @ 0,32). Sizes/pivots + atlas offsets
// were verified against the actual wood.png atlas (Y-down model space, box coords relative
// to each pivot). Without the spine + hip an armless stand shows a broken floating gap.
const BONES: Bone[] = [
  { from: [-1, -7, -1], size: [2, 7, 2], pivot: [0, 1, 0], tex: [0, 0], pose: 'head' },
  { from: [-6, 0, -1.5], size: [12, 3, 3], pivot: [0, 0, 0], tex: [0, 26], pose: 'body' },
  { from: [-1, 3, -1], size: [2, 6, 2], pivot: [0, 0, 0], tex: [16, 0] }, // spine
  { from: [-4, 9, -1], size: [8, 2, 2], pivot: [0, 0, 0], tex: [0, 48] }, // hip bar
  { from: [-2, -2, -1], size: [2, 12, 2], pivot: [-5, 2, 0], tex: [24, 0], pose: 'rightArm', arm: true },
  { from: [0, -2, -1], size: [2, 12, 2], pivot: [5, 2, 0], tex: [32, 16], pose: 'leftArm', arm: true },
  { from: [-1, 0, -1], size: [2, 11, 2], pivot: [-1.9, 12, 0], tex: [8, 0], pose: 'rightLeg' },
  { from: [-1, 0, -1], size: [2, 11, 2], pivot: [1.9, 12, 0], tex: [40, 16], pose: 'leftLeg' },
  { from: [-6, 22, -6], size: [12, 1, 12], pivot: [0, 0, 0], tex: [0, 32], base: true }, // base plate
];

// Faces as [top-left, top-right, bottom-right, bottom-left] corner indices into a flat box
// [fromX, fromY, fromZ, toX, toY, toZ] (from = 0..2, to = 3..5). Same convention as the
// block model-geometry, so outward winding is correct (normals computed after transform).
type Idx = [number, number, number];
const FACES: { key: 'up' | 'down' | 'north' | 'south' | 'west' | 'east'; corners: [Idx, Idx, Idx, Idx] }[] = [
  { key: 'up', corners: [[0, 4, 2], [3, 4, 2], [3, 4, 5], [0, 4, 5]] },
  { key: 'down', corners: [[0, 1, 5], [3, 1, 5], [3, 1, 2], [0, 1, 2]] },
  { key: 'north', corners: [[3, 4, 2], [0, 4, 2], [0, 1, 2], [3, 1, 2]] },
  { key: 'south', corners: [[0, 4, 5], [3, 4, 5], [3, 1, 5], [0, 1, 5]] },
  { key: 'west', corners: [[0, 4, 2], [0, 4, 5], [0, 1, 5], [0, 1, 2]] },
  { key: 'east', corners: [[3, 4, 5], [3, 4, 2], [3, 1, 2], [3, 1, 5]] },
];

/** The atlas UV rect (px) for one face of a box, via Minecraft's entity box-UV unwrap. */
function faceRect(size: Vec3, tex: [number, number], key: string): [number, number, number, number] {
  const [w, h, d] = size;
  const [u, v] = tex;
  const u0 = u, u1 = u + d, u2 = u + d + w, u3 = u + 2 * d + w, u4 = u + 2 * d + 2 * w;
  const v0 = v, v1 = v + d, v2 = v + d + h;
  switch (key) {
    case 'up': return [u1, v0, u2, v1];
    case 'down': return [u2, v0, u2 + w, v1];
    case 'south': return [u1, v1, u2, v2];
    case 'north': return [u3, v1, u4, v2];
    case 'west': return [u0, v1, u1, v2];
    default: return [u2, v1, u3, v2]; // east
  }
}

/** Map a box vertex (px, relative to the bone pivot) to world blocks: flip x/y so the
 *  model stands upright, scale px→blocks. Feet-lift is applied by the bone group position. */
function toWorld(x: number, y: number, z: number): Vec3 {
  return [-x * PX, -y * PX, z * PX];
}

/** Build one bone's box geometry: real box-UV into the atlas, transformed to world space. */
function boneGeometry(bone: Bone): THREE.BufferGeometry {
  const box = [bone.from[0], bone.from[1], bone.from[2], bone.from[0] + bone.size[0], bone.from[1] + bone.size[1], bone.from[2] + bone.size[2]];
  const positions: number[] = [];
  const uvs: number[] = [];
  for (const face of FACES) {
    const [x1, y1, x2, y2] = faceRect(bone.size, bone.tex, face.key);
    const uv: [number, number][] = [
      [x1 / ATLAS, 1 - y1 / ATLAS], [x2 / ATLAS, 1 - y1 / ATLAS],
      [x2 / ATLAS, 1 - y2 / ATLAS], [x1 / ATLAS, 1 - y2 / ATLAS],
    ];
    const verts = face.corners.map((c) => toWorld(box[c[0]], box[c[1]], box[c[2]]));
    for (const i of [0, 1, 2, 0, 2, 3]) {
      positions.push(verts[i][0], verts[i][1], verts[i][2]);
      uvs.push(uv[i][0], uv[i][1]);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geo.computeVertexNormals();
  return geo;
}

/** The world-space quaternion for a bone's `Pose` Euler (degrees, Minecraft model frame).
 *  Conjugated by the 180°-about-Z model→world map: R = Rz(θz)·Ry(−θy)·Rx(−θx), MC's ZYX order. */
function poseQuat(euler: Vec3 | undefined): THREE.Quaternion | null {
  if (!euler) return null;
  const [rx, ry, rz] = euler;
  const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), rz * DEG);
  q.multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), -ry * DEG));
  q.multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), -rx * DEG));
  return q;
}

/** The real armor stand: textured limbs (posed) + a plain stone base plate, feet at y=0. */
function buildArmorStand(e: StructureEntity, tex: LoadedTexture): THREE.Group {
  const model = new THREE.Group();
  const mat = new THREE.MeshLambertMaterial({ map: tex.texture, side: THREE.DoubleSide, alphaTest: 0.5 });
  const pose = e.pose ?? {};
  for (const bone of BONES) {
    if (bone.arm && !e.showArms) continue;
    if (bone.base && e.noBasePlate) continue;
    const group = new THREE.Group();
    // Bone pivot in world space (same flip + feet-lift as the geometry).
    group.position.set(-bone.pivot[0] * PX, FEET_MODEL_Y * PX - bone.pivot[1] * PX, bone.pivot[2] * PX);
    const q = bone.pose ? poseQuat(pose[bone.pose]) : null;
    if (q) group.quaternion.copy(q);
    group.add(new THREE.Mesh(boneGeometry(bone), mat));
    model.add(group);
  }
  if (e.small) model.scale.setScalar(0.5); // half size about the feet (y=0)
  return model;
}

/** A plain colored cube at the entity's cell — the block fallback, for entities with no
 *  real model or a missing texture. */
function buildFallbackCube(color: Vec3): THREE.Mesh {
  const mat = new THREE.MeshLambertMaterial({ color: new THREE.Color(color[0], color[1], color[2]) });
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), mat);
  mesh.position.set(0.5, 0.5, 0.5); // centre of the cell (added at the floored pos)
  return mesh;
}

/** Build one group holding a mesh per entity, each placed at its position + yaw. `textures` is the
 *  viewer's loaded texture map (so the armor stand can sample its atlas). Positions are taken from
 *  each entity's `pos` verbatim — the caller's group frame decides whether those are structure-local
 *  (single structure) or world coords (a streamed world chunk). */
export function buildEntities(entities: StructureEntity[], textures: Map<string, LoadedTexture>): THREE.Group {
  const group = new THREE.Group();
  for (const e of entities) {
    const root = new THREE.Group();
    const tex = e.textureKey ? textures.get(e.textureKey) : undefined;
    if (e.id === 'minecraft:armor_stand' && tex) {
      root.position.set(e.pos[0], e.pos[1], e.pos[2]);
      // Minecraft yaw 0 faces +Z (south) and increases clockwise; negate for Three's CCW y.
      root.rotation.y = -e.rotation * DEG;
      root.add(buildArmorStand(e, tex));
    } else {
      root.position.set(Math.floor(e.pos[0]), Math.floor(e.pos[1]), Math.floor(e.pos[2]));
      root.add(buildFallbackCube(e.color));
    }
    group.add(root);
  }
  return group;
}
