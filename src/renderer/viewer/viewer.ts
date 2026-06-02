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

/** One structure placed in the scene: its data plus a rigid transform. Rotation
 *  is quarter-turns about +Y, offset is the position of its local origin — the
 *  exact convention shared/jigsaw computes, so the meshes land where planned. */
export interface AssemblyPiece {
  data: StructureData;
  offset: [number, number, number];
  quarterTurns: number;
}

/** Keys that drive fly movement — captured (preventDefault) only while flying. */
const MOVE_CODES = new Set([
  'KeyW', 'KeyA', 'KeyS', 'KeyD', 'Space', 'ShiftLeft', 'ShiftRight',
]);

/** How long the focus-a-block highlight stays on screen (ms). */
const HIGHLIGHT_MS = 1000;

export class Viewer {
  private scene = new THREE.Scene();
  private camera: THREE.PerspectiveCamera;
  private renderer: THREE.WebGLRenderer;
  private controls: OrbitControls;
  private fly: PointerLockControls;
  private current: THREE.Group | null = null;
  private grid: THREE.GridHelper | null = null;
  private textures = new TextureLoader();
  /** Transient box drawn over a block the user clicked in the inspector. */
  private highlight: THREE.Mesh | null = null;
  private highlightUntil = 0;

  private mode: NavMode = 'orbit';
  private keys = new Set<string>();
  private timer = new THREE.Timer();
  /** Fly movement speed in world units/second; scaled to the structure on load. */
  private flySpeed = 8;
  /** Mouse-look multiplier in fly mode (Settings). */
  private lookSensitivity = 1;
  /** Invert the vertical look axis in fly mode (Settings). */
  private invertY = false;
  /** Whether the ground grid is shown (Settings). */
  private showGrid = true;
  /** Whether jigsaw blocks are rendered (Settings; off by default). */
  private showJigsaw = false;
  /** Whether each piece's outer shell is hidden (Settings; off by default). */
  private hideShell = false;
  /** Last rendered pieces, kept so a settings toggle can rebuild without a reload. */
  private lastPieces: AssemblyPiece[] | null = null;
  private readonly dir = new THREE.Vector3();
  private readonly euler = new THREE.Euler(0, 0, 0, 'YXZ');

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
    // We drive mouse-look ourselves (to support sensitivity + invert-Y from
    // Settings), so neutralize PointerLockControls' own rotation while keeping
    // its lock plumbing (isLocked, lock/unlock, moveRight, the unlock event).
    this.fly.pointerSpeed = 0;
    this.renderer.domElement.ownerDocument.addEventListener('mousemove', this.onMouseLook);
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
    this.updateHighlight();
    this.renderer.render(this.scene, this.camera);
  };

  /** Fade out and eventually drop the focus highlight. */
  private updateHighlight() {
    if (!this.highlight) return;
    const remaining = this.highlightUntil - performance.now();
    if (remaining <= 0) {
      this.removeHighlight();
      return;
    }
    const t = remaining / HIGHLIGHT_MS; // 1 → 0
    (this.highlight.material as THREE.MeshBasicMaterial).opacity = 0.2 + 0.55 * t;
  }

  private removeHighlight() {
    if (!this.highlight) return;
    this.scene.remove(this.highlight);
    this.highlight.geometry.dispose();
    (this.highlight.material as THREE.Material).dispose();
    this.highlight = null;
  }

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

  /** Pointer-lock mouse-look (mirrors PointerLockControls' math, but with the
   *  user's sensitivity and optional Y inversion). */
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

  /** Mouse-look multiplier in fly mode (Settings). */
  setLookSensitivity(value: number) {
    this.lookSensitivity = value;
  }

  /** Invert the vertical look axis in fly mode (Settings). */
  setInvertY(value: boolean) {
    this.invertY = value;
  }

  /** Show or hide the ground grid (Settings). */
  setShowGrid(show: boolean) {
    this.showGrid = show;
    if (this.grid) this.grid.visible = show;
  }

  /** Render jigsaw blocks or not (Settings). Rebuilds the current scene so the
   *  change is immediate, without a file reload. */
  setShowJigsaw(show: boolean) {
    if (show === this.showJigsaw) return;
    this.showJigsaw = show;
    // Toggling is an in-place rebuild, not a fresh load — keep the camera where
    // the user left it instead of re-framing the (now slightly different) bounds.
    if (this.lastPieces) void this.showAssembly(this.lastPieces, true);
  }

  /** Hide each piece's outer shell or not (Settings). Rebuilds in place so the
   *  change is immediate, keeping the camera where the user left it. */
  setHideShell(hide: boolean) {
    if (hide === this.hideShell) return;
    this.hideShell = hide;
    if (this.lastPieces) void this.showAssembly(this.lastPieces, true);
  }

  private onResize() {
    const w = this.container.clientWidth;
    const h = this.container.clientHeight;
    if (w === 0 || h === 0) return;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
  }

  /** Render a single structure (the common case). Pass `preserveCamera` to keep
   *  the current view (e.g. re-rendering the same file with a workspace's
   *  textures) instead of re-framing. */
  async show(data: StructureData, preserveCamera = false): Promise<void> {
    await this.showAssembly([{ data, offset: [0, 0, 0], quarterTurns: 0 }], preserveCamera);
  }

  /** Render one or more placed structures as a jigsaw assembly. Each piece is its
   *  own transformed group, so framing and the grid follow the combined bounds.
   *  Pass `preserveCamera` to rebuild in place (e.g. a settings toggle) without
   *  moving the camera or orbit target. */
  async showAssembly(pieces: AssemblyPiece[], preserveCamera = false): Promise<void> {
    this.clear();
    this.lastPieces = pieces;
    if (pieces.length === 0) return;

    const keys = new Set<string>();
    for (const p of pieces) for (const t of p.data.textures) keys.add(t);
    const textures = await this.textures.load([...keys]);

    const parent = new THREE.Group();
    for (const p of pieces) {
      const group = buildStructure(p.data, textures, this.showJigsaw, this.hideShell);
      group.rotation.y = (p.quarterTurns * Math.PI) / 2;
      group.position.set(p.offset[0], p.offset[1], p.offset[2]);
      parent.add(group);
    }
    this.current = parent;
    this.scene.add(parent);

    const box = new THREE.Box3().setFromObject(parent);
    this.addGrid(box);
    if (preserveCamera) this.controls.update();
    else this.frame(box);
  }

  /** Center the camera on a single block (local coords of the loaded structure)
   *  and flash a translucent box over it for ~1s so it's easy to spot among
   *  neighbours. Drawn without depth-testing so it shows through other blocks. */
  focusBlock(pos: [number, number, number]) {
    if (this.mode === 'fly') this.setMode('orbit');
    const center = new THREE.Vector3(pos[0] + 0.5, pos[1] + 0.5, pos[2] + 0.5);

    // Keep the current view direction; pull in to a comfortable distance so the
    // block fills the frame even when we were zoomed out over a big structure.
    const dir = new THREE.Vector3().subVectors(this.camera.position, this.controls.target);
    const curDist = dir.length();
    if (curDist < 1e-3) dir.set(0.8, 0.7, 0.9);
    dir.normalize();
    const dist = THREE.MathUtils.clamp(curDist, 3, 8);
    this.controls.target.copy(center);
    this.camera.position.copy(center).addScaledVector(dir, dist);
    this.controls.update();

    this.removeHighlight();
    const geo = new THREE.BoxGeometry(1.06, 1.06, 1.06);
    const mat = new THREE.MeshBasicMaterial({
      color: 0xffd54a,
      transparent: true,
      opacity: 0.75,
      depthTest: false,
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.copy(center);
    mesh.renderOrder = 999;
    this.scene.add(mesh);
    this.highlight = mesh;
    this.highlightUntil = performance.now() + HIGHLIGHT_MS;
  }

  /** Remove the current structure and grid from the scene (back to empty). */
  clear() {
    this.lastPieces = null;
    this.removeHighlight();
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

  private addGrid(box: THREE.Box3) {
    const size = box.getSize(new THREE.Vector3());
    const center = box.getCenter(new THREE.Vector3());
    const span = Math.ceil(Math.max(size.x, size.z, 1));
    const grid = new THREE.GridHelper(span, span, 0x4b5563, 0x33373e);
    grid.position.set(center.x, box.min.y, center.z);
    (grid.material as THREE.Material).transparent = true;
    (grid.material as THREE.Material).opacity = 0.35;
    grid.visible = this.showGrid;
    this.scene.add(grid);
    this.grid = grid;
  }

  private frame(box: THREE.Box3) {
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
}
