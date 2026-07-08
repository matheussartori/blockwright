// Owns the streamed world scene: a map of loaded chunk meshes, a camera-distance load queue, the
// worker pool that builds their geometry, frustum culling, LOD bands (near full geometry / mid
// heightmap surface / far colour tile) that re-mesh as the camera moves, and LRU eviction under a
// hard memory cap. The viewer calls `update(camera)` each frame; this requests the chunks around the
// camera over IPC, meshes them off-thread at the right LOD, and adds/removes chunk groups — the
// whole world stays viewable without holding it all in memory.
import * as THREE from 'three';
import type { BlockwrightApi, ChunkRenderPayload, DimensionId, StructureEntity } from '@/shared/types';
import type { LoadedTexture, TextureLoader } from '../viewer/texture-loader';
import { disposeObject } from '../viewer/dispose';
import { geometryFor, materialFor } from '../viewer/mesh-builder';
import { buildEntities } from '../viewer/entity-mesh';
import { BORDER_PLANE_BYTES, occluderStates, type MaterialBuffers, type NeighborBorders } from '../viewer/geometry-core';
import type { TexInfo } from '../viewer/model-geometry';
import { computeBorderPlanes, type ChunkBorderPlanes } from './chunk-borders';
import { WorkerPool } from './worker-pool';
import { chunkSurfaceColor } from './surface';
import { DEFAULT_BANDS, lodForDistance, type LodBands } from './lod';
import type { LodLevel } from './worker-protocol';

/** One chunk's map cell for the 2D minimap. */
export interface MinimapCell {
  cx: number;
  cz: number;
  color: [number, number, number];
}

// Java world build range (1.18+). The chunk bounding box for frustum culling spans this in Y.
const WORLD_MIN_Y = -64;
const WORLD_MAX_Y = 320;

// An occluder plane that's solid at every cell — stands in for an UNGENERATED neighbour chunk, so a
// chunk at the generated-world edge culls the raw terrain cross-section (the ugly "paredão") toward
// the void; a translucent red world-border wall is drawn there instead.
const FULL_BORDER_PLANE = new Uint8Array(BORDER_PLANE_BYTES).fill(0xff);
/** The four neighbour directions, with the border key they feed + the local face plane for the wall. */
type EdgeDir = { dx: number; dz: number; bit: number; plane: keyof NeighborBorders };
const EDGE_DIRS: EdgeDir[] = [
  { dx: -1, dz: 0, bit: 1, plane: 'xNeg' },
  { dx: 1, dz: 0, bit: 2, plane: 'xPos' },
  { dx: 0, dz: -1, bit: 4, plane: 'zNeg' },
  { dx: 0, dz: 1, bit: 8, plane: 'zPos' },
];

const MAX_INFLIGHT = 6; // concurrent chunk IPC requests
const EVICT_MARGIN = 2; // chunks kept past the render edge before eviction
const DEFAULT_MAX_LOADED = 1400; // default resident-chunk cap — Settings ▸ World tunes it per machine

const key = (cx: number, cz: number): string => `${cx},${cz}`;

interface ChunkEntry {
  cx: number;
  cz: number;
  group: THREE.Group | null;
  /** Cached resolved payload, so a LOD change re-meshes without re-fetching. */
  payload: ChunkRenderPayload | null;
  tex: [string, TexInfo][] | null;
  /** LOD the current `group` was built at (null = none yet). */
  lod: LodLevel | null;
  /** LOD currently being meshed (null = idle). */
  pendingLod: LodLevel | null;
  jobId: number | null;
  empty: boolean;
  /** True when the chunk is UNGENERATED (no region data) — a hard world-generation edge, drawn as a
   *  translucent red border wall and treated as solid so neighbours cull their cross-section toward it. */
  absent: boolean;
  /** This chunk's exposed edge occluder planes (lazy, memoised) — consumed by its neighbours' near
   *  builds for cross-chunk face culling. */
  borders: ChunkBorderPlanes | null;
  /** Bitmask of which of the four neighbours' borders were available when this chunk was last
   *  near-meshed (bit 0=W,1=E,2=N,3=S), so a seam re-meshes once a late neighbour arrives. */
  meshedNeighbors: number;
  /** Marked by `refresh()` (workspace/content switch): the cached payload was resolved against the
   *  OLD asset source, so the chunk must re-fetch + re-mesh. Its current `group` stays on screen until
   *  the reload swaps in (no flash); `pump`/`recomputeDesired` re-queue it despite already existing. */
  stale: boolean;
}

