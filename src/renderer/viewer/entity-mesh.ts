// Builds Three.js meshes for structure ENTITIES (armor stands, mobs, item frames).
// Unlike blocks — and unlike block entities, which are synthesized from the block name —
// entities have no palette block, so they'd be invisible. Two real-model paths exist:
//
//  · The armor stand — hand-written vanilla box proportions + entity texture, with
//    `Pose` limb rotations and Small/ShowArms/NoBasePlate applied.
//  · Every vanilla mob in MOB_REGISTRY — data-driven box models (shared/entity-models.ts,
//    generated from the same geometry Java hardcodes) drawn with the layer textures the
//    main process resolved from the content pack (wolf coats, villager professions,
//    tinted sheep wool, the slime's translucent outer jelly, …).
//
// When no texture is available — no pack, or the file is missing — an entity falls back
// to a plain colored cube, the same treatment blocks get.
//
// Coordinates: a block at pos occupies its cell, so an entity's float `pos` is its world
// position (feet at `pos`). Models are authored in Minecraft's entity model space
// (pixels, Y-down, box coords relative to each bone's pivot); we map them to world
// space with the linear transform diag(-1,-1,1) — two axis flips, a proper 180° rotation
// about Z, so winding/normals stay consistent — plus a lift so the feet land on `pos.y`.
// Mobs are authored facing -z and vanilla renders them at yaw+180°, so the mob root adds
// the half turn (the armor stand is x/z-symmetric; its historical path stays as verified).
import * as THREE from 'three';
import type { ArmorStandPose, StructureEntity } from '@/shared/types';
import { MOB_MODELS, type MobCube, type MobModel } from '@/shared/entity-models';
import type { LoadedTexture } from './texture-loader';

const DEG = Math.PI / 180;
const ATLAS = 64; // armor stand entity texture size in px
const PX = 1 / 16; // model pixel → block
// Model-space Y of the armor stand's feet (lowest point: leg pivot 12 + leg height 11).
// Lifting the model by this (in blocks) after the Y-flip puts the feet at world y = 0.
const FEET_MODEL_Y = 23;
// Mob models use the standard Java convention: the ground plane is model y = 24.
const MOB_FEET_Y = 24;

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
type FaceKey = 'up' | 'down' | 'north' | 'south' | 'west' | 'east';
const FACES: { key: FaceKey; corners: [Idx, Idx, Idx, Idx] }[] = [
  { key: 'up', corners: [[0, 4, 2], [3, 4, 2], [3, 4, 5], [0, 4, 5]] },
  { key: 'down', corners: [[0, 1, 5], [3, 1, 5], [3, 1, 2], [0, 1, 2]] },
  { key: 'north', corners: [[3, 4, 2], [0, 4, 2], [0, 1, 2], [3, 1, 2]] },
  { key: 'south', corners: [[0, 4, 5], [3, 4, 5], [3, 1, 5], [0, 1, 5]] },
  { key: 'west', corners: [[0, 4, 2], [0, 4, 5], [0, 1, 5], [0, 1, 2]] },
  { key: 'east', corners: [[3, 4, 5], [3, 4, 2], [3, 1, 2], [3, 1, 5]] },
];

/** The atlas UV rect (px) for one face of a box, via Minecraft's entity box-UV unwrap.
 *  Keys are the FACES-table keys, which live in JAVA model space: java -z is the model's
 *  FRONT (the atlas front region lands on 'north'), and the y-flip to world puts java
 *  maxY ('up') at the world BOTTOM, so 'up' samples the atlas DOWN region and vice
 *  versa. `mirror` swaps the two side regions (each face is then U-flipped). */
