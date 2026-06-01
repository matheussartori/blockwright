// Low-level geometry helpers: turning resolved model elements into transformed
// quads (positions/normals/uvs/colors) accumulated per material.
import * as THREE from 'three';
import type { FaceDir, ModelElement, ResolvedModel } from '@/shared/types';
import type { LoadedTexture } from './texture-loader';

const FACES: FaceDir[] = ['down', 'up', 'north', 'south', 'east', 'west'];

// Approximate biome tint for tinted faces (grass/foliage). Good enough for v1.
const TINT = new THREE.Color(0x7cbd59);
const WHITE = new THREE.Color(0xffffff);

// Base corners per face, ordered to match the UV corners
// [top-left, top-right, bottom-right, bottom-left]. Each corner indexes into
// a flat box [fromX, fromY, fromZ, toX, toY, toZ] (from = 0..2, to = 3..5).
type Idx = [number, number, number];
interface FaceDef {
  normal: [number, number, number];
  corners: [Idx, Idx, Idx, Idx];
}

const FACE_DEFS: Record<FaceDir, FaceDef> = {
  up: { normal: [0, 1, 0], corners: [[0, 4, 2], [3, 4, 2], [3, 4, 5], [0, 4, 5]] },
  down: { normal: [0, -1, 0], corners: [[0, 1, 5], [3, 1, 5], [3, 1, 2], [0, 1, 2]] },
  north: { normal: [0, 0, -1], corners: [[3, 4, 2], [0, 4, 2], [0, 1, 2], [3, 1, 2]] },
  south: { normal: [0, 0, 1], corners: [[0, 4, 5], [3, 4, 5], [3, 1, 5], [0, 1, 5]] },
  west: { normal: [-1, 0, 0], corners: [[0, 4, 2], [0, 4, 5], [0, 1, 5], [0, 1, 2]] },
  east: { normal: [1, 0, 0], corners: [[3, 4, 5], [3, 4, 2], [3, 1, 2], [3, 1, 5]] },
};

/** A per-material accumulator of raw geometry buffers. */
export interface Accum {
  positions: number[];
  normals: number[];
  uvs: number[];
  colors: number[];
  textured: boolean;
  texture?: THREE.Texture;
  color?: [number, number, number];
}

/** Factory that returns (creating on demand) the accumulator for a material key. */
export type GetAccum = (
  key: string,
  textured: boolean,
  tex?: THREE.Texture,
  color?: [number, number, number],
) => Accum;

const tmpV = new THREE.Vector3();
const tmpN = new THREE.Vector3();

/** Build the rotation matrix a blockstate variant applies around the block center. */
function stateMatrix(x = 0, y = 0): THREE.Matrix4 {
  const m = new THREE.Matrix4();
  if (!x && !y) return m;
  const c = new THREE.Matrix4().makeTranslation(8, 8, 8);
  const ci = new THREE.Matrix4().makeTranslation(-8, -8, -8);
  // Minecraft rotations are clockwise -> negate for Three's right-handed system.
  const rx = new THREE.Matrix4().makeRotationX((-x * Math.PI) / 180);
  const ry = new THREE.Matrix4().makeRotationY((-y * Math.PI) / 180);
  return m.multiply(c).multiply(ry).multiply(rx).multiply(ci);
}

/** Build the rotation matrix a model element applies around its own origin. */
function elementMatrix(rot: ModelElement['rotation']): THREE.Matrix4 | null {
  if (!rot) return null;
  const [ox, oy, oz] = rot.origin;
  const angle = (rot.angle * Math.PI) / 180;
  const axis =
    rot.axis === 'x'
      ? new THREE.Vector3(1, 0, 0)
      : rot.axis === 'y'
        ? new THREE.Vector3(0, 1, 0)
        : new THREE.Vector3(0, 0, 1);
  const m = new THREE.Matrix4().makeTranslation(ox, oy, oz);
  m.multiply(new THREE.Matrix4().makeRotationAxis(axis, angle));
  if (rot.rescale) {
    const s = 1 / Math.cos(angle);
    const scale =
      rot.axis === 'x'
        ? new THREE.Matrix4().makeScale(1, s, s)
        : rot.axis === 'y'
          ? new THREE.Matrix4().makeScale(s, 1, s)
          : new THREE.Matrix4().makeScale(s, s, 1);
    m.multiply(scale);
  }
  m.multiply(new THREE.Matrix4().makeTranslation(-ox, -oy, -oz));
  return m;
}

