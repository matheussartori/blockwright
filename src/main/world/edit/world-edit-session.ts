// The world-edit orchestrator: the ONE owner of every byte written to a save. Composes the
// safety layers in the order the write-back study mandates —
//   session lock → per-chunk edit gate → surgical patch → enforced region-granular backup →
//   atomic whole-region rewrite → POI invalidation —
// and refuses any chunk that can't meet an invariant (never "best effort" written). The renderer
// never talks to this directly; IPC handlers do (wired in a later stage).
import { promises as fs } from 'node:fs';
import type { DimensionId, WorldEntityEdit } from '@/shared/types';
import { RegionFile } from '../anvil/region-file';
import {
  entitiesFilePaths,
  isWorldDir,
  poiFilePaths,
  regionFilePaths,
  regionForChunk,
} from '../anvil/world-paths';
import { createBackup, type BackupSet } from './backup';
import { chunkEditGate, markLightStale, patchChunkNbt, type WorldBlockEdit } from './chunk-patch';
import { entityChunkGate, makeEntityChunkRoot, patchEntityChunk } from './entity-patch';
import { compoundOf, encodeTagRoot, numberOf, type Tag } from './nbt-tree';
import { rewriteRegion, type ChunkRewrite } from './region-write';
import { invalidatePoiSections, type PoiChunkTarget } from './poi-invalidate';
import { acquireSessionLock, type SessionLock } from './session-lock';

export type { WorldBlockEdit } from './chunk-patch';

export interface RefusedChunk {
  cx: number;
  cz: number;
  reason: string;
}

export interface WorldEditReport {
  /** Block edits actually written (edits on refused chunks are not counted). */
  changedBlocks: number;
  /** Entities written into the `entities/` region set (refused chunks not counted). */
  placedEntities: number;
  editedChunks: { cx: number; cz: number }[];
  /** Absolute paths of the region files rewritten (block + poi + entities). */
  regions: string[];
  /** The backup set taken before this save touched new files (null when every file was already
   *  backed up earlier in the session). */
  backup: BackupSet | null;
  refused: RefusedChunk[];
}

const chunkKey = (cx: number, cz: number): string => `${cx},${cz}`;

/** First candidate path that exists on disk (classic vs 26.x layout), or null. */
async function firstExisting(paths: string[]): Promise<string | null> {
  for (const p of paths) {
    try {
      await fs.access(p);
      return p;
    } catch {
      /* try the next layout */
    }
  }
  return null;
}

export class WorldEditSession {
  /** Files already backed up this session — backup happens before FIRST touch, once per file. */
  private readonly backedUp = new Set<string>();
  private closed = false;

  private constructor(
    readonly root: string,
    readonly dim: DimensionId,
    private readonly lock: SessionLock,
  ) {}

  /** True when the OS gave a REAL exclusivity guarantee (Windows). On POSIX the lock is
   *  advisory-held only — the UI must surface a "make sure Minecraft is closed" caution. */
  get lockExclusive(): boolean {
    return this.lock.exclusive;
  }

  /**
   * Open an edit session on a save. Verifies the folder is a world and takes the session lock
   * (throws `WorldLockedError` when Minecraft demonstrably has it).
   */
  static async open(root: string, dim: DimensionId): Promise<WorldEditSession> {
    if (!(await isWorldDir(root))) throw new Error(`not a Minecraft world (no level.dat): ${root}`);
    const lock = await acquireSessionLock(root);
    return new WorldEditSession(root, dim, lock);
  }

