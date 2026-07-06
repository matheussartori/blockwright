// World-viewer mode, extracted from the Viewer: owns the streamed WorldView's
// lifecycle (enter/exit, dimension, render distance, soft refresh), the day/night
// lighting mood, the HUD readouts (stats/minimap) and the world camera framing.
// The Viewer keeps its public world-mode method surface and delegates here, so
// structure mode and the render loop stay uncluttered.
import * as THREE from 'three';
import type { BlockwrightApi, DimensionId, WorldMeta } from '@/shared/types';
import { type MinimapCell, WorldView } from '../world/world-view';
import type { CameraController } from './camera-controller';
import type { TextureLoader } from './texture-loader';

/** The scene lights the day/night toggle dims (created and owned by the Viewer). */
export interface WorldLights {
  hemi: THREE.HemisphereLight;
  sun: THREE.DirectionalLight;
  fill: THREE.DirectionalLight;
}

export class WorldMode {
  /** The streamed world view; null in structure mode. */
  private world: WorldView | null = null;

  constructor(
    private scene: THREE.Scene,
    private textures: TextureLoader,
    private nav: CameraController,
    private lights: WorldLights,
  ) {}

  /** True while a world is loaded (world mode). */
  get active(): boolean {
    return this.world !== null;
  }

  /** Per-frame streaming update; no-op in structure mode. */
  update(camera: THREE.Camera): void {
    this.world?.update(camera);
  }

  /** Enter world-viewer mode: start streaming the world's chunks around the camera
   *  (view-only fly-through). Frames the camera at spawn. */
  enter(meta: WorldMeta, api: BlockwrightApi): void {
    this.world?.dispose();
    const dim: DimensionId = meta.dimensions[0]?.id ?? 'minecraft:overworld';
    this.world = new WorldView(this.scene, this.textures, api, dim);
    this.frameAt(meta.spawn);
    // Dev-only (BW_WORLD_LOOK): aim the initial camera at an explicit target for headless capture.
    if (meta.debugLook) {
      this.nav.camera.position.set(meta.spawn[0], meta.spawn[1], meta.spawn[2]);
      this.nav.controls.target.set(meta.debugLook[0], meta.debugLook[1], meta.debugLook[2]);
      this.nav.controls.update();
    }
  }

  /** Leave world mode: dispose the streamed scene + workers, back to empty. */
  exit(): void {
    this.world?.dispose();
    this.world = null;
    this.nav.setMode('orbit');
    this.setDaylight(true); // don't leave structure mode dark if the user toggled night
  }

  /** Switch the active dimension (Overworld/Nether/End) and re-frame at its origin. */
  setDimension(dim: DimensionId): void {
    this.world?.setDimension(dim);
  }

  /** How many chunks stream in around the camera (render-distance control). */
  setRenderDistance(chunks: number): void {
    this.world?.setRenderDistance(chunks);
  }

  /** Soft-refresh the streamed world after an asset change (mod workspace / content pack switch):
   *  re-fetch + re-mesh the loaded chunks so newly-known block textures appear, without moving the
   *  camera. No-op when a world isn't active. */
  refresh(): void {
    this.world?.refresh();
  }

  // ── World editing delegates (see WorldView's world-editing hooks) ───────────────────
  /** Set/clear the pending-edits payload compositor. */
  setEditOverlay(fn: Parameters<WorldView['setOverlay']>[0]): void {
    this.world?.setOverlay(fn);
  }

  /** Preload textures for painted blocks so composited edits mesh textured. */
  async ensureEditTextures(keys: string[]): Promise<void> {
    await this.world?.ensureTextures(keys);
  }

  /** Re-mesh chunks from cached payloads (pending-edit change). Keys are `"cx,cz"`. */
  remeshChunks(keys: string[]): void {
    this.world?.remesh(keys);
  }

  /** Re-fetch chunks from main (post-save: the committed state replaces the composite). */
  invalidateChunks(keys: string[]): void {
    this.world?.invalidate(keys);
  }

  /** Resident chunk mesh groups, for world picking. */
  chunkObjects(): THREE.Object3D[] {
    return this.world?.chunkObjects() ?? [];
  }

  /** True when the chunk holding this cell is resident with data (an editable target). */
  hasChunkPayload(cx: number, cz: number): boolean {
    return this.world?.hasPayload(cx, cz) ?? false;
  }

  /** Day/night lighting for the world view (a mood toggle — no live sky simulation). */
  setDaylight(day: boolean): void {
    const { hemi, sun, fill } = this.lights;
    hemi.intensity = day ? 1.05 : 0.35;
    hemi.groundColor.set(day ? 0x6b7280 : 0x14161c);
    hemi.color.set(day ? 0xffffff : 0x8895b3);
    sun.intensity = day ? 1.5 : 0.35;
    sun.color.set(day ? 0xffffff : 0xaab6d8);
    fill.intensity = day ? 0.5 : 0.2;
  }

  /** Loaded / pending chunk counts for the HUD streaming indicator. */
  stats(): { loaded: number; pending: number } {
    return this.world?.stats() ?? { loaded: 0, pending: 0 };
  }

  /** Minimap cells (per-chunk top-down colours) for the world map overlay. */
  minimapCells(): MinimapCell[] {
    return this.world?.minimapCells() ?? [];
  }

  /** Fly the camera to a world coordinate (go-to-coordinate / jump-to-spawn/player). */
  goTo(pos: [number, number, number]): void {
    if (!this.world) return;
    this.frameAt(pos);
  }

  /** Position the camera near a world point with a HORIZONTAL fly-through view (looking across the
   *  landscape, not down at it). The render distance controls how far chunks STREAM, not the start. */
  private frameAt(pos: [number, number, number]): void {
    const s = 24; // half-span in blocks — sets fly speed + near/far clip
    const box = new THREE.Box3(
      new THREE.Vector3(pos[0] - s, pos[1] - 4, pos[2] - s),
      new THREE.Vector3(pos[0] + s, pos[1] + s, pos[2] + s),
    );
    this.nav.frame(box);
    // Override to a ground-level, near-horizontal view (a proper fly-through start).
    this.nav.camera.position.set(pos[0], pos[1] + 14, pos[2] + 34);
    this.nav.controls.target.set(pos[0], pos[1] + 6, pos[2]);
    this.nav.controls.update();
  }
}
