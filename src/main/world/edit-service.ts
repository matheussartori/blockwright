// The world-EDIT service the IPC handlers delegate to (parallel to `world-service.ts` for reads):
// one edit session at a time, opened on the ACTIVE world. Owns the session lifecycle, maps the
// IPC-shaped edits to the write path's contract, evicts read caches after a save (so re-streamed
// chunks show the committed state), and fronts the backup manager.
import type { DimensionId, WorldBackupInfo, WorldEditApplyResult, WorldEditBlock, WorldEditOpenResult, WorldEntityEdit } from '@/shared/types';
import { getActiveWorld } from './active-world';
import { clearChunkResolveCache } from './chunk-resolve';
import { deleteBackup, listBackups, pruneBackups, pruneBackupsToSize, restoreBackup } from './edit/backup';
import type { WorldBlockEdit } from './edit/world-edit-session';
import { WorldEditSession } from './edit/world-edit-session';

let session: WorldEditSession | null = null;

function activeRoot(): string {
  const world = getActiveWorld();
  if (!world) throw new Error('no world is open');
  return world.root;
}

/** Open (or reuse) the edit session for the active world + dimension. */
export async function openWorldEdit(dim: DimensionId): Promise<WorldEditOpenResult> {
  const root = activeRoot();
  if (session && (session.root !== root || session.dim !== dim)) {
    await session.close();
    session = null;
  }
  if (!session) session = await WorldEditSession.open(root, dim);
  return { lockExclusive: session.lockExclusive };
}

/** Close the edit session, releasing the session lock. Safe to call when none is open. */
export async function closeWorldEdit(): Promise<void> {
  await session?.close();
  session = null;
}

/**
 * Write a batch of block edits (+ placed entities) through the safe write path, then evict the
 * read caches for the touched chunks (+ the 8 neighbors, whose light flags changed) and prune
 * backups per retention (set count) and per total-size cap (MB; 0 = uncapped — the newest set
 * always survives).
 */
export async function applyWorldEdits(
  dim: DimensionId,
  edits: WorldEditBlock[],
  entities: WorldEntityEdit[],
  retention: number,
  sizeCapMb = 0,
): Promise<WorldEditApplyResult> {
  const root = activeRoot();
  if (!session || session.root !== root || session.dim !== dim) {
    throw new Error('world-edit session is not open — enter edit mode first');
  }
  const mapped: WorldBlockEdit[] = edits.map((e) => ({
    x: e.x,
    y: e.y,
    z: e.z,
    state: e.properties && Object.keys(e.properties).length ? { Name: e.name, Properties: e.properties } : { Name: e.name },
    ...(e.blockEntity ? { blockEntity: e.blockEntity } : {}),
  }));
  const report = await session.applyEdits(mapped, entities);

  // Committed state must be what streams next: evict the edited chunks AND their neighbors.
  const world = getActiveWorld();
  if (world) {
    const evict = new Set<string>();
    const coords: { cx: number; cz: number }[] = [];
    for (const { cx, cz } of report.editedChunks) {
      for (let dz = -1; dz <= 1; dz++) {
        for (let dx = -1; dx <= 1; dx++) {
          const k = `${cx + dx},${cz + dz}`;
          if (!evict.has(k)) {
            evict.add(k);
            coords.push({ cx: cx + dx, cz: cz + dz });
          }
        }
      }
    }
    world.evictChunks(dim, coords);
  }

  if (retention > 0) await pruneBackups(root, retention);
  if (sizeCapMb > 0) await pruneBackupsToSize(root, sizeCapMb * 1024 * 1024);

  return {
    changedBlocks: report.changedBlocks,
    placedEntities: report.placedEntities,
    editedChunks: report.editedChunks,
    regions: report.regions,
    backup: report.backup,
    refused: report.refused,
  };
}

/** Backup sets of the active world, newest first. */
export function listWorldBackups(): Promise<WorldBackupInfo[]> {
  return listBackups(activeRoot());
}

/** Restore one backup set over the active world, then drop EVERY read cache (the restored regions
 *  invalidate any decoded column) so the next stream shows the restored terrain. */
export async function restoreWorldBackup(id: string): Promise<WorldBackupInfo> {
  const root = activeRoot();
  const set = await restoreBackup(root, id);
  getActiveWorld()?.dispose();
  clearChunkResolveCache();
  return set;
}

/** Delete one backup set → the updated list. */
export async function deleteWorldBackup(id: string): Promise<WorldBackupInfo[]> {
  const root = activeRoot();
  await deleteBackup(root, id);
  return listBackups(root);
}

/** Close the session when the active world closes/changes (wired by active-world callers). */
export async function disposeWorldEdit(): Promise<void> {
  await closeWorldEdit();
}
