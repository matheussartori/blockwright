// Screenshot helpers for the AI self-review loop. Each render→read happens
// synchronously (no rAF interleaves), so the WebGL buffer is valid even without
// `preserveDrawingBuffer`. All three capture paths SAVE the camera/clip state they
// touch and RESTORE it before returning, so the user's live view is untouched — the
// caller only needs to leave fly mode and drop any highlight first.
import * as THREE from 'three';
import type { OrbitControls } from 'three/addons/controls/OrbitControls.js';

/** The live viewer bits a capture path reads/mutates. `current` is the loaded build. */
export interface CaptureContext {
  renderer: THREE.WebGLRenderer;
  camera: THREE.PerspectiveCamera;
  controls: OrbitControls;
  scene: THREE.Scene;
  current: THREE.Group;
}

/** How to encode a review screenshot: max edge plus image format/quality. */
export interface SnapOpts {
  /** Longest-edge cap in px; the frame is downscaled to fit. */
  maxSize: number;
  /** MIME type for `toDataURL` (defaults to PNG). JPEG shrinks these 3D shots a lot. */
  format?: string;
  /** JPEG quality 0..1 (ignored for PNG). */
  quality?: number;
}

/** Encoding for the AI self-review screenshots: a smaller edge + JPEG. The model only
 *  judges massing/layout (not pixel detail), and these images are RE-SENT every review
 *  round and accumulate in the conversation (uncached), so each kept byte is paid many
 *  times over — JPEG@512 cuts the per-image token cost to a fraction of a PNG@720. */
export const REVIEW_SNAP: SnapOpts = { maxSize: 512, format: 'image/jpeg', quality: 0.8 };

/** Downscale the current framebuffer to a data URL per `opts` (max edge, format,
 *  quality). Assumes the caller already rendered the frame; shared by the capture paths. */
export function snapshot(renderer: THREE.WebGLRenderer, opts: SnapOpts): string {
  const { maxSize, format = 'image/png', quality } = opts;
  const src = renderer.domElement;
  const scale = Math.min(1, maxSize / Math.max(src.width, src.height));
  const w = Math.max(1, Math.round(src.width * scale));
  const h = Math.max(1, Math.round(src.height * scale));
  const off = document.createElement('canvas');
  off.width = w;
  off.height = h;
  const ctx = off.getContext('2d');
  if (!ctx) return src.toDataURL(format, quality);
  ctx.drawImage(src, 0, 0, w, h);
  return off.toDataURL(format, quality);
}

/** Screenshot the current build from `angles` viewpoints orbited evenly around the
 *  framed target (angle 0 = the current camera), returning PNG data URLs. */
export function captureOrbit(ctx: CaptureContext, angles: number, opts: SnapOpts): string[] {
  const { renderer, camera, controls, scene } = ctx;
  const target = controls.target.clone();
  const saved = camera.position.clone();
  const offset = saved.clone().sub(target);
  const radius = Math.hypot(offset.x, offset.z) || 1;
  const elevation = offset.y;
  const baseAngle = Math.atan2(offset.z, offset.x);

  const shots: string[] = [];
  for (let i = 0; i < angles; i++) {
    const a = baseAngle + (i * 2 * Math.PI) / angles;
    camera.position.set(
      target.x + radius * Math.cos(a),
      target.y + elevation,
      target.z + radius * Math.sin(a),
    );
    camera.lookAt(target);
    renderer.render(scene, camera);
    shots.push(snapshot(renderer, opts));
  }

  // Restore the user's viewpoint.
  camera.position.copy(saved);
  camera.lookAt(target);
  controls.update();
  return shots;
}

/** Top-down "floor plan" screenshots: slice the build into a few horizontal bands,
 *  clip away everything above each cut, and shoot straight down. This gives the AI
 *  self-review loop a view of the INTERIOR (room layout, faux furniture, circulation)
 *  — which the exterior orbits in captureOrbit() never reveal, leaving the model
 *  building interiors blind. One cut per ~storey, capped so capture time and token
 *  cost stay bounded. */
