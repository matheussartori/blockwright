// The camera + its two navigation modes, owned independently of the scene. Orbit
// (default — drag/pan/zoom via OrbitControls) and a pointer-locked "fly" mode (WASD
// + mouse look, like Minecraft noclip) share one camera; this class owns the swap
// between them, the per-frame integration, and framing the camera to a build. The
// Viewer holds one of these and feeds it `update(dt)` each frame, reading `camera`/
// `controls` back for rendering and the capture paths.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { PointerLockControls } from 'three/addons/controls/PointerLockControls.js';

export type NavMode = 'orbit' | 'fly';

/** Plan-view presets: axis-aligned near-orthographic views (+ the perspective reset). */
export type ViewPreset = 'top' | 'front' | 'side' | 'persp';

/** The default perspective FOV; presets drop to a telephoto FOV that reads as a plan. */
const DEFAULT_FOV = 50;
const ORTHO_FOV = 10;

/** A serializable snapshot of the current viewpoint — position + look direction +
 *  the orbit-pivot distance — used to preserve the camera across tab switches. */
export interface CameraSnapshot {
  position: [number, number, number];
  quaternion: [number, number, number, number];
  /** Camera→orbit-pivot distance, to reconstruct the pivot on restore. */
  distance: number;
}

/** Keys that drive fly movement — captured (preventDefault) only while flying. */
const MOVE_CODES = new Set([
  'KeyW', 'KeyA', 'KeyS', 'KeyD', 'Space', 'ShiftLeft', 'ShiftRight',
]);

export interface CameraControllerOpts {
  /** Headless capture viewer: skip all global interaction wiring (no rAF loop,
   *  no keyboard/mouse-look/wheel) so it never steals input from the on-screen one. */
  offscreen: boolean;
  /** Whether fly mode can be toggled right now (false when nothing is loaded). */
  canToggle: () => boolean;
}

export class CameraController {
  readonly camera: THREE.PerspectiveCamera;
  readonly controls: OrbitControls;
  private fly: PointerLockControls;

  private mode: NavMode = 'orbit';
  private keys = new Set<string>();
  /** Fly movement speed in world units/second; scaled to the structure on load. */
  private flySpeed = 8;
  /** Mouse-look multiplier in fly mode (Settings). */
  private lookSensitivity = 1;
  /** Invert the vertical look axis in fly mode (Settings). */
  private invertY = false;
  private readonly dir = new THREE.Vector3();
  private readonly euler = new THREE.Euler(0, 0, 0, 'YXZ');

  /** Notified whenever the navigation mode changes (for the UI to reflect it). */
  onModeChange: ((mode: NavMode) => void) | null = null;

