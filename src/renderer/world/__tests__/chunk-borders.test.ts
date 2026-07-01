import { describe, expect, it } from 'vitest';
import type { ChunkRenderPayload, PaletteEntry } from '@/shared/types';
import { computeBorderPlanes } from '../chunk-borders';
import { BORDER_PLANE_BYTES } from '../../viewer/geometry-core';

const air: PaletteEntry = { name: 'minecraft:air', properties: {}, air: true, color: [0, 0, 0], models: [] };
const stone: PaletteEntry = { name: 'minecraft:stone', properties: {}, air: false, color: [0.5, 0.5, 0.5], models: [] };
const palette = [air, stone];
// occluderStates for [air, stone]: air is not an occluder, the model-less stone is a full cube.
const occ = [false, true];

/** A payload with a single section at sectionY, filled from a 4096-length YZX grid. */
function payload(section: { blocks: Uint16Array }): ChunkRenderPayload {
  return {
    cx: 0,
    cz: 0,
    palette,
    sections: [{ sectionY: 0, blocks: section.blocks, uniform: false, fill: 0 }],
    textureKeys: [],
    heightmap: null,
    grassTint: null,
    empty: false,
  };
}

const bit = (plane: Uint8Array, y: number, perp: number): boolean => {
  const idx = (y - -64) * 16 + perp; // BORDER_MIN_Y = -64
  return (plane[idx >> 3] & (1 << (idx & 7))) !== 0;
};

describe('computeBorderPlanes', () => {
  it('flags only the matching edge cell on each of the four planes', () => {
    const grid = new Uint16Array(4096); // all air
    const at = (lx: number, ly: number, lz: number) => (ly << 8) | (lz << 4) | lx;
    // Place a stone at each of the four edges, distinct perpendicular coords to catch axis swaps.
    grid[at(0, 3, 7)] = 1; // west edge (lx=0), z=7
    grid[at(15, 4, 9)] = 1; // east edge (lx=15), z=9
    grid[at(6, 5, 0)] = 1; // north edge (lz=0), x=6
    grid[at(2, 8, 15)] = 1; // south edge (lz=15), x=2

    const { east, west, north, south } = computeBorderPlanes(payload({ blocks: grid }), occ);
    expect(west.length).toBe(BORDER_PLANE_BYTES);

    expect(bit(west, 3, 7)).toBe(true); // west plane indexed by (y, z)
    expect(bit(east, 4, 9)).toBe(true); // east plane indexed by (y, z)
    expect(bit(north, 5, 6)).toBe(true); // north plane indexed by (y, x)
    expect(bit(south, 8, 2)).toBe(true); // south plane indexed by (y, x)

    // A cell not on an edge sets nothing; a wrong-axis lookup misses.
    expect(bit(west, 3, 6)).toBe(false);
    expect(bit(north, 5, 5)).toBe(false);
  });

  it('sets every edge cell for a uniform solid section', () => {
    const solid: ChunkRenderPayload = {
      ...payload({ blocks: new Uint16Array(4096) }),
      sections: [{ sectionY: 0, blocks: null, uniform: true, fill: 1 }],
    };
    const { east } = computeBorderPlanes(solid, occ);
    for (let ly = 0; ly < 16; ly++) for (let z = 0; z < 16; z++) expect(bit(east, ly, z)).toBe(true);
  });
});