export class WorldView {
  private readonly pool: WorkerPool;
  /** Resident-chunk hard cap (Settings ▸ World's chunk memory budget). */
  private maxLoaded = DEFAULT_MAX_LOADED;
  private readonly chunks = new Map<string, ChunkEntry>();
  private readonly texInfo = new Map<string, TexInfo>();
  private readonly loaded = new Map<string, LoadedTexture>();
  private readonly matCache = new Map<string, THREE.MeshLambertMaterial>();
  /** Shared translucent-red material for the world-generation border wall (Minecraft world-border look). */
  private readonly borderMat = new THREE.MeshBasicMaterial({
    color: 0xff3030,
    transparent: true,
    opacity: 0.22,
    side: THREE.DoubleSide,
    depthWrite: false,
  });
  /** Per-chunk top-down colour for the minimap (persists across eviction — the map keeps filling). */
  private readonly minimap = new Map<string, MinimapCell>();
  /** Block ids that fell back to flat colours in streamed chunks (missing model/texture) —
   *  the world-side missing-texture diagnostics. Persists across eviction; cleared on
   *  dimension change / asset refresh (the re-resolution may now know them). */
  private readonly missingTex = new Set<string>();
  private queue: { cx: number; cz: number }[] = [];

  private centerX = NaN;
  private centerZ = NaN;
  private inflight = 0;
  private epoch = 0; // bumped on dimension change / dispose to drop stale async results
  renderDistance: number;
  private bands: LodBands = DEFAULT_BANDS;
  /** World-edit compositor: applied to a chunk's cached payload at MESH time (pending edits are
   *  overlaid without ever mutating the cached original). Null = no overlay (the common case). */
  private overlay: ((payload: ChunkRenderPayload) => ChunkRenderPayload) | null = null;

  constructor(
    private readonly scene: THREE.Scene,
    private readonly textures: TextureLoader,
    private readonly api: BlockwrightApi,
    private dim: DimensionId = 'minecraft:overworld',
    renderDistance = 10, // modest first-open default; the HUD control pushes it out to the max band
    tuning?: { chunkCap?: number; meshWorkers?: number },
  ) {
    this.renderDistance = renderDistance;
    if (tuning?.chunkCap && tuning.chunkCap > 0) this.maxLoaded = tuning.chunkCap;
    // 0/undefined = auto (the pool derives its size from the machine's cores); an
    // explicit count is clamped — each worker holds a THREE bundle.
    this.pool = new WorkerPool(
      tuning?.meshWorkers && tuning.meshWorkers > 0 ? Math.min(8, Math.round(tuning.meshWorkers)) : undefined,
    );
    this.applyBands();
  }

  /** Live-tune the resident-chunk cap (Settings ▸ World). Worker count applies on the
   *  next world open — the pool is fixed at construction. */
  setChunkCap(cap: number): void {
    if (cap > 0) {
      this.maxLoaded = cap;
      this.centerX = NaN; // re-evaluate eviction next frame
    }
  }

  setDimension(dim: DimensionId): void {
    if (dim === this.dim) return;
    this.dim = dim;
    this.reset();
  }

  setRenderDistance(chunks: number): void {
    this.renderDistance = Math.max(2, Math.round(chunks));
    this.applyBands();
    this.centerX = NaN; // force a desired-set recompute next frame
  }