export function captureCutaways(ctx: CaptureContext, opts: SnapOpts): string[] {
  const { renderer, camera, controls, scene, current } = ctx;
  const box = new THREE.Box3().setFromObject(current);
  const size = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());
  const height = Math.max(size.y, 1);
  // ~1 cutaway per storey, capped at 3 so a deep build (cellar + storeys + attic) is
  // covered — the review can't judge a level it never sees — without flooding a very
  // tall build. Discount a roof's worth of height (~3) first so a SHALLOW single-volume
  // build (a shed, a 1-storey hut) gets 0 cutaways: its interior is already revealed by
  // the vertical cross-section, so a top-down plan adds an image the review doesn't need.
  const floors = THREE.MathUtils.clamp(Math.round((height - 3) / 5), 0, 3);
  if (floors === 0) return [];

  // Save everything we mutate so the user's live view is untouched afterward.
  const savedPos = camera.position.clone();
  const savedUp = camera.up.clone();
  const savedNear = camera.near;
  const savedFar = camera.far;
  const savedTarget = controls.target.clone();
  const savedClip = renderer.clippingPlanes;

  // Fit the footprint from straight above; +Z points "down" in the image so every
  // floor plan shares one orientation.
  const footprint = Math.max(size.x, size.z, 1);
  const dist = footprint * 1.15 + 2;
  camera.up.set(0, 0, -1);
  camera.near = 0.05;
  camera.far = (height + dist) * 4;
  camera.updateProjectionMatrix();

  const shots: string[] = [];
  for (let i = 0; i < floors; i++) {
    // Cut near the top of each band (above that floor's furniture, below its ceiling)
    // so looking down reveals the floor's interior. Plane normal (0,-1,0) keeps
    // everything with y ≤ cutY.
    const cutY = box.min.y + ((i + 0.85) * height) / floors;
    renderer.clippingPlanes = [new THREE.Plane(new THREE.Vector3(0, -1, 0), cutY)];
    camera.position.set(center.x, cutY + dist, center.z);
    camera.lookAt(center.x, box.min.y, center.z);
    renderer.render(scene, camera);
    shots.push(snapshot(renderer, opts));
  }

  // Restore the user's viewpoint and clear the clip.
  renderer.clippingPlanes = savedClip;
  camera.up.copy(savedUp);
  camera.position.copy(savedPos);
  camera.near = savedNear;
  camera.far = savedFar;
  camera.updateProjectionMatrix();
  camera.lookAt(savedTarget);
  controls.update();
  return shots;
}

/** Vertical "cross-section" screenshot: clip the front half away and look at the
 *  exposed interior straight on from the front. Mirrors a reference's vertical-section
 *  panel — lets the AI self-review loop verify storey heights, vertical alignment
 *  between floors, and hanging detail (chains/lanterns/basement), which the top-down
 *  cutaways flatten away. One cut through the middle along z. */
export function captureSection(ctx: CaptureContext, opts: SnapOpts): string[] {
  const { renderer, camera, controls, scene, current } = ctx;
  const box = new THREE.Box3().setFromObject(current);
  const size = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());

  const savedPos = camera.position.clone();
  const savedUp = camera.up.clone();
  const savedTarget = controls.target.clone();
  const savedNear = camera.near;
  const savedFar = camera.far;
  const savedClip = renderer.clippingPlanes;

  // Keep the back half (z ≤ midZ): plane normal (0,0,1), constant -midZ clips
  // everything in front of the cut so the camera sees the exposed interior.
  const midZ = center.z;
  renderer.clippingPlanes = [new THREE.Plane(new THREE.Vector3(0, 0, 1), -midZ)];

  // Look straight on from in front of the build (-Z), framing its width × height.
  const span = Math.max(size.x, size.y, 1);
  const dist = span * 1.4 + 4;
  camera.up.set(0, 1, 0);
  camera.near = 0.05;
  camera.far = (dist + size.z) * 4;
  camera.updateProjectionMatrix();
  camera.position.set(center.x, center.y, box.min.z - dist);
  camera.lookAt(center.x, center.y, center.z);
  renderer.render(scene, camera);
  const shot = snapshot(renderer, opts);

  // Restore the user's viewpoint and clear the clip.
  renderer.clippingPlanes = savedClip;
  camera.up.copy(savedUp);
  camera.position.copy(savedPos);
  camera.near = savedNear;
  camera.far = savedFar;
  camera.updateProjectionMatrix();
  camera.lookAt(savedTarget);
  controls.update();
  return [shot];
}