/** UV corners (in 0..1, Three orientation) honoring rotation and animation frames. */
function faceUVs(
  uv: [number, number, number, number] | undefined,
  rotation: number | undefined,
  frames: number,
): [number, number][] {
  const [x1, y1, x2, y2] = uv ?? [0, 0, 16, 16];
  const v = (y: number) => {
    const vn = 1 - y / 16; // 1 = top of texture
    return 1 - (1 - vn) / frames; // squeeze to the first frame
  };
  let corners: [number, number][] = [
    [x1 / 16, v(y1)], // top-left
    [x2 / 16, v(y1)], // top-right
    [x2 / 16, v(y2)], // bottom-right
    [x1 / 16, v(y2)], // bottom-left
  ];
  const steps = ((rotation ?? 0) / 90) % 4;
  for (let i = 0; i < steps; i++) corners = [corners[3], corners[0], corners[1], corners[2]];
  return corners;
}

function pushQuad(
  a: Accum,
  v: THREE.Vector3[],
  n: THREE.Vector3,
  uv: [number, number][],
  tint: THREE.Color,
): void {
  // Two triangles: 0-1-2 and 0-2-3.
  const order = [0, 1, 2, 0, 2, 3];
  for (const i of order) {
    a.positions.push(v[i].x, v[i].y, v[i].z);
    a.normals.push(n.x, n.y, n.z);
    a.uvs.push(uv[i][0], uv[i][1]);
    a.colors.push(tint.r, tint.g, tint.b);
  }
}

/** Emit one resolved model at a block position into the matching accumulators. */
export function addModel(
  model: ResolvedModel,
  pos: [number, number, number],
  fallback: [number, number, number],
  textures: Map<string, LoadedTexture>,
  getAccum: GetAccum,
): void {
  const sm = stateMatrix(model.x, model.y);
  for (const el of model.elements) {
    const em = elementMatrix(el.rotation);
    const matrix = em ? sm.clone().multiply(em) : sm;
    for (const dir of FACES) {
      const face = el.faces[dir];
      if (!face) continue;

      const loaded = face.texture ? textures.get(face.texture) : undefined;
      const accum = loaded
        ? getAccum(`t:${face.texture}`, true, loaded.texture)
        : getAccum(`c:${fallback.join(',')}`, false, undefined, fallback);

      const def = FACE_DEFS[dir];
      const uvs = faceUVs(face.uv, face.rotation, loaded?.frames ?? 1);
      let tint = WHITE;
      if (face.tint) tint = new THREE.Color().setRGB(face.tint[0], face.tint[1], face.tint[2], THREE.SRGBColorSpace);
      else if (face.tintindex !== undefined && face.tintindex >= 0) tint = TINT;

      // Transform the 4 corners and the normal.
      const box = [el.from[0], el.from[1], el.from[2], el.to[0], el.to[1], el.to[2]];
      const verts: THREE.Vector3[] = def.corners.map((c) => {
        tmpV.set(box[c[0]], box[c[1]], box[c[2]]).applyMatrix4(matrix);
        return new THREE.Vector3(
          tmpV.x / 16 + pos[0],
          tmpV.y / 16 + pos[1],
          tmpV.z / 16 + pos[2],
        );
      });
      tmpN.set(...def.normal).transformDirection(matrix);

      pushQuad(accum, verts, tmpN, uvs, tint);
    }
  }
}

/** A plain colored unit cube for blocks without a resolvable model.
 *  The color is carried by the material; vertices stay white. */
export function addFallbackCube(a: Accum, pos: [number, number, number]): void {
  const box = [0, 0, 0, 16, 16, 16];
  for (const dir of FACES) {
    const def = FACE_DEFS[dir];
    const verts = def.corners.map((c) => {
      return new THREE.Vector3(
        box[c[0]] / 16 + pos[0],
        box[c[1]] / 16 + pos[1],
        box[c[2]] / 16 + pos[2],
      );
    });
    const n = new THREE.Vector3(...def.normal);
    pushQuad(a, verts, n, [
      [0, 0],
      [1, 0],
      [1, 1],
      [0, 1],
    ], WHITE);
  }
}