  /** Soft-refresh after an asset-resolution change (mod workspace / content pack switch): every loaded
   *  chunk's cached payload was resolved against the old asset source, so re-fetch + re-mesh each one so
   *  the newly-known block textures appear. The camera is untouched — we keep each chunk's current mesh
   *  on screen and only swap it when its rebuild returns (no reload flash) — and the whole thing rides
   *  the normal streaming machinery: mark every chunk `stale`, drop its stale resolution, and force a
   *  desired-set recompute so `recomputeDesired`/`pump` re-queue the stale chunks from the current
   *  camera position. Block resolution is main-side, so re-fetching `getChunk` is what picks up the new
   *  textures — re-meshing the cached payload alone would not. */
  refresh(): void {
    if (!this.chunks.size) return;
    this.missingTex.clear(); // the new asset source may resolve what the old one missed
    this.epoch++; // invalidate any in-flight streaming/mesh results resolved before the switch
    for (const e of this.chunks.values()) {
      if (e.jobId !== null) {
        this.pool.cancel(e.jobId);
        e.jobId = null;
      }
      e.stale = true;
      e.pendingLod = null;
      e.payload = null;
      e.tex = null;
      e.borders = null;
      e.meshedNeighbors = 0;
      e.empty = false;
      e.absent = false;
      // e.group + e.lod are kept: the old mesh stays visible (and its LOD band via hysteresis) until
      // the reload swaps in.
    }
    this.centerX = NaN; // force recomputeDesired next frame → re-queues every stale chunk
  }

  // ── World editing hooks ─────────────────────────────────────────────────────────────

  /** Set (or clear) the pending-edits compositor. Callers follow up with `remesh` for the chunks
   *  whose composite changed — setting the overlay alone re-meshes nothing. */
  setOverlay(fn: ((payload: ChunkRenderPayload) => ChunkRenderPayload) | null): void {
    this.overlay = fn;
  }

  /** Load + register textures for overlay palette entries (a painted block's textures aren't in
   *  any streamed chunk's key list), so composited blocks mesh textured instead of flat-colored. */
  async ensureTextures(keys: string[]): Promise<void> {
    const missing = keys.filter((k) => !this.texInfo.has(k));
    if (!missing.length) return;
    const loaded = await this.textures.load(missing);
    for (const [tk, lt] of loaded) {
      this.loaded.set(tk, lt);
      this.texInfo.set(tk, { frames: lt.frames, translucent: lt.translucent, avgColor: lt.avgColor });
    }
  }

  /** Re-mesh specific chunks from their CACHED payloads (no re-fetch) — the overlay compositor
   *  runs again, so pending-edit changes show. Forces past an identical in-flight LOD build. */
  remesh(keys: string[]): void {
    for (const k of keys) {
      const e = this.chunks.get(k);
      if (!e || !e.payload) continue;
      if (e.jobId !== null) this.pool.cancel(e.jobId);
      e.jobId = null;
      e.pendingLod = null;
      this.mesh(e, this.lodFor(e));
    }
  }

  /** Drop specific chunks' cached payloads and re-fetch them from main (after a Save-to-World the
   *  committed state must replace the local composite). Their current meshes stay until the reload
   *  swaps in. */
  invalidate(keys: string[]): void {
    let any = false;
    for (const k of keys) {
      const e = this.chunks.get(k);
      if (!e) continue;
      if (e.jobId !== null) this.pool.cancel(e.jobId);
      e.jobId = null;
      e.stale = true;
      e.pendingLod = null;
      e.payload = null;
      e.tex = null;
      e.borders = null;
      e.meshedNeighbors = 0;
      e.empty = false;
      e.absent = false;
      any = true;
    }
    if (any) this.centerX = NaN; // force recomputeDesired → re-queues the stale chunks
  }

  /** The resident chunk mesh groups (for world picking). Border walls + entities inside are marked
   *  `userData.noPick` at assembly. */
  chunkObjects(): THREE.Object3D[] {
    const out: THREE.Object3D[] = [];
    for (const e of this.chunks.values()) if (e.group) out.push(e.group);
    return out;
  }

  /** True when a chunk is resident with a payload (edits target only chunks we actually hold). */
  hasPayload(cx: number, cz: number): boolean {
    return !!this.chunks.get(key(cx, cz))?.payload;
  }

