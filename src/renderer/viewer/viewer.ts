// The 3D viewport: scene setup, camera, and framing. Two navigation modes share
// one camera: OrbitControls (default — drag/pan/zoom around the structure) and a
// pointer-locked "fly" mode (WASD + mouse look, like Minecraft noclip). Mesh
// construction and texture loading are delegated to mesh-builder / texture-loader.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { PointerLockControls } from 'three/addons/controls/PointerLockControls.js';
import type { StructureData } from '@/shared/types';
import { buildStructure } from './mesh-builder';
import { TextureLoader } from './texture-loader';

export type NavMode = 'orbit' | 'fly';

/** Keys that drive fly movement — captured (preventDefault) only while flying. */
const MOVE_CODES = new Set([
  'KeyW', 'KeyA', 'KeyS', 'KeyD', 'Space', 'ShiftLeft', 'ShiftRight',
]);

export class Viewer {
  private scene = new THREE.Scene();
  private camera: THREE.PerspectiveCamera;
  private renderer: THREE.WebGLRenderer;
  private controls: OrbitControls;
  private fly: PointerLockControls;
  private current: THREE.Group | null = null;
  private grid: THREE.GridHelper | null = null;
  private textures = new TextureLoader();

  private mode: NavMode = 'orbit';
  private keys = new Set<string>();
  private timer = new THREE.Timer();
  /** Fly movement speed in world units/second; scaled to the structure on load. */
  private flySpeed = 8;
  private readonly dir = new THREE.Vector3();

  /** Notified whenever the navigation mode changes (for the UI to reflect it). */
  onModeChange: ((mode: NavMode) => void) | null = null;

  constructor(private container: HTMLElement) {
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(container.clientWidth, container.clientHeight);
    container.appendChild(this.renderer.domElement);

    this.camera = new THREE.PerspectiveCamera(
      50,
      container.clientWidth / container.clientHeight,
      0.05,
      2000,
    );
    this.camera.position.set(8, 8, 14);

    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.08;

    this.fly = new PointerLockControls(this.camera, this.renderer.domElement);
    // Losing the pointer lock (Esc, or the browser dropping it) is the canonical
    // signal to leave fly mode and hand the camera back to OrbitControls.
    this.fly.addEventListener('unlock', () => this.setMode('orbit'));

    this.scene.add(new THREE.HemisphereLight(0xffffff, 0x6b7280, 1.05));
    const sun = new THREE.DirectionalLight(0xffffff, 1.5);
    sun.position.set(0.6, 1, 0.45);
    this.scene.add(sun);
    const fill = new THREE.DirectionalLight(0xffffff, 0.5);
    fill.position.set(-0.5, 0.4, -0.6);
    this.scene.add(fill);

    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
    this.renderer.domElement.addEventListener('wheel', this.onWheel, { passive: false });

    new ResizeObserver(() => this.onResize()).observe(container);
    this.animate();
  }

  private animate = () => {
    requestAnimationFrame(this.animate);
    this.timer.update();
    const dt = this.timer.getDelta();
    if (this.mode === 'fly') this.updateFly(dt);
    else this.controls.update();
    this.renderer.render(this.scene, this.camera);
  };

  /** Integrate one frame of WASD/Space/Shift movement while flying. */
  private updateFly(dt: number) {
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

  /** Switch navigation mode, syncing the inactive controller so the swap is seamless. */
  private setMode(mode: NavMode) {
    if (mode === this.mode) return;
    this.mode = mode;
    if (mode === 'fly') {
      this.controls.enabled = false;
      this.fly.lock();
    } else {
      if (this.fly.isLocked) this.fly.unlock();
      this.keys.clear();
      // Re-anchor the orbit target in front of the camera so rotation pivots
      // around where you were looking, not back at the old target.
      const dist = this.controls.target.distanceTo(this.camera.position) || 10;
      this.camera.getWorldDirection(this.dir);
      this.controls.target.copy(this.camera.position).addScaledVector(this.dir, dist);
      this.controls.enabled = true;
      this.controls.update();
    }
    this.onModeChange?.(mode);
  }

  private onKeyDown = (e: KeyboardEvent) => {
    if ((e.key === 'f' || e.key === 'F') && !e.repeat) {
      if (!this.current) return; // nothing loaded — no navigation to do
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

  /** While flying, the wheel tunes movement speed instead of zooming. */
  private onWheel = (e: WheelEvent) => {
    if (this.mode !== 'fly') return;
    e.preventDefault();
    const factor = e.deltaY < 0 ? 1.15 : 1 / 1.15;
    this.flySpeed = THREE.MathUtils.clamp(this.flySpeed * factor, 1, 500);
  };

  private onResize() {
    const w = this.container.clientWidth;
    const h = this.container.clientHeight;
    if (w === 0 || h === 0) return;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
  }

  async show(data: StructureData): Promise<void> {
    this.clear();
    const textures = await this.textures.load(data.textures);
    this.current = buildStructure(data, textures);
    this.scene.add(this.current);
    this.addGrid(data.size);
    this.frame(data.size);
  }

  /** Remove the current structure and grid from the scene (back to empty). */
  clear() {
    this.setMode('orbit'); // never leave a stale pointer lock when unloading
    if (this.current) {
      this.scene.remove(this.current);
      this.disposeGroup(this.current);
      this.current = null;
    }
    if (this.grid) {
      this.scene.remove(this.grid);
      this.grid.geometry.dispose();
      (this.grid.material as THREE.Material).dispose();
      this.grid = null;
    }
  }

  private disposeGroup(group: THREE.Group) {
    group.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (mesh.geometry) mesh.geometry.dispose();
      if (mesh.material) {
        const m = mesh.material as THREE.Material & { map?: THREE.Texture };
        m.dispose();
      }
    });
  }

  private addGrid(size: [number, number, number]) {
    const span = Math.max(size[0], size[2], 1);
    const grid = new THREE.GridHelper(span, span, 0x4b5563, 0x33373e);
    grid.position.set(size[0] / 2, 0, size[2] / 2);
    (grid.material as THREE.Material).transparent = true;
    (grid.material as THREE.Material).opacity = 0.35;
    this.scene.add(grid);
    this.grid = grid;
  }

  private frame(size: [number, number, number]) {
    const center = new THREE.Vector3(size[0] / 2, size[1] / 2, size[2] / 2);
    const radius = Math.max(size[0], size[1], size[2], 1);
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
}
