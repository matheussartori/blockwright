// Owns the streamed world scene: a map of loaded chunk meshes, a camera-distance load queue, the
// worker pool that builds their geometry, frustum culling, LOD bands (near full geometry / mid
// heightmap surface / far colour tile) that re-mesh as the camera moves, and LRU eviction under a
// hard memory cap. The viewer calls `update(camera)` each frame; this requests the chunks around the
// camera over IPC, meshes them off-thread at the right LOD, and adds/removes chunk groups — the
// whole world stays viewable without holding it all in memory.
import * as THREE from 'three';
import type { BlockwrightApi, ChunkRenderPayload, DimensionId, StructureEntity } from '@/shared/types';
import type { LoadedTexture, TextureLoader } from '../viewer/texture-loader';
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
const MAX_LOADED = 1400; // hard cap on resident chunks (payload + meshes) — LRU beyond this

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
  private readonly pool = new WorkerPool();
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
  private queue: { cx: number; cz: number }[] = [];

  private centerX = NaN;
  private centerZ = NaN;
  private inflight = 0;
  private epoch = 0; // bumped on dimension change / dispose to drop stale async results
  renderDistance: number;
  private bands: LodBands = DEFAULT_BANDS;

  constructor(
    private readonly scene: THREE.Scene,
    private readonly textures: TextureLoader,
    private readonly api: BlockwrightApi,
    private dim: DimensionId = 'minecraft:overworld',
    renderDistance = 10, // modest first-open default; the HUD control pushes it out to the max band
  ) {
    this.renderDistance = renderDistance;
    this.applyBands();
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
    if (this.chunks.size > MAX_LOADED) {
      const byDist = [...this.chunks.entries()].sort(
        (a, b) => this.dist(b[1].cx, b[1].cz) - this.dist(a[1].cx, a[1].cz),
      );
      for (const [k, e] of byDist) {
        if (this.chunks.size <= MAX_LOADED) break;
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

  /** Dispatch a mesh build for `entry` at `lod`, swapping the group in when it returns. */
  private mesh(entry: ChunkEntry, lod: LodLevel): void {
    if (!entry.payload || !entry.tex) return;
    if (entry.pendingLod === lod) return;
    if (entry.jobId !== null) this.pool.cancel(entry.jobId); // supersede an in-flight build
    entry.pendingLod = lod;
    const epoch = this.epoch;
    const { cx, cz } = entry;
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
    entry.jobId = this.pool.build(lod, entry.payload, entry.tex, borders, (buffers) => {
      entry.pendingLod = null;
      entry.jobId = null;
      if (epoch !== this.epoch || this.chunks.get(key(cx, cz)) !== entry) return;
      // Entities are drawn only at the near LOD (they're small detail, pointless over a surface mesh).
      const entities = lod === 'near' ? entry.payload?.entities ?? [] : [];
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
    return new THREE.Mesh(geo, this.borderMat);
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

  /** Loaded / pending chunk counts for the HUD streaming indicator. */
  stats(): { loaded: number; pending: number } {
    let ready = 0;
    for (const e of this.chunks.values()) if (e.group || e.empty || e.absent) ready++;
    return { loaded: ready, pending: this.queue.length + this.inflight };
  }
}

/** Dispose only the geometries in a chunk group (materials are shared + cached in the view). */
function disposeGeometries(group: THREE.Group): void {
  group.traverse((obj) => {
    if (obj instanceof THREE.Mesh) obj.geometry.dispose();
  });
}