  /** The world-Y block range spanned by a resident chunk's sections — the same range the
   *  save gate accepts edits in (decoded sections include the uniform-air ones), so the
   *  selection height handles clamp to it. Null when the chunk isn't resident. */
  yRangeOf(cx: number, cz: number): [number, number] | null {
    const payload = this.chunks.get(key(cx, cz))?.payload;
    if (!payload?.sections.length) return null;
    let lo = Infinity;
    let hi = -Infinity;
    for (const s of payload.sections) {
      lo = Math.min(lo, s.sectionY);
      hi = Math.max(hi, s.sectionY);
    }
    return [lo * 16, hi * 16 + 15];
  }

  /** LOD bands scale with render distance: near/mid keep their defaults but never exceed it. */
  private applyBands(): void {
    const rd = this.renderDistance;
    this.bands = {
      near: Math.min(DEFAULT_BANDS.near, rd),
      mid: Math.min(DEFAULT_BANDS.mid, rd),
      max: rd,
    };
  }

  update(camera: THREE.Camera): void {
    const ccx = Math.floor(camera.position.x / 16);
    const ccz = Math.floor(camera.position.z / 16);
    if (ccx !== this.centerX || ccz !== this.centerZ) {
      this.centerX = ccx;
      this.centerZ = ccz;
      this.recomputeDesired();
    }
    this.pump();
    this.retargetLod();
    this.cull(camera);
  }

  private dist(cx: number, cz: number): number {
    return Math.max(Math.abs(cx - this.centerX), Math.abs(cz - this.centerZ));
  }

  private recomputeDesired(): void {
    const r = this.renderDistance;
    const wanted = new Set<string>();
    const pending: { cx: number; cz: number; d: number }[] = [];
    for (let dz = -r; dz <= r; dz++) {
      for (let dx = -r; dx <= r; dx++) {
        const cx = this.centerX + dx;
        const cz = this.centerZ + dz;
        const k = key(cx, cz);
        wanted.add(k);
        const e = this.chunks.get(k);
        // Not loaded yet, OR stale (a refresh() marked it for re-fetch) → (re)queue it.
        if (!e || e.stale) pending.push({ cx, cz, d: Math.max(Math.abs(dx), Math.abs(dz)) });
      }
    }
    pending.sort((a, b) => a.d - b.d);
    this.queue = pending.map((p) => ({ cx: p.cx, cz: p.cz }));

    // Evict chunks beyond the render edge + margin.
    for (const [k, e] of this.chunks) {
      if (this.dist(e.cx, e.cz) > r + EVICT_MARGIN && !wanted.has(k)) this.evict(k, e);
    }
    // Hard memory cap: if still over, drop the farthest resident chunks.
    if (this.chunks.size > this.maxLoaded) {
      const byDist = [...this.chunks.entries()].sort(
        (a, b) => this.dist(b[1].cx, b[1].cz) - this.dist(a[1].cx, a[1].cz),
      );
      for (const [k, e] of byDist) {
        if (this.chunks.size <= this.maxLoaded) break;
        this.evict(k, e);
      }
    }
  }

  private pump(): void {
    while (this.inflight < MAX_INFLIGHT && this.queue.length) {
      const { cx, cz } = this.queue.shift()!;
      const k = key(cx, cz);
      const existing = this.chunks.get(k);
      if (existing && !existing.stale) continue; // already resident (a stale one still needs reloading)
      void this.load(cx, cz);
    }
  }

