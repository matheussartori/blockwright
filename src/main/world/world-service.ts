// The main-side world API the IPC handlers delegate to: open a world (activating it + returning
// meta), and turn chunk coordinates into resolved render payloads. Composes the active-world
// singleton, the region reader, and the asset-resolution bridge.
import type { ChunkRenderPayload, DimensionId, RegionRef, StructureLocation, WorldMeta } from '@/shared/types';
import { getActiveWorld, openActiveWorld } from './active-world';
import { resolveColumn } from './chunk-resolve';

/** Open (or re-open) a world folder and make it active. Returns its meta. */
export async function openWorld(root: string): Promise<WorldMeta> {
  const src = await openActiveWorld(root);
  return src.meta;
}

/** Meta of the active world, or null when none is open. */
export function activeWorldMeta(): WorldMeta | null {
  return getActiveWorld()?.getMeta() ?? null;
}

/** Region coordinates present in a dimension of the active world. */
export async function listWorldRegions(dim: DimensionId): Promise<RegionRef[]> {
  return getActiveWorld()?.listRegions(dim) ?? [];
}

/** Resolve one chunk into a render payload, or null if absent / no world open. */
export async function getChunkPayload(dim: DimensionId, cx: number, cz: number): Promise<ChunkRenderPayload | null> {
  const src = getActiveWorld();
  if (!src) return null;
  const col = await src.getChunk(dim, cx, cz);
  return col ? resolveColumn(col) : null;
}

/** Find generated structures in a dimension of the active world (cached after the first scan). */
export async function findWorldStructures(dim: DimensionId): Promise<StructureLocation[]> {
  return getActiveWorld()?.findStructures(dim) ?? [];
}

/** Batch variant — a ring of chunks in one IPC round-trip. Preserves input order. */
export async function getChunksPayload(
  dim: DimensionId,
  coords: { cx: number; cz: number }[],
): Promise<(ChunkRenderPayload | null)[]> {
  return Promise.all(coords.map(({ cx, cz }) => getChunkPayload(dim, cx, cz)));
}
