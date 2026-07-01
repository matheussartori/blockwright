// Low-level geometry helpers: turning resolved model elements into transformed
// quads (positions/normals/uvs/colors) accumulated per material. This module is
// WORKER-SAFE — it references no THREE.Texture / DOM / scene objects (only THREE's
// pure math classes), so the world chunk-mesh worker and the structure mesh path
// share it. Textures are identified by KEY here; the actual GPU texture is looked
// up on the main thread when materials are built (see mesh-builder / world-view).
import * as THREE from 'three';
import type { FaceDir, ModelElement, ResolvedModel } from '@/shared/types';

/** The only texture facts the geometry math needs (animation frames + alpha kind).
 *  A `LoadedTexture` is structurally a superset, so the structure path passes its
 *  map straight in; the worker gets these precomputed (canvas-based detection can't
 *  run off the main thread). */
export interface TexInfo {
  frames: number;
  translucent: boolean;
  /** Average sRGB colour (0..1) — used by the far-LOD surface + minimap, ignored by full geometry. */
  avgColor?: [number, number, number];
}

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

/** A per-material accumulator of raw geometry buffers. Textures are named by KEY;
 *  the GPU texture is resolved from the key by the material builder (main thread). */
export interface Accum {
  positions: number[];
  normals: number[];
  uvs: number[];
  colors: number[];
  textured: boolean;
  textureKey?: string;
  color?: [number, number, number];
  translucent?: boolean;
  /** Whether this material renders both faces (plants/panes/glass) or backface-culls (full cubes). */
  doubleSided?: boolean;
}

/** Factory that returns (creating on demand) the accumulator for a material key. */
export type GetAccum = (
  key: string,
  textured: boolean,
  textureKey?: string,
  color?: [number, number, number],
  translucent?: boolean,
  doubleSided?: boolean,
) => Accum;

/** How far (in blocks) to nudge a coplanar OVERLAY element outward along its face normal so it wins
 *  the depth test against the base element it decorates (e.g. grass_block's green side overlay sits
 *  on the same cube as the dirt side — without this they z-fight and the dirt wins from most angles,
 *  making grass sides look like bare dirt). A hair: sub-pixel at 16px/block, invisible as a gap. */
const OVERLAY_PUSH = 0.0015;

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
  // Two triangles wound so the outward (normal-facing) side is FRONT — matches THREE's default CCW
  // front-face, so backface culling (FrontSide, used for full opaque cubes) shows the outside.
  const order = [0, 2, 1, 0, 3, 2];
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
  textures: Map<string, TexInfo>,
  getAccum: GetAccum,
  cull?: ReadonlySet<FaceDir>,
  biomeTint?: [number, number, number],
  doubleSided = true,
): void {
  const sm = stateMatrix(model.x, model.y);
  const grass = biomeTint ? new THREE.Color().setRGB(biomeTint[0], biomeTint[1], biomeTint[2], THREE.SRGBColorSpace) : TINT;
  const sideSuffix = doubleSided ? '' : '|s'; // single-sided materials get their own bucket
  const seenBoxes = new Set<string>();
  for (const el of model.elements) {
    // A later element sharing an earlier element's box is a coplanar OVERLAY (e.g. grass_block's
    // side-overlay cube over the dirt-side cube); nudge it outward so it wins the depth test.
    const boxKey = `${el.from.join(',')}|${el.to.join(',')}`;
    const overlayPush = seenBoxes.has(boxKey) ? OVERLAY_PUSH : 0;
    seenBoxes.add(boxKey);
    const em = elementMatrix(el.rotation);
    const matrix = em ? sm.clone().multiply(em) : sm;
    for (const dir of FACES) {
      if (cull?.has(dir)) continue; // neighbour is an opaque full cube (world face-culling)
      const face = el.faces[dir];
      if (!face) continue;

      const loaded = face.texture ? textures.get(face.texture) : undefined;
      const accum = loaded
        ? getAccum(`t:${face.texture}${sideSuffix}`, true, face.texture!, undefined, loaded.translucent, doubleSided)
        : getAccum(`c:${fallback.join(',')}${sideSuffix}`, false, undefined, fallback, undefined, doubleSided);

      const def = FACE_DEFS[dir];
      const uvs = faceUVs(face.uv, face.rotation, loaded?.frames ?? 1);
      let tint = WHITE;
      if (face.tint) tint = new THREE.Color().setRGB(face.tint[0], face.tint[1], face.tint[2], THREE.SRGBColorSpace);
      else if (face.tintindex !== undefined && face.tintindex >= 0) tint = grass;

      // Transform the normal first so a coplanar overlay can be nudged out along it.
      tmpN.set(...def.normal).transformDirection(matrix);
      const box = [el.from[0], el.from[1], el.from[2], el.to[0], el.to[1], el.to[2]];
      const verts: THREE.Vector3[] = def.corners.map((c) => {
        tmpV.set(box[c[0]], box[c[1]], box[c[2]]).applyMatrix4(matrix);
        return new THREE.Vector3(
          tmpV.x / 16 + pos[0] + tmpN.x * overlayPush,
          tmpV.y / 16 + pos[1] + tmpN.y * overlayPush,
          tmpV.z / 16 + pos[2] + tmpN.z * overlayPush,
        );
      });

      pushQuad(accum, verts, tmpN, uvs, tint);
    }
  }
}

/** A plain colored unit cube for blocks without a resolvable model.
 *  The color is carried by the material; vertices stay white. */
export function addFallbackCube(a: Accum, pos: [number, number, number], cull?: ReadonlySet<FaceDir>): void {
  const box = [0, 0, 0, 16, 16, 16];
  for (const dir of FACES) {
    if (cull?.has(dir)) continue;
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