function faceRect(size: Vec3, tex: [number, number], key: string, mirror = false): [number, number, number, number] {
  const [w, h, d] = size;
  const [u, v] = tex;
  const u0 = u, u1 = u + d, u2 = u + d + w, u3 = u + 2 * d + w, u4 = u + 2 * d + 2 * w;
  const v0 = v, v1 = v + d, v2 = v + d + h;
  if (mirror && (key === 'west' || key === 'east')) key = key === 'west' ? 'east' : 'west';
  switch (key) {
    case 'up': return [u2, v0, u2 + w, v1]; // world bottom → atlas "down" region
    case 'down': return [u1, v0, u2, v1]; // world top → atlas "up" region
    case 'north': return [u1, v1, u2, v2]; // model front (java -z) → atlas front region
    case 'south': return [u3, v1, u4, v2]; // model back → atlas back region
    case 'west': return [u0, v1, u1, v2];
    default: return [u2, v1, u3, v2]; // east
  }
}

/** Map a box vertex (px, relative to the bone pivot) to world blocks: flip x/y so the
 *  model stands upright, scale px→blocks. Feet-lift is applied by the bone group position. */
function toWorld(x: number, y: number, z: number): Vec3 {
  return [-x * PX, -y * PX, z * PX];
}

/** Append one box's six faces to flat position/uv arrays. `rects` gives each face's atlas
 *  rect in px; `texW/texH` normalize; `mirror` flips each face's U; `inflate` grows the box
 *  (UVs keep the uninflated size, like vanilla). */
function pushBox(
  positions: number[],
  uvs: number[],
  from: Vec3,
  size: Vec3,
  rects: (key: FaceKey) => [number, number, number, number] | null,
  texW: number,
  texH: number,
  mirror: boolean,
  inflate: number,
): void {
  const box = [
    from[0] - inflate, from[1] - inflate, from[2] - inflate,
    from[0] + size[0] + inflate, from[1] + size[1] + inflate, from[2] + size[2] + inflate,
  ];
  for (const face of FACES) {
    const rect = rects(face.key);
    if (!rect) continue;
    const [y1, y2] = [rect[1], rect[3]];
    let [x1, x2] = [rect[0], rect[2]];
    if (mirror) [x1, x2] = [x2, x1];
    const uv: [number, number][] = [
      [x1 / texW, 1 - y1 / texH], [x2 / texW, 1 - y1 / texH],
      [x2 / texW, 1 - y2 / texH], [x1 / texW, 1 - y2 / texH],
    ];
    const verts = face.corners.map((c) => toWorld(box[c[0]], box[c[1]], box[c[2]]));
    for (const i of [0, 1, 2, 0, 2, 3]) {
      positions.push(verts[i][0], verts[i][1], verts[i][2]);
      uvs.push(uv[i][0], uv[i][1]);
    }
  }
}

/** Build one armor-stand bone's box geometry: real box-UV into the 64px atlas. */
function boneGeometry(bone: Bone): THREE.BufferGeometry {
  const positions: number[] = [];
  const uvs: number[] = [];
  pushBox(positions, uvs, bone.from, bone.size, (key) => faceRect(bone.size, bone.tex, key), ATLAS, ATLAS, false, 0);
  return bufferGeometry(positions, uvs);
}

/** One mob bone's geometry: all its cubes (box-UV or explicit per-face rects). */
function mobBoneGeometry(cubes: MobCube[], texW: number, texH: number): THREE.BufferGeometry {
  const positions: number[] = [];
  const uvs: number[] = [];
  for (const cube of cubes) {
    const rects = cube.faces
      ? (key: FaceKey) => cube.faces?.[key] ?? null
      : (key: FaceKey) => faceRect(cube.size, cube.uv ?? [0, 0], key, cube.mirror);
    pushBox(positions, uvs, cube.from, cube.size, rects, texW, texH, !!cube.mirror, cube.inflate ?? 0);
  }
  return bufferGeometry(positions, uvs);
}

function bufferGeometry(positions: number[], uvs: number[]): THREE.BufferGeometry {
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geo.computeVertexNormals();
  return geo;
}

