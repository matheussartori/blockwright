// The 3D viewport: scene setup, lights, structure loading + framing, and the render
// loop. The camera and its navigation modes (orbit / pointer-locked fly) live in a
// CameraController; the other focused concerns are siblings too: mesh building
// (mesh-builder) + texture loading (texture-loader), screenshot paths (capture), the
// floor-plan overlay (floor-regions), the inspector focus box (highlight), and the
// streamed world-viewer mode (world-mode).
import * as THREE from 'three';
import type { BlockwrightApi, ChunkRenderPayload, DimensionId, StructureData, WorldMeta } from '@/shared/types';
import { CameraController, type CameraSnapshot, type NavMode } from './camera-controller';
import { WorldMode } from './world-mode';
import { disposeObject } from './dispose';
import { type CaptureContext, captureCutaways, captureOrbit, captureSection, REVIEW_SNAP, type SnapOpts } from './capture';
import { renderStill, renderTurntable, type StillOpts, type TurntableOpts } from './beauty-render';
import { type FloorRegion, FloorRegionsOverlay } from './floor-regions';
import { FocusHighlight } from './highlight';
import { buildStructure } from './mesh-builder';
import { buildEntities } from './entity-mesh';
import { SelectionOverlay } from './selection-overlay';
import { WorldSelectionOverlay, type HeightHandle, type SelectionPhase } from './region-overlay';
import { SymmetryOverlay } from './symmetry-overlay';
import { HoverOverlay } from './hover-overlay';
import { VoidOverlay, type VoidCell } from './void-overlay';
import { DiffOverlay } from './diff-overlay';
import type { DiffCellMark } from '../diff/diff';
import { TextureLoader } from './texture-loader';
import { WorldGhost } from './world-ghost';
import type { PlaceTurns } from '../world/place';

