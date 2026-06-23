// The 3D viewport: scene setup, lights, structure loading + framing, and the render
// loop. The camera and its navigation modes (orbit / pointer-locked fly) live in a
// CameraController; the other focused concerns are siblings too: mesh building
// (mesh-builder) + texture loading (texture-loader), screenshot paths (capture), the
// floor-plan overlay (floor-regions), and the inspector focus box (highlight).
import * as THREE from 'three';
import type { StructureData } from '@/shared/types';
import { CameraController, type NavMode } from './camera-controller';
import { type CaptureContext, captureCutaways, captureOrbit, captureSection, REVIEW_SNAP, type SnapOpts } from './capture';
import { type FloorRegion, FloorRegionsOverlay } from './floor-regions';
import { FocusHighlight } from './highlight';
import { buildStructure } from './mesh-builder';
import { SelectionOverlay } from './selection-overlay';
import { SymmetryOverlay } from './symmetry-overlay';
import { TextureLoader } from './texture-loader';

export type { FloorRegion } from './floor-regions';
export type { NavMode } from './camera-controller';

/** One structure placed in the scene: its data plus a rigid transform. Rotation
 *  is quarter-turns about +Y, offset is the position of its local origin — the
 *  exact convention shared/jigsaw computes, so the meshes land where planned. */
export interface AssemblyPiece {
  data: StructureData;
  offset: [number, number, number];
  quarterTurns: number;
}

export class Viewer {
  private scene = new THREE.Scene();
  private renderer: THREE.WebGLRenderer;
  private nav: CameraController;
  private current: THREE.Group | null = null;
  private grid: THREE.GridHelper | null = null;
  private textures = new TextureLoader();
  /** Transient box over a block the user clicked in the inspector. */
  private highlight = new FocusHighlight(this.scene);

  private selectionOverlay = new SelectionOverlay(this.scene);

  private symmetryOverlay = new SymmetryOverlay(this.scene);

  private raycaster = new THREE.Raycaster();
  /** Floor-plan bands (one per named level), persisted across builds. */
  private floors = new FloorRegionsOverlay(this.scene);

  private timer = new THREE.Timer();
  /** Whether the ground grid is shown (Settings). */
  private showGrid = true;
  /** Whether jigsaw blocks are rendered (Settings; off by default). */
  private showJigsaw = false;
  /** Whether each piece's outer shell is hidden (Settings; off by default). */
  private hideShell = false;
  /** Last rendered pieces, kept so a settings toggle can rebuild without a reload. */
  private lastPieces: AssemblyPiece[] | null = null;

  /** Notified whenever the navigation mode changes (for the UI to reflect it). */
  onModeChange: ((mode: NavMode) => void) | null = null;

  /** `offscreen` builds a headless capture-only viewer: it skips all global
   *  interaction wiring (keyboard / mouse-look / wheel) and the rAF render loop,
   *  so a second instance used purely for background-tab screenshots never steals
   *  input from the on-screen viewer. Its capture methods render explicitly, so
   *  no animation loop is needed. */
  constructor(private container: HTMLElement, private offscreen = false) {
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(container.clientWidth, container.clientHeight);
    container.appendChild(this.renderer.domElement);

    this.nav = new CameraController(
      this.renderer.domElement,
      container.clientWidth / container.clientHeight,
      { offscreen, canToggle: () => this.current !== null },
    );
    this.nav.onModeChange = (mode) => this.onModeChange?.(mode);

    this.scene.add(new THREE.HemisphereLight(0xffffff, 0x6b7280, 1.05));
    const sun = new THREE.DirectionalLight(0xffffff, 1.5);
    sun.position.set(0.6, 1, 0.45);
    this.scene.add(sun);
    const fill = new THREE.DirectionalLight(0xffffff, 0.5);
    fill.position.set(-0.5, 0.4, -0.6);
    this.scene.add(fill);

    if (!offscreen) {
      new ResizeObserver(() => this.onResize()).observe(container);
      this.animate();
    }
  }

  private animate = () => {
    requestAnimationFrame(this.animate);
    this.timer.update();
    this.nav.update(this.timer.getDelta());
    this.highlight.update();
    this.renderer.render(this.scene, this.nav.camera);
  };

  /** Mouse-look multiplier in fly mode (Settings). */
  setLookSensitivity(value: number) {
    this.nav.setLookSensitivity(value);
  }

  /** Invert the vertical look axis in fly mode (Settings). */
  setInvertY(value: boolean) {
    this.nav.setInvertY(value);
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
    this.nav.resize(w / h);
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
    // Re-apply the floor-plan bands against the new footprint (clear() dropped the
    // meshes but kept the desired regions).
    this.floors.reapply(this.current);
    if (preserveCamera) this.nav.controls.update();
    else this.nav.frame(box);
  }