/** The world-space quaternion for a bone's Euler rotation (degrees, Minecraft model frame).
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

/** One layer of a mob: the model's bone tree meshed with that layer's texture/material. */
function buildMobLayer(model: MobModel, mat: THREE.Material): THREE.Group {
  const layer = new THREE.Group();
  const [texW, texH] = model.texSize;
  // Two passes — a child bone may be declared before its parent.
  const groups = model.bones.map(() => new THREE.Group());
  model.bones.forEach((bone, i) => {
    const g = groups[i];
    g.name = bone.name;
    const world: Vec3 = [-bone.pivot[0] * PX, MOB_FEET_Y * PX - bone.pivot[1] * PX, bone.pivot[2] * PX];
    if (bone.parent !== undefined && model.bones[bone.parent]) {
      const p = model.bones[bone.parent].pivot;
      const pw: Vec3 = [-p[0] * PX, MOB_FEET_Y * PX - p[1] * PX, p[2] * PX];
      g.position.set(world[0] - pw[0], world[1] - pw[1], world[2] - pw[2]);
      groups[bone.parent].add(g);
    } else {
      g.position.set(world[0], world[1], world[2]);
      layer.add(g);
    }
    const q = poseQuat(bone.rot);
    if (q) g.quaternion.copy(q);
    if (bone.cubes.length) g.add(new THREE.Mesh(mobBoneGeometry(bone.cubes, texW, texH), mat));
  });
  return layer;
}

/** A mob's full model: every resolved layer whose texture is loaded, scaled (per-type ×
 *  slime Size × baby) about the feet. Null when no layer could be drawn (→ fallback cube). */
function buildMob(e: StructureEntity, textures: Map<string, LoadedTexture>): THREE.Group | null {
  const root = new THREE.Group();
  for (const layer of e.mob ?? []) {
    const model = MOB_MODELS[layer.model];
    const tex = textures.get(layer.textureKey);
    if (!model || !tex) continue;
    const mat = new THREE.MeshLambertMaterial({
      map: tex.texture,
      side: THREE.DoubleSide,
      ...(layer.translucent ? { transparent: true, depthWrite: false } : { alphaTest: 0.5 }),
      ...(layer.tint ? { color: new THREE.Color(layer.tint[0], layer.tint[1], layer.tint[2]) } : {}),
    });
    root.add(buildMobLayer(model, mat));
  }
  if (!root.children.length) return null;
  const scale = (e.scale ?? 1) * (e.baby ? 0.5 : 1);
  if (scale !== 1) root.scale.setScalar(scale);
  return root;
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
 *  viewer's loaded texture map (so each model can sample its atlas). Positions are taken from
 *  each entity's `pos` verbatim — the caller's group frame decides whether those are structure-local
 *  (single structure) or world coords (a streamed world chunk). */
export function buildEntities(entities: StructureEntity[], textures: Map<string, LoadedTexture>): THREE.Group {
  const group = new THREE.Group();
  for (const e of entities) {
    const root = new THREE.Group();
    const standTex = e.textureKey ? textures.get(e.textureKey) : undefined;
    const mob = e.mob?.length ? buildMob(e, textures) : null;
    if (e.id === 'minecraft:armor_stand' && standTex) {
      root.position.set(e.pos[0], e.pos[1], e.pos[2]);
      // Minecraft yaw 0 faces +Z (south) and increases clockwise; negate for Three's CCW y.
      root.rotation.y = -e.rotation * DEG;
      root.add(buildArmorStand(e, standTex));
    } else if (mob) {
      root.position.set(e.pos[0], e.pos[1], e.pos[2]);
      // Mob models are authored facing -z; vanilla renders living entities at yaw+180°.
      root.rotation.y = Math.PI - e.rotation * DEG;
      root.add(mob);
    } else {
      root.position.set(Math.floor(e.pos[0]), Math.floor(e.pos[1]), Math.floor(e.pos[2]));
      root.add(buildFallbackCube(e.color));
    }
    group.add(root);
  }
  return group;
}