  constructor(private domElement: HTMLElement, aspect: number, private opts: CameraControllerOpts) {
    this.camera = new THREE.PerspectiveCamera(50, aspect, 0.05, 2000);
    this.camera.position.set(8, 8, 14);

    this.controls = new OrbitControls(this.camera, domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.08;

    this.fly = new PointerLockControls(this.camera, domElement);
    // We drive mouse-look ourselves (to support sensitivity + invert-Y from
    // Settings), so neutralize PointerLockControls' own rotation while keeping its
    // lock plumbing (isLocked, lock/unlock, moveRight, the unlock event).
    this.fly.pointerSpeed = 0;

    if (!opts.offscreen) {
      domElement.ownerDocument.addEventListener('mousemove', this.onMouseLook);
      // Losing the pointer lock (Esc, or the browser dropping it) is the canonical
      // signal to leave fly mode and hand the camera back to OrbitControls.
      this.fly.addEventListener('unlock', () => this.setMode('orbit'));
      window.addEventListener('keydown', this.onKeyDown);
      window.addEventListener('keyup', this.onKeyUp);
      // Release all held movement keys when the window loses focus. Without this, a
      // key down at blur time (e.g. Shift in a screenshot shortcut) never gets its
      // keyup, so the camera keeps drifting — notoriously "flying down" forever when
      // a screenshot grab steals focus mid-Shift.
      window.addEventListener('blur', this.onBlur);
      // A screenshot grab (system overlay, Print Screen, etc.) can take the page
      // out of focus/visibility or drop the pointer lock without delivering the
      // keyup for a held key — leaving e.g. Shift "stuck" so the camera sinks
      // forever. Treat any of these as "release everything".
      domElement.ownerDocument.addEventListener('visibilitychange', this.onBlur);
      domElement.ownerDocument.addEventListener('pointerlockchange', this.onPointerLockChange);
      domElement.addEventListener('wheel', this.onWheel, { passive: false });
    }
  }

  /** Is the camera currently in fly mode? */
  isFly(): boolean {
    return this.mode === 'fly';
  }

  /** Integrate one frame of navigation (fly movement, or orbit damping). */
  update(dt: number): void {
    if (this.mode === 'fly') this.updateFly(dt);
    else this.controls.update();
  }

  /** Recompute the projection for a new viewport aspect ratio. */
  resize(aspect: number): void {
    this.camera.aspect = aspect;
    this.camera.updateProjectionMatrix();
  }

  /** Switch navigation mode, syncing the inactive controller so the swap is seamless. */
  setMode(mode: NavMode): void {
    if (mode === this.mode) return;
    this.mode = mode;
    if (mode === 'fly') {
      this.controls.enabled = false;
      this.fly.lock();
    } else {
      if (this.fly.isLocked) this.fly.unlock();
      this.keys.clear();
      // Re-anchor the orbit target in front of the camera so rotation pivots around
      // where you were looking, not back at the old target.
      const dist = this.controls.target.distanceTo(this.camera.position) || 10;
      this.camera.getWorldDirection(this.dir);
      this.controls.target.copy(this.camera.position).addScaledVector(this.dir, dist);
      this.controls.enabled = true;
      this.controls.update();
    }
    this.onModeChange?.(mode);
  }

  /** Frame the camera to a build's bounding box (also scales fly speed to its size).
   *  Always restores the default perspective FOV — a lingering plan-view telephoto
   *  would silently distort the next build's framing. */
  frame(box: THREE.Box3): void {
    if (this.camera.fov !== DEFAULT_FOV) {
      this.camera.fov = DEFAULT_FOV;
      this.camera.updateProjectionMatrix();
    }
    const center = box.getCenter(new THREE.Vector3());
    const size = box.getSize(new THREE.Vector3());
    const radius = Math.max(size.x, size.y, size.z, 1);
    const dist = radius * 1.8 + 2;
    // Fly speed proportional to the structure so big builds aren't a slow crawl.
    this.flySpeed = Math.max(6, radius * 0.8);
    this.controls.target.copy(center);
    this.camera.position.set(
      center.x + dist * 0.8,
      center.y + dist * 0.7,
      center.z + dist * 0.9,
    );
    this.camera.near = Math.max(0.05, dist / 100);
    this.camera.far = dist * 20;
    this.camera.updateProjectionMatrix();
    this.controls.update();
  }

  /** Snap to an axis-aligned plan view (top/front/side) of `box`, or back to the default
   *  perspective. Plan views use a TELEPHOTO FOV (10°) at the matching distance — visually
   *  near-orthographic without swapping the camera (orbit/fly/raycast/captures all keep
   *  working on the one PerspectiveCamera). `front` faces the south (+Z) side, Minecraft's
   *  build-facing convention; `side` faces east (+X). */
  viewPreset(preset: ViewPreset, box: THREE.Box3): void {
    if (this.mode === 'fly') this.setMode('orbit');
    if (preset === 'persp') {
      this.camera.fov = DEFAULT_FOV;
      this.camera.updateProjectionMatrix();
      this.frame(box);
      return;
    }
    const center = box.getCenter(new THREE.Vector3());
    const size = box.getSize(new THREE.Vector3());
    // Half-extent across the viewing plane (what must fit the frame), plus the depth
    // toward the camera, sets the telephoto distance.
    const spans: Record<Exclude<ViewPreset, 'persp'>, { half: number; depth: number; dir: THREE.Vector3 }> = {
      top: { half: Math.max(size.x, size.z) / 2, depth: size.y / 2, dir: new THREE.Vector3(0.001, 1, 0.001) },
      front: { half: Math.max(size.x, size.y) / 2, depth: size.z / 2, dir: new THREE.Vector3(0, 0, 1) },
      side: { half: Math.max(size.y, size.z) / 2, depth: size.x / 2, dir: new THREE.Vector3(1, 0, 0) },
    };
    const { half, depth, dir } = spans[preset];
    const dist = (Math.max(half, 1) * 1.1) / Math.tan(THREE.MathUtils.degToRad(ORTHO_FOV / 2)) + depth;
    this.camera.fov = ORTHO_FOV;
    this.camera.near = Math.max(0.05, dist / 200);
    this.camera.far = dist * 4;
    this.camera.position.copy(center).addScaledVector(dir.normalize(), dist);
    this.camera.updateProjectionMatrix();
    this.controls.target.copy(center);
    this.controls.update();
  }

  /** Center the camera on a point, keeping the current view direction and pulling in
   *  to a comfortable distance so it fills the frame. Leaves fly mode first. */
  focusOn(center: THREE.Vector3): void {
    if (this.mode === 'fly') this.setMode('orbit');
    const dir = new THREE.Vector3().subVectors(this.camera.position, this.controls.target);
    const curDist = dir.length();
    if (curDist < 1e-3) dir.set(0.8, 0.7, 0.9);
    dir.normalize();
    const dist = THREE.MathUtils.clamp(curDist, 3, 8);
    this.controls.target.copy(center);
    this.camera.position.copy(center).addScaledVector(dir, dist);
    this.controls.update();
  }

  /** Capture the current viewpoint so it can be restored later (per-tab persistence).
   *  In fly mode the orbit target is stale, so a comfortable default pivot distance is
   *  used instead of the meaningless camera→target span. */
  snapshot(): CameraSnapshot {
    const p = this.camera.position;
    const q = this.camera.quaternion;
    const distance =
      this.mode === 'fly' ? 16 : this.camera.position.distanceTo(this.controls.target) || 16;
    return {
      position: [p.x, p.y, p.z],
      quaternion: [q.x, q.y, q.z, q.w],
      distance,
    };
  }

  /** Restore a saved viewpoint (position + look direction). Always lands in orbit mode
   *  — re-acquiring the pointer lock for fly needs a fresh user gesture — with the orbit
   *  pivot placed along the restored look direction so orbiting resumes naturally. */
  restore(s: CameraSnapshot): void {
    if (this.mode === 'fly') {
      if (this.fly.isLocked) this.fly.unlock();
      this.keys.clear();
      this.mode = 'orbit';
      this.onModeChange?.('orbit');
    }
    this.camera.position.set(s.position[0], s.position[1], s.position[2]);
    this.camera.quaternion.set(s.quaternion[0], s.quaternion[1], s.quaternion[2], s.quaternion[3]);
    this.camera.getWorldDirection(this.dir);
    this.controls.target.copy(this.camera.position).addScaledVector(this.dir, s.distance);
    this.controls.enabled = true;
    this.controls.update();
  }

  /** Paint mode: free the LEFT button for painting and rotate with the RIGHT button instead
   *  (the MagicaVoxel convention), so a left-drag paints a stroke rather than orbiting. Off
   *  restores the orbit defaults (LEFT rotate, RIGHT pan). */
  setPaintNav(on: boolean): void {
    this.controls.mouseButtons.LEFT = on ? (null as unknown as THREE.MOUSE) : THREE.MOUSE.ROTATE;
    this.controls.mouseButtons.RIGHT = on ? THREE.MOUSE.ROTATE : THREE.MOUSE.PAN;
  }

  /** Mouse-look multiplier in fly mode (Settings). */
  setLookSensitivity(value: number): void {
    this.lookSensitivity = value;
  }

  /** Invert the vertical look axis in fly mode (Settings). */
  setInvertY(value: boolean): void {
    this.invertY = value;
  }

  /** Integrate one frame of WASD/Space/Shift movement while flying. */
  private updateFly(dt: number): void {
    // Only move while the pointer is locked AND the page actually has focus. If a
    // screenshot tool grabbed focus (so a keyup got swallowed), bail and drop the
    // held keys so a stuck Shift can't keep sinking the camera.
    if (!this.fly.isLocked || !this.domElement.ownerDocument.hasFocus()) {
      if (this.keys.size) this.keys.clear();
      return;
    }
    const step = this.flySpeed * dt;
    let forward = 0;
    let right = 0;
    let up = 0;
    if (this.keys.has('KeyW')) forward += 1;
    if (this.keys.has('KeyS')) forward -= 1;
    if (this.keys.has('KeyD')) right += 1;
    if (this.keys.has('KeyA')) right -= 1;
    if (this.keys.has('Space')) up += 1;
    if (this.keys.has('ShiftLeft') || this.keys.has('ShiftRight')) up -= 1;

    if (forward !== 0) {
      // Fly along the look direction (full 3D), so looking down + W descends.
      this.camera.getWorldDirection(this.dir);
      this.camera.position.addScaledVector(this.dir, forward * step);
    }
    if (right !== 0) this.fly.moveRight(right * step);
    if (up !== 0) this.camera.position.y += up * step;
  }

  private onKeyDown = (e: KeyboardEvent) => {
    if ((e.key === 'f' || e.key === 'F') && !e.repeat) {
      if (!this.opts.canToggle()) return; // nothing loaded — no navigation to do
      this.setMode(this.mode === 'fly' ? 'orbit' : 'fly');
      return;
    }
    if (this.mode !== 'fly') return;
    if (MOVE_CODES.has(e.code)) {
      this.keys.add(e.code);
      e.preventDefault(); // stop Space from scrolling, etc.
      return;
    }
    // Anything else pressed while flying (Print Screen, an OS/app shortcut, …) is
    // not navigation. Release any held movement keys so the press that triggers a
    // screenshot can't leave Shift stuck and sink the camera. Recognized screenshot
    // triggers also exit fly mode entirely.
    this.keys.clear();
    if (this.isScreenshotKey(e)) this.setMode('orbit');
  };

  private onKeyUp = (e: KeyboardEvent) => {
    if (MOVE_CODES.has(e.code)) this.keys.delete(e.code);
  };

  /** A Print Screen press (reported as PrintScreen, or F13 for a PC keyboard's PrtSc
   *  on macOS) or a macOS screenshot chord (Cmd+Shift+3/4/5/6). */
  private isScreenshotKey(e: KeyboardEvent): boolean {
    return (
      e.code === 'PrintScreen' ||
      e.code === 'F13' ||
      (e.metaKey && e.shiftKey && /^Digit[3-6]$/.test(e.code))
    );
  }

  /** Drop every held key when focus leaves the window, so no movement sticks. */
  private onBlur = () => this.keys.clear();

  /** Losing the pointer lock (screenshot overlay, OS taking over) must release any
   *  held keys so movement can't stick. */
  private onPointerLockChange = () => {
    if (!this.fly.isLocked) this.keys.clear();
  };

  /** While flying, the wheel tunes movement speed instead of zooming. */
  private onWheel = (e: WheelEvent) => {
    if (this.mode !== 'fly') return;
    e.preventDefault();
    const factor = e.deltaY < 0 ? 1.15 : 1 / 1.15;
    this.flySpeed = THREE.MathUtils.clamp(this.flySpeed * factor, 1, 500);
  };

  /** Pointer-lock mouse-look (mirrors PointerLockControls' math, but with the user's
   *  sensitivity and optional Y inversion). */
  private onMouseLook = (e: MouseEvent) => {
    if (this.mode !== 'fly' || !this.fly.isLocked) return;
    const factor = 0.002 * this.lookSensitivity;
    this.euler.setFromQuaternion(this.camera.quaternion);
    this.euler.y -= e.movementX * factor;
    this.euler.x -= e.movementY * factor * (this.invertY ? -1 : 1);
    // Clamp pitch so you can't flip over the poles.
    this.euler.x = THREE.MathUtils.clamp(this.euler.x, -Math.PI / 2, Math.PI / 2);
    this.camera.quaternion.setFromEuler(this.euler);
  };
}