export type { FloorRegion } from './floor-regions';
export type { NavMode, CameraSnapshot } from './camera-controller';

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

  /** The world editor's box-selection region (filled volume + edges + height handles). */
  private worldSelection = new WorldSelectionOverlay(this.scene);

  private symmetryOverlay = new SymmetryOverlay(this.scene);

  /** Ghost markers over explicit air / structure-void cells ("show voids"). */
  private voidOverlay = new VoidOverlay(this.scene);

  /** A single preview cube at the cell the next paint/place would land on. */
  private hoverOverlay = new HoverOverlay(this.scene);

  /** Structure-diff marks (added/removed/changed cells), persisted across builds. */
  private diffOverlay = new DiffOverlay(this.scene);

  /** The translucent place-into-world preview (world-edit's Place tool). */
  private worldGhost = new WorldGhost(this.scene, this.textures);

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

  /** World-viewer mode (streamed chunks + day/night lighting); inactive in structure mode. */
  private worldMode: WorldMode;

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
      { offscreen, canToggle: () => this.current !== null || this.worldMode.active },
    );
    this.nav.onModeChange = (mode) => this.onModeChange?.(mode);

    const hemi = new THREE.HemisphereLight(0xffffff, 0x6b7280, 1.05);
    this.scene.add(hemi);
    const sun = new THREE.DirectionalLight(0xffffff, 1.5);
    sun.position.set(0.6, 1, 0.45);
    this.scene.add(sun);
    const fill = new THREE.DirectionalLight(0xffffff, 0.5);
    fill.position.set(-0.5, 0.4, -0.6);
    this.scene.add(fill);
    this.worldMode = new WorldMode(this.scene, this.textures, this.nav, { hemi, sun, fill });

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
    this.worldMode.update(this.nav.camera);
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
      group.add(buildEntities(p.data.entities, textures));
      group.rotation.y = (p.quarterTurns * Math.PI) / 2;
      group.position.set(p.offset[0], p.offset[1], p.offset[2]);
      parent.add(group);
    }
    this.current = parent;
    this.scene.add(parent);

    const box = new THREE.Box3().setFromObject(parent);
    this.addGrid(box);
    // Re-apply the floor-plan bands against the new footprint (clear() dropped the
    // meshes but kept the desired regions). Diff marks persist the same way.
    this.floors.reapply(this.current);
    this.diffOverlay.reapply();
    if (preserveCamera) this.nav.controls.update();
    else this.nav.frame(box);
  }

  // ── World mode (delegated to WorldMode — see world-mode.ts) ─────────────────
  /** Enter world-viewer mode: drop any structure and start streaming the world's chunks around the
   *  camera (view-only fly-through). Frames the camera at spawn. */
  enterWorldMode(meta: WorldMeta, api: BlockwrightApi): void {
    this.clear();
    this.worldMode.enter(meta, api);
  }

  /** True while a world is loaded (world mode). */
  get worldActive(): boolean {
    return this.worldMode.active;
  }

  /** Leave world mode: dispose the streamed scene + workers, back to empty. */
  exitWorldMode(): void {
    this.worldGhost.clear();
    this.worldSelection.clear();
    this.worldMode.exit();
  }

  /** Switch the active dimension (Overworld/Nether/End) and re-frame at its origin. */
  setWorldDimension(dim: DimensionId): void {
    this.worldMode.setDimension(dim);
  }

  /** How many chunks stream in around the camera (render-distance control). */
  setWorldRenderDistance(chunks: number): void {
    this.worldMode.setRenderDistance(chunks);
  }

  /** Soft-refresh the streamed world after an asset change (mod workspace / content pack switch):
   *  re-fetch + re-mesh the loaded chunks so newly-known block textures appear, without moving the
   *  camera. No-op when a world isn't active. */
  refreshWorld(): void {
    this.worldMode.refresh();
  }

  /** Day/night lighting for the world view (a mood toggle — no live sky simulation). */
  setDaylight(day: boolean): void {
    this.worldMode.setDaylight(day);
  }

  /** Loaded / pending chunk counts for the HUD streaming indicator. */
  worldStats(): { loaded: number; pending: number } {
    return this.worldMode.stats();
  }

  /** Current camera world position (for the HUD coordinate readout). */
  cameraPosition(): [number, number, number] {
    const p = this.nav.camera.position;
    return [p.x, p.y, p.z];
  }

  /** Camera heading in radians (0 = looking toward -Z / north), for the minimap indicator. */
  cameraYaw(): number {
    const d = this.nav.camera.getWorldDirection(new THREE.Vector3());
    return Math.atan2(d.x, -d.z);
  }

  /** Snapshot the current viewpoint (position + look direction) for per-tab persistence. */
  getCameraState(): CameraSnapshot {
    return this.nav.snapshot();
  }

  /** Restore a viewpoint captured by `getCameraState` (e.g. returning to a tab). */
  applyCameraState(state: CameraSnapshot): void {
    this.nav.restore(state);
  }

  /** Minimap cells (per-chunk top-down colours) for the world map overlay. */
  worldMinimap(): { cx: number; cz: number; color: [number, number, number] }[] {
    return this.worldMode.minimapCells();
  }

  /** Fly the camera to a world coordinate (go-to-coordinate / jump-to-spawn/player). */
  goToWorldCoord(pos: [number, number, number]): void {
    this.worldMode.goTo(pos);
  }

  // ── World editing (delegates + world-space picking) ─────────────────────────
  /** Set/clear the pending-edits compositor applied to streamed chunks at mesh time. */
  setWorldEditOverlay(fn: ((payload: ChunkRenderPayload) => ChunkRenderPayload) | null): void {
    this.worldMode.setEditOverlay(fn);
  }

  /** Preload textures for painted blocks so composited edits mesh textured. */
  ensureWorldTextures(keys: string[]): Promise<void> {
    return this.worldMode.ensureEditTextures(keys);
  }

  /** Re-mesh chunks (keys `"cx,cz"`) from cached payloads — pending edits changed. */
  remeshWorldChunks(keys: string[]): void {
    this.worldMode.remeshChunks(keys);
  }

  /** Re-fetch chunks from main (post-save) so the committed state replaces the composite. */
  invalidateWorldChunks(keys: string[]): void {
    this.worldMode.invalidateChunks(keys);
  }

  /** True when the chunk holding world column (cx,cz) is resident with data (editable). */
  worldChunkLoaded(cx: number, cz: number): boolean {
    return this.worldMode.hasChunkPayload(cx, cz);
  }

  /** Build (or clear, with null) the translucent place-into-world ghost preview. */
  setWorldGhost(data: StructureData | null): Promise<void> {
    return this.worldGhost.show(data);
  }

  /** Position the ghost: its ROTATED min corner at `anchor` (world cells), `turns` CW. */
  placeWorldGhost(anchor: [number, number, number], turns: PlaceTurns): void {
    this.worldGhost.place(anchor, turns);
  }

  /** Raycast the streamed WORLD chunks and return the cell `step` along the ray from the hit —
   *  the world-mode counterpart of `rayCell` (world coords ARE scene coords; border walls and
   *  entities are `noPick`-filtered). Null on a miss or in structure mode. */
  private worldRayCell(clientX: number, clientY: number, step: number): [number, number, number] | null {
    const groups = this.worldMode.chunkObjects();
    if (!groups.length) return null;
    this.aimRay(clientX, clientY);
    const hits = this.raycaster.intersectObjects(groups, true);
    const hit = hits.find((h) => !h.object.userData.noPick);
    if (!hit) return null;
    const p = hit.point.clone().addScaledVector(this.raycaster.ray.direction, step);
    return [Math.floor(p.x), Math.floor(p.y), Math.floor(p.z)];
  }

  /** The solid WORLD block cell under a screen point (erase/recolor/select). */
  pickWorldBlock(clientX: number, clientY: number): [number, number, number] | null {
    return this.worldRayCell(clientX, clientY, 0.05);
  }

  /** The empty WORLD cell adjacent to the clicked face (paint-brush placement). */
  pickWorldPlacement(clientX: number, clientY: number): [number, number, number] | null {
    return this.worldRayCell(clientX, clientY, -0.05);
  }

  /** Show (or clear, with null) the world editor's box-selection region overlay. */
  setWorldSelection(
    region: { min: [number, number, number]; max: [number, number, number] } | null,
    phase: SelectionPhase = 'committed',
  ): void {
    this.worldSelection.set(region, phase);
  }

  /** Tint the hovered/dragged selection height handle (null = none). */
  setWorldSelectionHandleHover(face: HeightHandle | null): void {
    this.worldSelection.setHandleHover(face);
  }

  /** The selection height handle under a screen point, if any. */
  pickWorldSelectionHandle(clientX: number, clientY: number): HeightHandle | null {
    this.aimRay(clientX, clientY);
    return this.worldSelection.pickHandle(this.raycaster);
  }

  /** The world Y where the pick ray passes closest to the vertical line through (x, z) —
   *  what a height-handle drag reads to move the box's top/bottom face. Null when the ray
   *  runs (near-)parallel to the line or the closest point is behind the camera. */
  pickYOnVerticalLine(clientX: number, clientY: number, x: number, z: number): number | null {
    this.aimRay(clientX, clientY);
    const O = this.raycaster.ray.origin;
    const D = this.raycaster.ray.direction;
    const denom = 1 - D.y * D.y; // 1 − (D·up)², both unit vectors
    if (denom < 1e-6) return null;
    const wx = O.x - x;
    const wy = O.y;
    const wz = O.z - z;
    const d = D.x * wx + D.y * wy + D.z * wz; // D·w0
    const t = (D.y * wy - d) / denom; // ray param of the closest approach
    if (t <= 0) return null;
    return wy + t * D.y; // s_c = w0·up − t(D·up) rearranged: closest point's Y on the line
  }

  /** Whether the camera is in pointer-locked fly mode (world-edit picks aim at screen center). */
  get flying(): boolean {
    return this.nav.isFly();
  }

  /** The build-height range [minY, maxY] of a resident world chunk, or null when it isn't
   *  streamed in — clamps selection height drags so a fill can't be refused at save time. */
  worldYRange(cx: number, cz: number): [number, number] | null {
    return this.worldMode.chunkYRange(cx, cz);
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

  /** Aim `this.raycaster` from the camera through a screen point (shared by every pick). */
  private aimRay(clientX: number, clientY: number): void {
    const rect = this.renderer.domElement.getBoundingClientRect();
    const ndc = new THREE.Vector2(
      ((clientX - rect.left) / rect.width) * 2 - 1,
      -((clientY - rect.top) / rect.height) * 2 + 1,
    );
    this.raycaster.setFromCamera(ndc, this.nav.camera);
  }

  /** Raycast a screen point against the structure and return the cell `step` units along
   *  the ray from the hit (positive = into the surface, negative = back into the empty cell
   *  in front of it). Using the ray (not the face normal) is robust: a merged face whose
   *  normal points the wrong way would otherwise pick the wrong side. Null on a miss. */
  private rayCell(clientX: number, clientY: number, step: number): [number, number, number] | null {
    if (!this.current) return null;
    this.aimRay(clientX, clientY);
    const hits = this.raycaster.intersectObject(this.current, true);
    if (!hits.length) return null;
    const p = hits[0].point.clone().addScaledVector(this.raycaster.ray.direction, step);
    return [Math.floor(p.x), Math.floor(p.y), Math.floor(p.z)];
  }

  /** The solid block cell under a screen point (Select/etc.). */
  pickBlock(clientX: number, clientY: number): [number, number, number] | null {
    return this.rayCell(clientX, clientY, 0.05);
  }

  /** The empty cell adjacent to the clicked face — Paint's brush and the Void tool drop into
   *  this cell (against a surface), the same robust ray-step Place used. */
  pickPlacement(clientX: number, clientY: number): [number, number, number] | null {
    return this.rayCell(clientX, clientY, -0.05);
  }

  /** The placement cell pushed `depth` cells DEEPER along the aim ray — the Void tool's
   *  depth stepping (reach the layers behind the first surface). `depth` 0 is exactly
   *  `pickPlacement`; each step walks the ray to the next DISTINCT cell, so it works at
   *  any camera angle (a diagonal ray still advances one cell per step). Null on a miss. */
  pickPlacementAt(clientX: number, clientY: number, depth: number): [number, number, number] | null {
    if (depth <= 0) return this.pickPlacement(clientX, clientY);
    if (!this.current) return null;
    this.aimRay(clientX, clientY);
    const hits = this.raycaster.intersectObject(this.current, true);
    if (!hits.length) return null;
    const dir = this.raycaster.ray.direction;
    // Start just in front of the surface (the depth-0 cell), then micro-step the ray,
    // counting each NEW cell crossed until `depth` more have passed.
    const p = hits[0].point.clone().addScaledVector(dir, -0.05);
    let cell: [number, number, number] = [Math.floor(p.x), Math.floor(p.y), Math.floor(p.z)];
    let remaining = depth;
    const STEP = 0.05;
    for (let i = 0; i < depth * 40 + 200 && remaining > 0; i++) {
      p.addScaledVector(dir, STEP);
      const next: [number, number, number] = [Math.floor(p.x), Math.floor(p.y), Math.floor(p.z)];
      if (next[0] !== cell[0] || next[1] !== cell[1] || next[2] !== cell[2]) {
        cell = next;
        remaining--;
      }
    }
    return remaining === 0 ? cell : null;
  }

  /** The cell where the cursor's ray crosses the axis-aligned CELL LAYER `coord` on `axis`
   *  (0=x, 1=y, 2=z) — a paint stroke locked to the plane it started on (the MagicaVoxel /
   *  Axiom convention) aims here instead of re-picking the surface, so a drag never jumps
   *  depth mid-stroke and can bridge gaps in the surface. Null when the ray runs parallel
   *  to the plane or the plane is behind the camera. */
  pickOnPlane(clientX: number, clientY: number, axis: 0 | 1 | 2, coord: number): [number, number, number] | null {
    this.aimRay(clientX, clientY);
    const origin = this.raycaster.ray.origin;
    const dir = this.raycaster.ray.direction;
    const comp = (v: THREE.Vector3): number => (axis === 0 ? v.x : axis === 1 ? v.y : v.z);
    if (Math.abs(comp(dir)) < 1e-6) return null;
    const t = (coord + 0.5 - comp(origin)) / comp(dir);
    if (!Number.isFinite(t) || t <= 0) return null;
    const p = origin.clone().addScaledVector(dir, t);
    const cell: [number, number, number] = [Math.floor(p.x), Math.floor(p.y), Math.floor(p.z)];
    cell[axis] = coord; // pin exactly to the locked layer (floating-point drift can't leak off it)
    return cell;
  }

  /** The cell directly under the cursor — whatever is nearest there: a solid block OR a void
   *  marker (so the cursor readout can name air/structure_void cells too). Null on a miss.
   *  Unlike `pickBlock`/`pickPlacement` this returns the cell you're POINTING AT, not the one
   *  an edit would target. */
  identifyCell(clientX: number, clientY: number): [number, number, number] | null {
    if (!this.current) return null;
    this.aimRay(clientX, clientY);
    const solid = this.raycaster.intersectObject(this.current, true)[0] ?? null;
    const voids = this.voidOverlay.object;
    const ghost = voids ? this.raycaster.intersectObject(voids, true)[0] ?? null : null;
    const hit = ghost && (!solid || ghost.distance <= solid.distance) ? ghost : solid;
    if (!hit) return null;
    // Step a hair INTO the hit so flooring lands in its own cell (works for the inset marker too).
    const p = hit.point.clone().addScaledVector(this.raycaster.ray.direction, 0.05);
    return [Math.floor(p.x), Math.floor(p.y), Math.floor(p.z)];
  }

  /** Highlight the given cells ("x,y,z") as the editor selection. */
  setSelection(cells: string[]): void {
    this.selectionOverlay.set(cells);
  }

  /** Show the live-symmetry mirror plane for `axis` over a `size`-bounded structure (null = off). */
  setSymmetryPlane(axis: 'x' | 'z' | null, size: [number, number, number]): void {
    this.symmetryOverlay.set(axis, size);
  }

  /** Show ghost markers over the given explicit air / structure-void cells (empty = hidden). */
  setVoids(cells: VoidCell[]): void {
    this.voidOverlay.set(cells);
  }

  /** Show the structure-diff marks (added/removed/changed cells; empty = hidden). The
   *  desired cells persist across rebuilds, like the floor bands. */
  setDiff(cells: DiffCellMark[]): void {
    this.diffOverlay.set(cells);
  }

  /** Preview the cell the next paint/place would affect, in `color` (null = hide). */
  setHover(cell: [number, number, number] | null, color?: number): void {
    this.hoverOverlay.set(cell, color);
  }

  /** Hand the LEFT mouse button to painting (orbit moves to the RIGHT button) while a Paint/
   *  Void tool is active, so a drag paints instead of rotating — the camera-vs-paint split
   *  voxel editors are faulted for blurring. Restores the orbit defaults when off. */
  setPaintNav(on: boolean): void {
    this.nav.setPaintNav(on);
  }

  clear() {
    this.lastPieces = null;
    this.highlight.clear();
    this.selectionOverlay.clear();
    this.worldSelection.clear();
    this.symmetryOverlay.clear();
    this.voidOverlay.clear();
    this.hoverOverlay.clear();
    // Drop the live band/diff meshes but keep the desired regions/marks so the next
    // build re-renders the same plan (re-applied at the end of showAssembly).
    this.floors.clearMeshes();
    this.diffOverlay.clearMeshes();
    this.nav.setMode('orbit'); // never leave a stale pointer lock when unloading
    if (this.current) {
      this.scene.remove(this.current);
      disposeObject(this.current);
      this.current = null;
    }
    if (this.grid) {
      this.scene.remove(this.grid);
      this.grid.geometry.dispose();
      (this.grid.material as THREE.Material).dispose();
      this.grid = null;
    }
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

  /** One high-resolution showcase still (Export ▸ Render Image…) as a PNG data URL. */
  renderStill(opts: StillOpts): string | null {
    if (!this.current) return null;
    if (this.nav.isFly()) this.nav.setMode('orbit');
    this.highlight.clear();
    return renderStill(this.captureContext(), opts);
  }

  /** Record a full-orbit turntable WebM of the loaded build (Export ▸ Render Image…). */
  renderTurntable(opts: TurntableOpts): Promise<Blob> | null {
    if (!this.current) return null;
    if (this.nav.isFly()) this.nav.setMode('orbit');
    this.highlight.clear();
    return renderTurntable(this.captureContext(), opts);
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