  private async load(cx: number, cz: number): Promise<void> {
    const k = key(cx, cz);
    // A stale entry (marked by refresh()) is RELOADED in place: reuse it so its current mesh stays on
    // screen until the rebuild swaps in. A fresh coord gets a new entry.
    let entry = this.chunks.get(k);
    if (entry) {
      entry.stale = false; // claim it
    } else {
      entry = { cx, cz, group: null, payload: null, tex: null, lod: null, pendingLod: null, jobId: null, empty: false, absent: false, borders: null, meshedNeighbors: 0, stale: false };
      this.chunks.set(k, entry);
    }
    this.inflight++;
    const epoch = this.epoch;
    try {
      const payload = await this.api.getChunk(this.dim, cx, cz);
      if (epoch !== this.epoch || this.chunks.get(k) !== entry) return;
      if (!payload) {
        // Ungenerated: a hard world-generation edge. A loaded neighbour re-meshes on the next frame
        // (retargetLod sees the neighbour mask change) to cull its cross-section toward here and grow
        // the red border wall.
        entry.absent = true;
        this.dropGroup(entry); // a reload that turned ungenerated: drop the stale mesh
        return;
      }
      if (payload.empty) {
        entry.empty = true;
        this.dropGroup(entry);
        return;
      }
      const loaded = await this.textures.load(payload.textureKeys);
      if (epoch !== this.epoch || this.chunks.get(k) !== entry) return;
      for (const [tk, lt] of loaded) {
        this.loaded.set(tk, lt);
        this.texInfo.set(tk, { frames: lt.frames, translucent: lt.translucent, avgColor: lt.avgColor });
      }
      const tex: [string, TexInfo][] = [];
      for (const tk of payload.textureKeys) {
        const info = this.texInfo.get(tk);
        if (info) tex.push([tk, info]);
      }
      entry.payload = payload;
      entry.tex = tex;
      // Track the flat-colour fallbacks (unresolved model/texture) for the HUD diagnostics.
      for (const p of payload.palette) {
        if (!p.air && p.models.length === 0) this.missingTex.add(p.name);
      }
      this.minimap.set(k, { cx, cz, color: chunkSurfaceColor(payload, this.texInfo) });
      this.mesh(entry, this.lodFor(entry));
    } finally {
      this.inflight--;
      if (epoch === this.epoch) this.pump();
    }
  }

  /** The LOD a chunk should be at right now, given its distance and current level (hysteresis). */
  private lodFor(entry: ChunkEntry): LodLevel {
    return lodForDistance(this.dist(entry.cx, entry.cz), this.bands, entry.lod ?? undefined) ?? 'near';
  }

  /** Re-mesh chunks whose LOD band changed as the camera moved, or whose neighbour borders became
   *  available since they were last near-meshed (so a chunk drawn before its neighbour loaded drops
   *  the now-buried seam faces). Idle chunks only. */
  private retargetLod(): void {
    for (const e of this.chunks.values()) {
      if (!e.payload || e.pendingLod !== null) continue;
      const want = this.lodFor(e);
      if (want !== e.lod) {
        this.mesh(e, want);
      } else if (want === 'near' && this.neighborMask(e.cx, e.cz) !== e.meshedNeighbors) {
        this.mesh(e, 'near');
      }
    }
  }

  /** This chunk's exposed edge occluder planes, computed once from its payload and memoised. */
  private bordersFor(e: ChunkEntry): ChunkBorderPlanes | null {
    if (e.borders) return e.borders;
    if (!e.payload || !e.tex) return null;
    const occ = occluderStates(e.payload.palette, new Map(e.tex));
    e.borders = computeBorderPlanes(e.payload, occ);
    return e.borders;
  }

  /** A neighbour is a WORLD-GENERATION EDGE when it's ungenerated (no region data) OR an empty
   *  proto-chunk (region entry but zero sections) — both mark the boundary of real terrain, drawn as
   *  a red border wall with the terrain cross-section culled, rather than the raw sliced "paredão". */
  private isEdge(e: ChunkEntry): boolean {
    return e.absent || e.empty;
  }

  /** Bitmask of which of the four neighbours of (cx,cz) are in a KNOWN state (loaded with edge planes,
   *  or a generation edge) — a change flips a bit and re-meshes the seam (retargetLod). */
  private neighborMask(cx: number, cz: number): number {
    let mask = 0;
    for (const d of EDGE_DIRS) {
      const e = this.chunks.get(key(cx + d.dx, cz + d.dz));
      if (e && (this.isEdge(e) || (e.payload && e.tex))) mask |= d.bit;
    }
    return mask;
  }

