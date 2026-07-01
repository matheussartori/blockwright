// Message contract between the world view (main thread) and the chunk-mesh worker pool. Kept in its
// own module so both sides share one shape. Geometry comes back as transferable typed arrays.
import type { ChunkRenderPayload } from '@/shared/types';
import type { MaterialBuffers, NeighborBorders } from '../viewer/geometry-core';
import type { TexInfo } from '../viewer/model-geometry';

/** The level of detail a chunk should be meshed at (near = full geometry; mid/far = surface). */
export type LodLevel = 'near' | 'mid' | 'far';

/** Build one chunk's geometry. `tex` carries only the frames/translucent facts (canvas-based
 *  detection can't run off the main thread), keyed by texture key. */
export interface ChunkMeshRequest {
  id: number;
  lod: LodLevel;
  payload: ChunkRenderPayload;
  tex: [string, TexInfo][];
  /** Adjacent chunks' edge occluder planes (near LOD only) for cross-chunk face culling. */
  borders?: NeighborBorders;
}

export interface ChunkMeshResponse {
  id: number;
  buffers: MaterialBuffers[];
}
