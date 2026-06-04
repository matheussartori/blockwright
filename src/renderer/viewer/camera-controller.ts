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

  /** Frame the camera to a build's bounding box (also scales fly speed to its size). */
  frame(box: THREE.Box3): void {
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
    if (!this.fly.isLocked) return;
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
    }
  };

  private onKeyUp = (e: KeyboardEvent) => {
    if (MOVE_CODES.has(e.code)) this.keys.delete(e.code);
  };

  /** Drop every held key when focus leaves the window, so no movement sticks. */
  private onBlur = () => this.keys.clear();

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
