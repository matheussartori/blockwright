// Per-chunk EDGE occluder planes for cross-chunk face culling. A chunk is meshed in isolation, so a
// face on its X/Z border has no neighbour to cull against and is always emitted — buried chunk seams
// then wall off the view when you fly through solid terrain (unlike Minecraft, which drops every
// face between two solid blocks, so a suffocated region simply vanishes). To fix that, each chunk
// exposes the occluder mask of its four vertical edges; the world view hands a neighbour's matching
// edge to a chunk's build (see geometry-core `NeighborBorders`), so a solid-against-solid seam culls
// exactly like an interior one. Planes are bit-packed and computed once per chunk (cheap: edge cells
// only), on the main thread right after the payload loads.
import type { ChunkRenderPayload } from '@/shared/types';
import { newBorderPlane, setBorderBit } from '../viewer/geometry-core';

/** A chunk's four exposed edge occluder planes, named by the outward direction they face. A
 *  neighbour consumes the plane facing it: the chunk to the west reads this chunk's `west` edge. */
export interface ChunkBorderPlanes {
  /** lx = 15 column (faces +x), indexed by (y, z). */
  east: Uint8Array;
  /** lx = 0 column (faces -x), indexed by (y, z). */
  west: Uint8Array;
  /** lz = 0 row (faces -z), indexed by (y, x). */
  north: Uint8Array;
  /** lz = 15 row (faces +z), indexed by (y, x). */
  south: Uint8Array;
}

/**
 * Compute a chunk's four edge occluder planes from its render payload.
 *
 * @param payload The chunk column (sections carry world-absolute Y via `sectionY`).
 * @param occluderState Per-palette-state "is a full opaque cube" flags (from `occluderStates`).
 * @returns The east/west/north/south edge planes (bit-packed by world Y × perpendicular coord).
 */
export function computeBorderPlanes(payload: ChunkRenderPayload, occluderState: boolean[]): ChunkBorderPlanes {
  const east = newBorderPlane();
  const west = newBorderPlane();
  const north = newBorderPlane();
  const south = newBorderPlane();

  for (const s of payload.sections) {
    const baseY = s.sectionY * 16;
    if (s.uniform || !s.blocks) {
      if (!occluderState[s.fill]) continue; // whole section air/non-occluder → no edge bits
      for (let ly = 0; ly < 16; ly++) {
        const y = baseY + ly;
        for (let c = 0; c < 16; c++) {
          setBorderBit(east, y, c);
          setBorderBit(west, y, c);
          setBorderBit(north, y, c);
          setBorderBit(south, y, c);
        }
      }
      continue;
    }
    const grid = s.blocks; // index i = (ly << 8) | (lz << 4) | lx
    for (let ly = 0; ly < 16; ly++) {
      const y = baseY + ly;
      const row = ly << 8;
      for (let k = 0; k < 16; k++) {
        if (occluderState[grid[row | (k << 4) | 15]]) setBorderBit(east, y, k); // lx=15, perp z=k
        if (occluderState[grid[row | (k << 4)]]) setBorderBit(west, y, k); // lx=0, perp z=k
        if (occluderState[grid[row | k]]) setBorderBit(north, y, k); // lz=0, perp x=k
        if (occluderState[grid[row | (15 << 4) | k]]) setBorderBit(south, y, k); // lz=15, perp x=k
      }
    }
  }
  return { east, west, north, south };
}