  /**
   * Apply a batch of block edits (+ placed entities) to the world, atomically per region.
   *
   * Per-chunk failures (proto chunk, unknown DataVersion, unreadable) REFUSE that chunk and are
   * reported; the rest of the batch still lands. Throws only on world-level failures (backup or
   * region write errors), before which nothing has been written.
   *
   * @param edits    Block edits at absolute world positions.
   * @param entities Entities to spawn (absolute positions; UUIDs regenerated on write). Land in
   *   the 1.17+ `entities/` region set — a chunk's record (or whole file) is synthesized when
   *   absent. An entity in a refused/ungenerated chunk is refused with it.
   * @param nowMs    Timestamp for backup ids + region header stamps (defaults to now;
   *   injectable for tests).
   */
  async applyEdits(edits: WorldBlockEdit[], entities: WorldEntityEdit[] = [], nowMs = Date.now()): Promise<WorldEditReport> {
    if (this.closed) throw new Error('edit session is closed');
    const nowSec = Math.floor(nowMs / 1000);
    const refused: RefusedChunk[] = [];

    // 1. Group edits per chunk.
    const perChunk = new Map<string, { cx: number; cz: number; edits: WorldBlockEdit[] }>();
    for (const e of edits) {
      const cx = Math.floor(e.x / 16);
      const cz = Math.floor(e.z / 16);
      const key = chunkKey(cx, cz);
      let entry = perChunk.get(key);
      if (!entry) perChunk.set(key, (entry = { cx, cz, edits: [] }));
      entry.edits.push(e);
    }

    // 2. Patch every editable chunk in memory (nothing on disk yet).
    const regionCache = new Map<string, { path: string; file: RegionFile } | null>();
    const openRegion = async (cx: number, cz: number) => {
      const { rx, rz } = regionForChunk(cx, cz);
      const cacheKey = `${rx},${rz}`;
      if (regionCache.has(cacheKey)) return regionCache.get(cacheKey) ?? null;
      const p = await firstExisting(regionFilePaths(this.root, this.dim, rx, rz));
      const opened = p ? { path: p, file: await RegionFile.open(p) } : null;
      regionCache.set(cacheKey, opened);
      return opened;
    };

    interface PendingChunk {
      cx: number;
      cz: number;
      regionPath: string;
      nbt: Buffer;
      sectionYs: number[];
      blockCount: number;
    }
    const pending: PendingChunk[] = [];
    const editedKeys = new Set<string>();
    const refusedKeys = new Set<string>();
    /** DataVersion per gate-passing chunk — stamped into synthesized entity-chunk roots. */
    const chunkDataVersion = new Map<string, number>();

    for (const { cx, cz, edits: chunkEdits } of perChunk.values()) {
      const { lx, lz } = regionForChunk(cx, cz);
      try {
        const region = await openRegion(cx, cz);
        const root = region ? ((await region.file.readChunkParsed(lx, lz)) as Tag | null) : null;
        if (!region || !root) {
          refused.push({ cx, cz, reason: 'chunk is not generated' });
          refusedKeys.add(chunkKey(cx, cz));
          continue;
        }
        const gate = chunkEditGate(root);
        if (gate) {
          refused.push({ cx, cz, reason: gate });
          refusedKeys.add(chunkKey(cx, cz));
          continue;
        }
        chunkDataVersion.set(chunkKey(cx, cz), numberOf(compoundOf(root)?.DataVersion) ?? 0);
        const { editedSectionYs } = patchChunkNbt(root, chunkEdits);
        pending.push({
          cx,
          cz,
          regionPath: region.path,
          nbt: encodeTagRoot(root),
          sectionYs: editedSectionYs,
          blockCount: chunkEdits.length,
        });
        editedKeys.add(chunkKey(cx, cz));
      } catch (e) {
        refused.push({ cx, cz, reason: e instanceof Error ? e.message : String(e) });
        refusedKeys.add(chunkKey(cx, cz));
      }
    }

    // 3. Border light staleness: the 8 neighbors of every edited chunk get `isLightOn: 0` so the
    //    game relights across chunk seams too. Best-effort — only existing, gate-passing chunks.
    const neighborPending: PendingChunk[] = [];
    for (const chunk of pending) {
      for (let dz = -1; dz <= 1; dz++) {
        for (let dx = -1; dx <= 1; dx++) {
          if (dx === 0 && dz === 0) continue;
          const ncx = chunk.cx + dx;
          const ncz = chunk.cz + dz;
          const key = chunkKey(ncx, ncz);
          if (editedKeys.has(key)) continue;
          editedKeys.add(key); // dedupe across the batch either way
          try {
            const region = await openRegion(ncx, ncz);
            const { lx, lz } = regionForChunk(ncx, ncz);
            const root = region ? ((await region.file.readChunkParsed(lx, lz)) as Tag | null) : null;
            if (!region || !root || chunkEditGate(root)) continue;
            markLightStale(root);
            neighborPending.push({
              cx: ncx,
              cz: ncz,
              regionPath: region.path,
              nbt: encodeTagRoot(root),
              sectionYs: [],
              blockCount: 0,
            });
          } catch {
            /* a neighbor we can't read keeps its light — the edited chunk still relights */
          }
        }
      }
    }

    // 3.5. Entities (§2.2 fidelity): group per chunk, gate against the BLOCK chunk (an entity
    //      never lands in ungenerated/refused terrain), then patch — or synthesize — the
    //      1.17+ entity-chunk record. Existing entities in the record ride through untouched.
    interface PendingEntityChunk {
      cx: number;
      cz: number;
      filePath: string;
      fileExists: boolean;
      nbt: Buffer;
      count: number;
    }
    const pendingEntityChunks: PendingEntityChunk[] = [];
    if (entities.length) {
      const perEntityChunk = new Map<string, { cx: number; cz: number; list: WorldEntityEdit[] }>();
      for (const e of entities) {
        const cx = Math.floor(e.pos[0] / 16);
        const cz = Math.floor(e.pos[2] / 16);
        const key = chunkKey(cx, cz);
        let entry = perEntityChunk.get(key);
        if (!entry) perEntityChunk.set(key, (entry = { cx, cz, list: [] }));
        entry.list.push(e);
      }

      // The entity file for a region: the existing one, else a creation target in the SAME
      // layout slot the block region resolves in (the candidate lists share their order).
      const entityFileCache = new Map<string, { path: string; exists: boolean; file: RegionFile | null }>();
      const resolveEntityFile = async (cx: number, cz: number) => {
        const { rx, rz } = regionForChunk(cx, cz);
        const cacheKey = `${rx},${rz}`;
        const hit = entityFileCache.get(cacheKey);
        if (hit) return hit;
        const candidates = entitiesFilePaths(this.root, this.dim, rx, rz);
        const existing = await firstExisting(candidates);
        let resolved: { path: string; exists: boolean; file: RegionFile | null };
        if (existing) {
          resolved = { path: existing, exists: true, file: await RegionFile.open(existing) };
        } else {
          const blockCandidates = regionFilePaths(this.root, this.dim, rx, rz);
          const blockPath = await firstExisting(blockCandidates);
          const idx = blockPath ? blockCandidates.indexOf(blockPath) : 0;
          resolved = { path: candidates[Math.max(idx, 0)] ?? candidates[0], exists: false, file: null };
        }
        entityFileCache.set(cacheKey, resolved);
        return resolved;
      };

      for (const { cx, cz, list } of perEntityChunk.values()) {
        const key = chunkKey(cx, cz);
        if (refusedKeys.has(key)) continue; // already reported with its block refusal
        try {
          // Chunks with no block edit in the batch still need the generated/gate check.
          if (!chunkDataVersion.has(key)) {
            const region = await openRegion(cx, cz);
            const { lx, lz } = regionForChunk(cx, cz);
            const root = region ? ((await region.file.readChunkParsed(lx, lz)) as Tag | null) : null;
            if (!region || !root) {
              refused.push({ cx, cz, reason: 'chunk is not generated' });
              refusedKeys.add(key);
              continue;
            }
            const gate = chunkEditGate(root);
            if (gate) {
              refused.push({ cx, cz, reason: gate });
              refusedKeys.add(key);
              continue;
            }
            chunkDataVersion.set(key, numberOf(compoundOf(root)?.DataVersion) ?? 0);
          }
          const entityFile = await resolveEntityFile(cx, cz);
          const { lx, lz } = regionForChunk(cx, cz);
          let entityRoot = entityFile.file ? ((await entityFile.file.readChunkParsed(lx, lz)) as Tag | null) : null;
          if (entityRoot) {
            const gate = entityChunkGate(entityRoot);
            if (gate) {
              refused.push({ cx, cz, reason: gate });
              refusedKeys.add(key);
              continue;
            }
          } else {
            entityRoot = makeEntityChunkRoot(cx, cz, chunkDataVersion.get(key) ?? 0);
          }
          patchEntityChunk(entityRoot, list.map((e) => ({ pos: e.pos, nbt: e.nbt })));
          pendingEntityChunks.push({
            cx,
            cz,
            filePath: entityFile.path,
            fileExists: entityFile.exists,
            nbt: encodeTagRoot(entityRoot),
            count: list.length,
          });
        } catch (e) {
          refused.push({ cx, cz, reason: e instanceof Error ? e.message : String(e) });
          refusedKeys.add(key);
        }
      }
    }

    // 4. Group rewrites per region file.
    const perRegion = new Map<string, ChunkRewrite[]>();
    for (const chunk of [...pending, ...neighborPending]) {
      const { lx, lz } = regionForChunk(chunk.cx, chunk.cz);
      let list = perRegion.get(chunk.regionPath);
      if (!list) perRegion.set(chunk.regionPath, (list = []));
      list.push({ lx, lz, nbt: chunk.nbt });
    }

    // 5. POI targets, grouped per poi region file (only sections whose BLOCKS changed).
    const perPoiRegion = new Map<string, PoiChunkTarget[]>();
    for (const chunk of pending) {
      if (!chunk.sectionYs.length) continue;
      const { rx, rz, lx, lz } = regionForChunk(chunk.cx, chunk.cz);
      const poiPath = await firstExisting(poiFilePaths(this.root, this.dim, rx, rz));
      if (!poiPath) continue;
      let list = perPoiRegion.get(poiPath);
      if (!list) perPoiRegion.set(poiPath, (list = []));
      list.push({ lx, lz, sectionYs: chunk.sectionYs });
    }

    // 5.5. Group entity rewrites per entities file (created on write when absent).
    const perEntityRegion = new Map<string, ChunkRewrite[]>();
    for (const chunk of pendingEntityChunks) {
      const { lx, lz } = regionForChunk(chunk.cx, chunk.cz);
      let list = perEntityRegion.get(chunk.filePath);
      if (!list) perEntityRegion.set(chunk.filePath, (list = []));
      list.push({ lx, lz, nbt: chunk.nbt });
    }

    // 6. Enforced backup BEFORE the first touch of each file: the block regions being rewritten
    //    plus their poi/ and entities/ counterparts (and any EXISTING entities file the entity
    //    pass rewrites — a freshly created one has nothing to back up).
    const toBackup = new Set<string>();
    const consider = (p: string | null) => {
      if (p && !this.backedUp.has(p)) toBackup.add(p);
    };
    for (const regionPath of perRegion.keys()) consider(regionPath);
    for (const poiPath of perPoiRegion.keys()) consider(poiPath);
    for (const chunk of pending) {
      const { rx, rz } = regionForChunk(chunk.cx, chunk.cz);
      consider(await firstExisting(entitiesFilePaths(this.root, this.dim, rx, rz)));
    }
    for (const chunk of pendingEntityChunks) {
      if (chunk.fileExists) consider(chunk.filePath);
    }
    let backup: BackupSet | null = null;
    if (toBackup.size) {
      backup = await createBackup(this.root, [...toBackup], nowMs);
      for (const p of toBackup) this.backedUp.add(p);
    }

    // 7. Atomic region rewrites (block regions, then the entities set), then POI invalidation.
    for (const [regionPath, rewrites] of perRegion) {
      await rewriteRegion(regionPath, rewrites, nowSec);
    }
    for (const [entityPath, rewrites] of perEntityRegion) {
      await rewriteRegion(entityPath, rewrites, nowSec, { createIfMissing: true, allowAbsent: true });
    }
    const poiRewritten: string[] = [];
    for (const [poiPath, targets] of perPoiRegion) {
      if (await invalidatePoiSections(poiPath, targets, nowSec)) poiRewritten.push(poiPath);
    }

    // Entity-only chunks count as edited too (their read caches must evict + re-stream).
    const editedChunkList = pending.map((c) => ({ cx: c.cx, cz: c.cz }));
    const blockEdited = new Set(pending.map((c) => chunkKey(c.cx, c.cz)));
    for (const c of pendingEntityChunks) {
      if (!blockEdited.has(chunkKey(c.cx, c.cz))) editedChunkList.push({ cx: c.cx, cz: c.cz });
    }

    return {
      changedBlocks: pending.reduce((sum, c) => sum + c.blockCount, 0),
      placedEntities: pendingEntityChunks.reduce((sum, c) => sum + c.count, 0),
      editedChunks: editedChunkList,
      regions: [...perRegion.keys(), ...perEntityRegion.keys(), ...poiRewritten],
      backup,
      refused,
    };
  }

  /** Release the session lock. Idempotent. */
  async close(): Promise<void> {
    if (this.closed) return;
    this.closed = true;
    await this.lock.release();
  }
}
