// Showcase rendering ("Beauty Render"): high-resolution stills and a turntable WebM of
// the loaded build, straight from the live viewer — no world→Mineways→Blender pipeline.
// Reuses the capture discipline from capture.ts: every path SAVES the renderer/camera
// state it mutates and RESTORES it before returning, so the on-screen view survives. A
// still temporarily resizes the GL buffer to the requested pixels (CSS size untouched),
// renders once, and composites onto a 2D canvas (optionally filled with a background
// colour — the GL canvas itself stays transparent, which is what gives the free
// transparent-PNG export).
import * as THREE from 'three';
import type { CaptureContext } from './capture';

/** The preset viewpoints of Export ▸ Render Image. `current` keeps the user's camera. */
export type RenderAngle = 'current' | 'hero' | 'iso' | 'front' | 'top' | 'section';

export const RENDER_ANGLES: readonly RenderAngle[] = ['current', 'hero', 'iso', 'front', 'top', 'section'];

export interface StillOpts {
  width: number;
  height: number;
  angle: RenderAngle;
  /** CSS colour to fill behind the build, or null for a transparent PNG. */
  background: string | null;
}

export interface TurntableOpts {
  width: number;
  height: number;
  /** One full orbit takes this long. */
  seconds: number;
  fps: number;
}

/** Place the camera for a preset angle around the build's bounds (not `current`). */
function aimCamera(ctx: CaptureContext, angle: Exclude<RenderAngle, 'current'>): void {
  const { camera, current } = ctx;
  const box = new THREE.Box3().setFromObject(current);
  const size = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());
  const span = Math.max(size.x, size.y, size.z, 1);
  const dist = span * 1.6 + 2;
  const dir =
    angle === 'hero'
      ? new THREE.Vector3(0.85, 0.6, 1)
      : angle === 'iso'
        ? new THREE.Vector3(1, 0.82, 1)
        : angle === 'front' || angle === 'section'
          ? new THREE.Vector3(0, 0.12, -1)
          : new THREE.Vector3(0, 1, 0.001); // top
  camera.position.copy(center.clone().addScaledVector(dir.normalize(), dist));
  camera.near = 0.05;
  camera.far = dist * 6;
  camera.lookAt(center);
}

/** Everything a render mutates, snapshotted for restore. */
function saveState(ctx: CaptureContext) {
  const { renderer, camera, controls } = ctx;
  const size = renderer.getSize(new THREE.Vector2());
  return {
    size,
    pixelRatio: renderer.getPixelRatio(),
    pos: camera.position.clone(),
    near: camera.near,
    far: camera.far,
    aspect: camera.aspect,
    target: controls.target.clone(),
    clip: renderer.clippingPlanes,
  };
}

function restoreState(ctx: CaptureContext, s: ReturnType<typeof saveState>): void {
  const { renderer, camera, controls } = ctx;
  renderer.clippingPlanes = s.clip;
  renderer.setPixelRatio(s.pixelRatio);
  renderer.setSize(s.size.x, s.size.y, false);
  camera.aspect = s.aspect;
  camera.near = s.near;
  camera.far = s.far;
  camera.position.copy(s.pos);
  camera.updateProjectionMatrix();
  camera.lookAt(s.target);
  controls.update();
  renderer.render(ctx.scene, camera); // repaint the live view immediately
}

/** Render one high-resolution still and return it as a PNG data URL. */
export function renderStill(ctx: CaptureContext, opts: StillOpts): string {
  const { renderer, camera, scene, current } = ctx;
  const saved = saveState(ctx);

  renderer.setPixelRatio(1);
  renderer.setSize(opts.width, opts.height, false);
  camera.aspect = opts.width / opts.height;
  if (opts.angle === 'section') {
    // A vertical cross-section: clip the front half away, look straight in.
    const box = new THREE.Box3().setFromObject(current);
    renderer.clippingPlanes = [new THREE.Plane(new THREE.Vector3(0, 0, 1), -box.getCenter(new THREE.Vector3()).z)];
  }
  if (opts.angle !== 'current') aimCamera(ctx, opts.angle);
  camera.updateProjectionMatrix();
  renderer.render(scene, camera);

  // Composite at full resolution: optional background fill + the (transparent) GL frame.
  const out = document.createElement('canvas');
  out.width = opts.width;
  out.height = opts.height;
  const c2d = out.getContext('2d')!;
  if (opts.background) {
    c2d.fillStyle = opts.background;
    c2d.fillRect(0, 0, out.width, out.height);
  }
  c2d.drawImage(renderer.domElement, 0, 0);
  const url = out.toDataURL('image/png');

  restoreState(ctx, saved);
  return url;
}

/** Record one full orbit around the build as a WebM (VP9, else VP8) via the canvas
 *  capture stream. Resolves with the encoded blob; the live view is restored after. */
export function renderTurntable(ctx: CaptureContext, opts: TurntableOpts): Promise<Blob> {
  const { renderer, camera, scene, current, controls } = ctx;
  const saved = saveState(ctx);

  renderer.setPixelRatio(1);
  renderer.setSize(opts.width, opts.height, false);
  camera.aspect = opts.width / opts.height;
  camera.updateProjectionMatrix();

  const box = new THREE.Box3().setFromObject(current);
  const size = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());
  const span = Math.max(size.x, size.y, size.z, 1);
  const radius = span * 1.6 + 2;
  const elevation = center.y + span * 0.45;

  const stream = renderer.domElement.captureStream(opts.fps);
  const mime = MediaRecorder.isTypeSupported('video/webm;codecs=vp9') ? 'video/webm;codecs=vp9' : 'video/webm';
  const recorder = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: 12_000_000 });
  const chunks: BlobPart[] = [];
  recorder.ondataavailable = (e) => e.data.size && chunks.push(e.data);

  return new Promise<Blob>((resolve, reject) => {
    const frames = Math.max(1, Math.round(opts.seconds * opts.fps));
    let frame = 0;
    const interval = window.setInterval(() => {
      const a = (frame / frames) * Math.PI * 2;
      camera.position.set(center.x + radius * Math.cos(a), elevation, center.z + radius * Math.sin(a));
      camera.lookAt(center);
      controls.update();
      renderer.render(scene, camera);
      frame++;
      if (frame > frames) {
        window.clearInterval(interval);
        recorder.stop();
      }
    }, 1000 / opts.fps);

    recorder.onstop = () => {
      restoreState(ctx, saved);
      resolve(new Blob(chunks, { type: 'video/webm' }));
    };
    recorder.onerror = (e) => {
      window.clearInterval(interval);
      restoreState(ctx, saved);
      reject(e instanceof Error ? e : new Error('turntable recording failed'));
    };
    recorder.start();
  });
}