  /** The exposed edge plane a neighbour in direction `d` presents to (cx,cz): the loaded chunk's
   *  facing edge, a FULL plane for a generation edge, or null when not yet known. */
  private edgePlaneFrom(e: ChunkEntry | undefined, d: EdgeDir): Uint8Array | null {
    if (!e) return null;
    if (this.isEdge(e)) return FULL_BORDER_PLANE;
    const planes = this.bordersFor(e);
    if (!planes) return null;
    // The neighbour presents the edge facing this chunk (opposite of the direction we look).
    return d.plane === 'xNeg' ? planes.east : d.plane === 'xPos' ? planes.west : d.plane === 'zNeg' ? planes.south : planes.north;
  }

  /** Gather the four adjacent chunks' facing edge planes for a near build (undefined where a neighbour
   *  isn't known yet), plus which sides are generation edges (drawn as red border walls). */
  private neighborBorders(cx: number, cz: number): { borders: NeighborBorders; mask: number; edges: EdgeDir[] } {
    const borders: NeighborBorders = {};
    const edges: EdgeDir[] = [];
    let mask = 0;
    for (const d of EDGE_DIRS) {
      const e = this.chunks.get(key(cx + d.dx, cz + d.dz));
      const plane = this.edgePlaneFrom(e, d);
      if (plane) {
        borders[d.plane] = plane;
        mask |= d.bit;
        if (e && this.isEdge(e)) edges.push(d);
      }
    }
    return { borders, mask, edges };
  }

  /** Every payload texture key we have info for, as the worker's tex list. */
  private texListFor(payload: ChunkRenderPayload): [string, TexInfo][] {
    const tex: [string, TexInfo][] = [];
    for (const tk of payload.textureKeys) {
      const info = this.texInfo.get(tk);
      if (info) tex.push([tk, info]);
    }
    return tex;
  }

  /** Dispatch a mesh build for `entry` at `lod`, swapping the group in when it returns. */
  private mesh(entry: ChunkEntry, lod: LodLevel): void {
    if (!entry.payload || !entry.tex) return;
    if (entry.pendingLod === lod) return;
    if (entry.jobId !== null) this.pool.cancel(entry.jobId); // supersede an in-flight build
    entry.pendingLod = lod;
    const epoch = this.epoch;
    const { cx, cz } = entry;
    // Pending world edits composite over the CACHED payload at mesh time (original untouched). A
    // composited payload can reference extra textures (the painted block's) — rebuild its tex list.
    const source = entry.payload;
    const payload = this.overlay ? this.overlay(source) : source;
    const tex = payload === source ? entry.tex : this.texListFor(payload);
    // Near builds cull faces against solid neighbours; record which neighbours we had so a late
    // arrival re-meshes the seam. Mid/far (surface LOD) don't need borders.
    let borders: NeighborBorders | undefined;
    let edgeSides: EdgeDir[] = [];
    if (lod === 'near') {
      const nb = this.neighborBorders(cx, cz);
      borders = nb.borders;
      edgeSides = nb.edges;
      entry.meshedNeighbors = nb.mask;
    }
    entry.jobId = this.pool.build(lod, payload, tex, borders, (buffers) => {
      entry.pendingLod = null;
      entry.jobId = null;
      if (epoch !== this.epoch || this.chunks.get(key(cx, cz)) !== entry) return;
      // Entities are drawn only at the near LOD (they're small detail, pointless over a surface mesh).
      const entities = lod === 'near' ? payload.entities : [];
      const next = this.assemble(buffers, cx, cz, edgeSides, entities);
      const old = entry.group;
      this.scene.add(next);
      if (old) {
        this.scene.remove(old);
        disposeGeometries(old);
      }
      entry.group = next;
      entry.lod = lod;
    });
  }

  private assemble(
    buffers: MaterialBuffers[],
    cx: number,
    cz: number,
    edgeSides: EdgeDir[] = [],
    entities: StructureEntity[] = [],
  ): THREE.Group {
    const group = new THREE.Group();
    for (const mb of buffers) {
      let mat = this.matCache.get(mb.key);
      if (!mat) {
        mat = materialFor(mb, this.loaded);
        this.matCache.set(mb.key, mat);
      }
      group.add(new THREE.Mesh(geometryFor(mb), mat));
    }
    for (const d of edgeSides) group.add(this.borderWall(d));
    if (entities.length) {
      // Entity `pos` is ABSOLUTE world coords; the chunk group sits at (cx*16, 0, cz*16), so an inner
      // group at the negated origin cancels it out and lands each entity at its true world position.
      const ents = buildEntities(entities, this.loaded);
      ents.position.set(-cx * 16, 0, -cz * 16);
      ents.traverse((o) => (o.userData.noPick = true)); // world picking targets terrain, not entities
      group.add(ents);
    }
    group.position.set(cx * 16, 0, cz * 16);
    return group;
  }