  /** Center the camera on a single block (local coords of the loaded structure)
   *  and flash a translucent box over it for ~1s so it's easy to spot among
   *  neighbours. */
  focusBlock(pos: [number, number, number]) {
    const center = new THREE.Vector3(pos[0] + 0.5, pos[1] + 0.5, pos[2] + 0.5);
    this.nav.focusOn(center);
    this.highlight.flash(center);
  }

  /** Set (or clear) the floor-plan highlight: one translucent band per named level,
   *  spanning the build's footprint over the level's inclusive y range. */
  setFloorRegions(regions: FloorRegion[]) {
    this.floors.setRegions(regions, this.current);
  }

  /** Remove the current structure and grid from the scene (back to empty). */
  /** The WebGL canvas, so the editor can attach its own pointer/keyboard listeners. */
  get domElement(): HTMLCanvasElement {
    return this.renderer.domElement;
  }

  /** Raycast a screen point against the structure and return the cell `step` units along
   *  the ray from the hit (positive = into the surface, negative = back into the empty cell
   *  in front of it). Using the ray (not the face normal) is robust: a merged face whose
   *  normal points the wrong way would otherwise pick the wrong side. Null on a miss. */
  private rayCell(clientX: number, clientY: number, step: number): [number, number, number] | null {
    if (!this.current) return null;
    const rect = this.renderer.domElement.getBoundingClientRect();
    const ndc = new THREE.Vector2(
      ((clientX - rect.left) / rect.width) * 2 - 1,
      -((clientY - rect.top) / rect.height) * 2 + 1,
    );
    this.raycaster.setFromCamera(ndc, this.nav.camera);
    const hits = this.raycaster.intersectObject(this.current, true);
    if (!hits.length) return null;
    const p = hits[0].point.clone().addScaledVector(this.raycaster.ray.direction, step);
    return [Math.floor(p.x), Math.floor(p.y), Math.floor(p.z)];
  }

  /** The solid block cell under a screen point (Select/etc.). */
  pickBlock(clientX: number, clientY: number): [number, number, number] | null {
    return this.rayCell(clientX, clientY, 0.05);
  }

  /** The empty cell adjacent to the clicked face (Place — drop a block against a surface). */
  pickPlacement(clientX: number, clientY: number): [number, number, number] | null {
    return this.rayCell(clientX, clientY, -0.05);
  }

  /** Highlight the given cells ("x,y,z") as the editor selection. */
  setSelection(cells: string[]): void {
    this.selectionOverlay.set(cells);
  }

  /** Show the live-symmetry mirror plane for `axis` over a `size`-bounded structure (null = off). */
  setSymmetryPlane(axis: 'x' | 'z' | null, size: [number, number, number]): void {
    this.symmetryOverlay.set(axis, size);
  }

  clear() {
    this.lastPieces = null;
    this.highlight.clear();
    this.selectionOverlay.clear();
    this.symmetryOverlay.clear();
    // Drop the live band meshes but keep the desired regions so the next build
    // re-renders the same plan (re-applied at the end of showAssembly).
    this.floors.clearMeshes();
    this.nav.setMode('orbit'); // never leave a stale pointer lock when unloading
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

  /** The live bits the capture paths read/mutate. Callers guard `current` first. */
  private captureContext(): CaptureContext {
    return {
      renderer: this.renderer,
      camera: this.nav.camera,
      controls: this.nav.controls,
      scene: this.scene,
      current: this.current!,
    };
  }

  /** Orbited exterior screenshots (angle 0 = the current camera) for the AI review. */
  capture(angles = 2, opts: SnapOpts = REVIEW_SNAP): string[] {
    if (!this.current) return [];
    if (this.nav.isFly()) this.nav.setMode('orbit');
    this.highlight.clear();
    return captureOrbit(this.captureContext(), angles, opts);
  }

  /** Top-down floor-plan cutaways (interior layout) for the AI review. */
  captureCutaways(opts: SnapOpts = REVIEW_SNAP): string[] {
    if (!this.current) return [];
    if (this.nav.isFly()) this.nav.setMode('orbit');
    this.highlight.clear();
    return captureCutaways(this.captureContext(), opts);
  }

  /** A vertical cross-section screenshot (storey heights / hanging detail) for review. */
  captureSection(opts: SnapOpts = REVIEW_SNAP): string[] {
    if (!this.current) return [];
    if (this.nav.isFly()) this.nav.setMode('orbit');
    this.highlight.clear();
    return captureSection(this.captureContext(), opts);
  }
}
