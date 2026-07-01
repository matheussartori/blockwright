// Web Worker: turns a chunk render payload into per-material vertex buffers, off the main thread.
// Reuses the shared, worker-safe geometry core (with neighbour face-culling on). Positions are
// chunk-LOCAL in X/Z (0..15) and world-absolute in Y; the world view places the group at
// (cx*16, 0, cz*16). Geometry is transferred back as typed arrays (zero-copy).
import type { ChunkRenderPayload } from '@/shared/types';
import { buildGeometryBuffers, transferListFor, type GeomBlock, type GeomInput, type MaterialBuffers } from '../viewer/geometry-core';
import type { TexInfo } from '../viewer/model-geometry';
import { buildSurface } from './surface';
import type { ChunkMeshRequest, ChunkMeshResponse } from './worker-protocol';

// `self` is typed as a Window by the DOM lib; cast to the minimal worker surface we use so we don't
// need the conflicting WebWorker lib.
const ctx = self as unknown as {
  onmessage: ((e: MessageEvent<ChunkMeshRequest>) => void) | null;
  postMessage: (msg: ChunkMeshResponse, transfer: Transferable[]) => void;
};

/** Expand a payload's sections into the non-air block list the geometry core consumes. */
function expand(payload: ChunkRenderPayload): GeomBlock[] {
  const air = payload.palette.map((p) => p.air);
  const blocks: GeomBlock[] = [];
  for (const s of payload.sections) {
    const baseY = s.sectionY * 16;
    if (s.uniform || !s.blocks) {
      if (air[s.fill]) continue;
      for (let ly = 0; ly < 16; ly++)
        for (let lz = 0; lz < 16; lz++)
          for (let lx = 0; lx < 16; lx++) blocks.push({ state: s.fill, pos: [lx, baseY + ly, lz] });
      continue;
    }
    const grid = s.blocks;
    for (let i = 0; i < 4096; i++) {
      const state = grid[i];
      if (air[state]) continue;
      const ly = i >> 8;
      const lz = (i >> 4) & 15;
      const lx = i & 15;
      blocks.push({ state, pos: [lx, baseY + ly, lz] });
    }
  }
  return blocks;
}

ctx.onmessage = (e) => {
  const { id, lod, payload, tex, borders } = e.data;
  const texMap = new Map<string, TexInfo>(tex);
  let buffers: MaterialBuffers[];
  if (lod !== 'near' && payload.heightmap) {
    // mid = textured surface quads; far = flat-coloured quads (cheapest outer ring).
    buffers = buildSurface(payload, texMap, lod === 'mid');
  } else {
    const input: GeomInput = { palette: payload.palette, blocks: expand(payload) };
    // The world build floor = the lowest section present; a downward face below it (the bedrock
    // underside at the bottom of the world) is culled.
    const floorY = payload.sections.length
      ? Math.min(...payload.sections.map((s) => s.sectionY)) * 16
      : undefined;
    buffers = buildGeometryBuffers(input, texMap, { occlude: true, borders, floorY, tint: payload.grassTint ?? undefined });
  }
  ctx.postMessage({ id, buffers }, transferListFor(buffers));
};