  /** A translucent red world-border wall on the chunk face toward an ungenerated neighbour, spanning
   *  the full build height (chunk-local coords; the group is positioned at the chunk origin). */
  private borderWall(d: EdgeDir): THREE.Mesh {
    const y0 = WORLD_MIN_Y;
    const y1 = WORLD_MAX_Y;
    let verts: number[];
    if (d.dx !== 0) {
      const x = d.dx < 0 ? 0 : 16; // west face at x=0, east face at x=16
      verts = [x, y0, 0, x, y0, 16, x, y1, 16, x, y1, 0];
    } else {
      const z = d.dz < 0 ? 0 : 16; // north face at z=0, south face at z=16
      verts = [0, y0, z, 16, y0, z, 16, y1, z, 0, y1, z];
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(verts), 3));
    geo.setIndex([0, 1, 2, 0, 2, 3]);
    const mesh = new THREE.Mesh(geo, this.borderMat);
    mesh.userData.noPick = true; // a translucent marker, never a paint/pick target
    return mesh;
  }

  private cull(camera: THREE.Camera): void {
    const frustum = new THREE.Frustum().setFromProjectionMatrix(
      new THREE.Matrix4().multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse),
    );
    const box = new THREE.Box3();
    for (const e of this.chunks.values()) {
      if (!e.group) continue;
      box.min.set(e.cx * 16, WORLD_MIN_Y, e.cz * 16);
      box.max.set(e.cx * 16 + 16, WORLD_MAX_Y, e.cz * 16 + 16);
      e.group.visible = frustum.intersectsBox(box);
    }
  }

  /** Remove a chunk's current mesh group (keeping the entry) — used when a reload finds the chunk is
   *  now empty/ungenerated, so its stale mesh shouldn't linger. */
  private dropGroup(e: ChunkEntry): void {
    if (!e.group) return;
    this.scene.remove(e.group);
    disposeGeometries(e.group);
    e.group = null;
    e.lod = null;
  }

  private evict(k: string, e: ChunkEntry): void {
    if (e.jobId !== null) this.pool.cancel(e.jobId);
    if (e.group) {
      this.scene.remove(e.group);
      disposeGeometries(e.group);
    }
    this.chunks.delete(k);
  }

  private reset(): void {
    this.epoch++;
    for (const [k, e] of this.chunks) this.evict(k, e);
    this.queue = [];
    this.inflight = 0;
    this.centerX = NaN;
    this.centerZ = NaN;
    this.clearMinimap();
    this.missingTex.clear();
  }

  dispose(): void {
    this.reset();
    this.pool.dispose();
    for (const mat of this.matCache.values()) mat.dispose();
    this.matCache.clear();
    this.borderMat.dispose();
  }

  /** Every mapped chunk's top-down colour for the 2D minimap (accumulates as you explore). */
  minimapCells(): MinimapCell[] {
    return [...this.minimap.values()];
  }

  /** Reset per-world minimap data (dimension switch). */
  private clearMinimap(): void {
    this.minimap.clear();
  }

  /** Loaded / pending chunk counts (+ the missing-texture tally) for the HUD readouts. */
  stats(): { loaded: number; pending: number; missing: number } {
    let ready = 0;
    for (const e of this.chunks.values()) if (e.group || e.empty || e.absent) ready++;
    return { loaded: ready, pending: this.queue.length + this.inflight, missing: this.missingTex.size };
  }

  /** Block ids that render as flat colours in the streamed chunks (missing model/texture),
   *  sorted — the world-side missing-texture diagnostics the HUD surfaces. */
  missingTextures(): string[] {
    return [...this.missingTex].sort();
  }

  /** Find blocks by id in the LOADED area (the resident chunk payloads — no disk scan):
   *  substring match on the block name, results sorted by distance to `from`, capped. A
   *  UNIFORM matching section (a solid slab of the block) yields ONE representative hit
   *  at its centre rather than 4096. Returns the shown hits + the total tally. */
  findBlocks(query: string, from: [number, number, number], cap = 300): { hits: { pos: [number, number, number]; name: string }[]; total: number } {
    const q = query.trim().toLowerCase().replace(/^minecraft:/, '');
    if (!q) return { hits: [], total: 0 };
    const hits: { pos: [number, number, number]; name: string; d: number }[] = [];
    let total = 0;
    const dist2 = (x: number, y: number, z: number) =>
      (x - from[0]) ** 2 + (y - from[1]) ** 2 + (z - from[2]) ** 2;
    for (const e of this.chunks.values()) {
      const payload = e.payload;
      if (!payload) continue;
      const matching = new Set<number>();
      for (let i = 0; i < payload.palette.length; i++) {
        const p = payload.palette[i];
        if (!p.air && p.name.replace('minecraft:', '').includes(q)) matching.add(i);
      }
      if (!matching.size) continue;
      const bx = e.cx * 16;
      const bz = e.cz * 16;
      for (const s of payload.sections) {
        const by = s.sectionY * 16;
        if (s.uniform || !s.blocks) {
          if (matching.has(s.fill)) {
            total += 4096;
            const name = payload.palette[s.fill].name;
            hits.push({ pos: [bx + 8, by + 8, bz + 8], name, d: dist2(bx + 8, by + 8, bz + 8) });
          }
          continue;
        }
        for (let c = 0; c < 4096; c++) {
          if (!matching.has(s.blocks[c])) continue;
          total++;
          const y = by + (c >> 8);
          const z = bz + ((c >> 4) & 15);
          const x = bx + (c & 15);
          hits.push({ pos: [x, y, z], name: payload.palette[s.blocks[c]].name, d: dist2(x, y, z) });
        }
      }
    }
    hits.sort((a, b) => a.d - b.d);
    return { hits: hits.slice(0, cap).map(({ pos, name }) => ({ pos, name })), total };
  }

  /** Name the block + biome at a world cell from the RESIDENT payload (the cursor readout) —
   *  no IPC: the palette and biome quarts already crossed with the chunk. Null when the
   *  chunk isn't resident; a cell in a dropped all-air section reads as air. */
  describeCell(x: number, y: number, z: number): { block: string; biome: string | null } | null {
    const payload = this.chunks.get(key(Math.floor(x / 16), Math.floor(z / 16)))?.payload;
    if (!payload) return null;
    const sy = Math.floor(y / 16);
    const lx = x & 15;
    const ly = y & 15;
    const lz = z & 15;
    const section = payload.sections.find((s) => s.sectionY === sy);
    let block = 'minecraft:air'; // all-air sections are dropped from the payload
    if (section) {
      const idx = section.uniform || !section.blocks ? section.fill : section.blocks[ly * 256 + lz * 16 + lx];
      block = payload.palette[idx]?.name ?? block;
    }
    // Biome quarts (4×4×4 per section, YZX). A section without biome data (synthesized, or a
    // dropped all-air one) falls back to any sibling section's dominant palette entry.
    const carrier = section?.biomePalette?.length ? section : payload.sections.find((s) => s.biomePalette?.length);
    let biome: string | null = null;
    if (carrier?.biomePalette?.length) {
      if (carrier !== section || !carrier.biomes || carrier.biomePalette.length === 1) {
        biome = carrier.biomePalette[0];
      } else {
        biome = carrier.biomePalette[carrier.biomes[(ly >> 2) * 16 + (lz >> 2) * 4 + (lx >> 2)]] ?? carrier.biomePalette[0];
      }
    }
    return { block, biome };
  }
}

/** Dispose only the geometries in a chunk group (materials are shared + cached in the view). */
function disposeGeometries(group: THREE.Group): void {
  disposeObject(group, { materials: false });
}
