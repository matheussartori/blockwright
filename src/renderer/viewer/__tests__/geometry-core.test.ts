import { describe, expect, it } from 'vitest';
import type { PaletteEntry } from '@/shared/types';
import {
  buildGeometryBuffers,
  newBorderPlane,
  occluderStates,
  setBorderBit,
  transferListFor,
  type GeomInput,
} from '../geometry-core';
import type { TexInfo } from '../model-geometry';

// A hand-built palette so the test needs no content pack: one textured full cube (single up face)
// and one model-less block (fallback-colour cube). This pins the shared core's output — the same
// buffers the structure mesh path relies on — so a future refactor can't silently change geometry.
const textured: PaletteEntry = {
  name: 'minecraft:stone',
  properties: {},
  air: false,
  color: [0.5, 0.5, 0.5],
  models: [{ elements: [{ from: [0, 0, 0], to: [16, 16, 16], faces: { up: { texture: 'block/stone' } } }] }],
};
const flat: PaletteEntry = { name: 'minecraft:unknown', properties: {}, air: false, color: [0.1, 0.2, 0.3], models: [] };
// A half-height slab: NOT a full cube, so it's a non-occluder → rendered double-sided.
const slab: PaletteEntry = {
  name: 'minecraft:stone_slab',
  properties: {},
  air: false,
  color: [0.5, 0.5, 0.5],
  models: [{ elements: [{ from: [0, 0, 0], to: [16, 8, 16], faces: { up: { texture: 'block/stone' } } }] }],
};
const air: PaletteEntry = { name: 'minecraft:air', properties: {}, air: true, color: [0, 0, 0], models: [] };

const input: GeomInput = {
  palette: [air, textured, flat],
  blocks: [
    { state: 0, pos: [5, 5, 5] }, // air — skipped
    { state: 1, pos: [0, 0, 0] }, // one up face
    { state: 2, pos: [1, 0, 0] }, // fallback cube
  ],
};
const tex = new Map<string, TexInfo>([['block/stone', { frames: 1, translucent: false }]]);

describe('buildGeometryBuffers', () => {
  it('emits one textured material (single face) and one flat-colour cube', () => {
    const buffers = buildGeometryBuffers(input, tex);
    expect(buffers).toHaveLength(2);

    const t = buffers.find((b) => b.textured)!;
    expect(t.key).toBe('t:block/stone');
    expect(t.textureKey).toBe('block/stone');
    expect(t.translucent).toBe(false);
    expect(t.positions).toHaveLength(6 * 3); // one quad = 2 tris = 6 verts
    // Up face sits at y = 16/16 + 0 = 1 for every vertex.
    for (let i = 1; i < t.positions.length; i += 3) expect(t.positions[i]).toBe(1);

    const c = buffers.find((b) => !b.textured)!;
    expect(c.key).toBe('c:0.1,0.2,0.3');
    expect(c.color).toEqual([0.1, 0.2, 0.3]);
    expect(c.positions).toHaveLength(6 * 6 * 3); // full cube: 6 faces × 6 verts
  });

  it('drops shell blocks when hideShell is set', () => {
    // Both non-air blocks are on the occupied bounding box surface → everything culled.
    expect(buildGeometryBuffers(input, tex, { hideShell: true })).toHaveLength(0);
  });

  it('exposes a transfer list of the backing ArrayBuffers', () => {
    const buffers = buildGeometryBuffers(input, tex);
    expect(transferListFor(buffers)).toHaveLength(buffers.length * 4);
  });

  it('face-culls interior faces and drops buried cubes when occlude is on', () => {
    // A solid 3×3×3 of full-colour cubes. Only the 6·9 = 54 exterior faces should survive; the
    // centre cube (1,1,1) is fully buried and emits nothing.
    const blocks = [];
    for (let x = 0; x < 3; x++)
      for (let y = 0; y < 3; y++)
        for (let z = 0; z < 3; z++) blocks.push({ state: 2, pos: [x, y, z] as [number, number, number] });
    const solid: GeomInput = { palette: [air, textured, flat], blocks };

    const culled = buildGeometryBuffers(solid, tex, { occlude: true });
    const uncled = buildGeometryBuffers(solid, tex);
    const verts = (bs: typeof culled) => bs.reduce((n, b) => n + b.positions.length / 3, 0);

    expect(verts(culled)).toBe(54 * 6); // 54 exterior faces × 6 verts
    expect(verts(uncled)).toBe(27 * 6 * 6); // 27 cubes × 6 faces × 6 verts
  });

  it('culls a chunk-border face against a solid neighbour via border planes', () => {
    // One full cube at the chunk's west edge (lx=0). Its west neighbour (x=-1) lives in the adjacent
    // chunk; without a border plane that face is emitted, with a solid one it is culled.
    const palette = [air, textured, flat];
    const solid: GeomInput = { palette, blocks: [{ state: 2, pos: [0, 5, 5] }] };
    const verts = (bs: ReturnType<typeof buildGeometryBuffers>) =>
      bs.reduce((n, b) => n + b.positions.length / 3, 0);

    const bare = buildGeometryBuffers(solid, tex, { occlude: true });
    expect(verts(bare)).toBe(6 * 6); // no neighbour → all six faces of the fallback cube

    // Mark the west neighbour cell (indexed by y, z) as an occluder.
    const occState = occluderStates(palette, tex);
    expect(occState[2]).toBe(true); // model-less fallback is a full cube
    const west = newBorderPlane();
    setBorderBit(west, 5, 5); // (y=5, perp z=5)
    const withNeighbour = buildGeometryBuffers(solid, tex, { occlude: true, borders: { xNeg: west } });
    expect(verts(withNeighbour)).toBe(5 * 6); // west face dropped, five remain
  });

  it('culls the downward face at the world floor (hides bedrock underside)', () => {
    const palette = [air, textured, flat];
    const block: GeomInput = { palette, blocks: [{ state: 2, pos: [0, -64, 0] }] };
    const verts = (bs: ReturnType<typeof buildGeometryBuffers>) =>
      bs.reduce((n, b) => n + b.positions.length / 3, 0);
    // Without a floor: all six faces (the underside shows). With floorY=-64: the down face is culled.
    expect(verts(buildGeometryBuffers(block, tex, { occlude: true }))).toBe(6 * 6);
    expect(verts(buildGeometryBuffers(block, tex, { occlude: true, floorY: -64 }))).toBe(5 * 6);
  });

  it('marks full opaque cubes single-sided and other geometry double-sided when occluding', () => {
    const input: GeomInput = {
      palette: [air, flat, slab],
      blocks: [
        { state: 1, pos: [0, 0, 0] }, // full fallback cube → occluder → single-sided
        { state: 2, pos: [5, 0, 0] }, // slab → non-occluder → double-sided
      ],
    };
    const buffers = buildGeometryBuffers(input, tex, { occlude: true });
    const cube = buffers.find((b) => b.key.startsWith('c:'))!;
    const slabMat = buffers.find((b) => b.textured)!;
    expect(cube.doubleSided).toBe(false);
    expect(slabMat.doubleSided).toBe(true);
    // Structure path (no occlude) keeps everything double-sided + the base material key unchanged.
    const plain = buildGeometryBuffers(input, tex);
    expect(plain.every((b) => b.doubleSided)).toBe(true);
    expect(plain.find((b) => b.textured)!.key).toBe('t:block/stone');
  });
});
