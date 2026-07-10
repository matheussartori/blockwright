// Integration of the Place tool's commit with Terrain Blend (§1.2): a synthetic sloped
// terrain goes through the REAL commitPlace — placement plan + blend planner + state
// resolution — and the pending map must hold the structure, its foundation pillars and
// the feather ring as ONE undo step. The api bridge is mocked (no preload in vitest).
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { StructureData } from '@/shared/types';

vi.mock('../../api', () => ({
  api: {
    resolveBlock: vi.fn(async (name: string, properties?: Record<string, string>) => ({
      entry: { name, properties, models: [], color: [0, 0, 0] as [number, number, number], air: name.endsWith('air') },
      textures: [`tex/${name.replace(/^minecraft:/, '')}`],
    })),
  },
}));

import { worldEditStore, type CommitPlaceHost } from '../world-edit';
import type { SurfaceSample } from '../../world/blend';

const GRASS = { name: 'minecraft:grass_block' };
const DIRT = { name: 'minecraft:dirt' };

/** Terrain rising 1 block per +x from y=9 at x≤0 (grass over dirt). */
const groundY = (x: number) => 9 + Math.max(0, x);
const host: CommitPlaceHost = {
  chunkLoaded: () => true,
  loadTextures: async () => undefined,
  surfaceAt: (x): SurfaceSample => ({ y: groundY(x), surface: GRASS, filler: DIRT }),
  blockAt: (x, y) => {
    const g = groundY(x);
    if (y > g) return { name: 'minecraft:air' };
    return y === g ? GRASS : DIRT;
  },
};

/** A 3×1×3 stone slab structure. */
const slab: StructureData = {
  size: [3, 1, 3],
  palette: [{ name: 'minecraft:stone', models: [], color: [0.5, 0.5, 0.5], air: false }],
  blocks: Array.from({ length: 9 }, (_, i) => ({ state: 0, pos: [i % 3, 0, Math.floor(i / 3)] as [number, number, number] })),
  textures: [],
  blockCount: 9,
} as unknown as StructureData;

const st = worldEditStore.getState;

beforeEach(() => {
  st().discard();
  st().cancelPlace();
  st().setBlend({ foundation: true, feather: 2, excavate: false, sink: true });
});

describe('commitPlace + Terrain Blend', () => {
  it('commits the structure, its foundation and the feather ring as one undo step', async () => {
    st().beginPlace('doc1', 'Slab', slab);
    // Pin the box min corner at (0, 13, 0): terrain (y=9..11 under it) leaves a gap.
    st().aimPlace([1, 13, 1], true);
    expect(st().place?.anchor).toEqual([0, 13, 0]);

    const ok = await st().commitPlace(host);
    expect(ok).toBe(true);

    const pending = st().pending;
    // The structure itself.
    expect(pending['0,13,0']?.name).toBe('minecraft:stone');
    expect(pending['2,13,2']?.name).toBe('minecraft:stone');
    // Foundation: the gap under column (0,0) — ground y=9 → dirt at 10..12.
    expect(pending['0,12,0']?.name).toBe(DIRT.name);
    expect(pending['0,10,0']?.name).toBe(DIRT.name);
    expect(pending['0,9,0']).toBeUndefined(); // the surface block is untouched
    // NO floating columns anywhere under the footprint.
    for (let x = 0; x < 3; x++)
      for (let z = 0; z < 3; z++)
        for (let y = groundY(x) + 1; y < 13; y++)
          expect(pending[`${x},${y},${z}`]?.name).toBe(DIRT.name);
    // Feather ring: at least one raised column just outside the footprint, grass-capped.
    const ring = Object.values(pending).filter((e) => (e.x < 0 || e.x > 2 || e.z < 0 || e.z > 2) && e.name !== 'minecraft:air');
    expect(ring.length).toBeGreaterThan(0);
    expect(ring.some((e) => e.name === GRASS.name)).toBe(true);

    // One undo step drops everything.
    st().undo();
    expect(st().pendingCount).toBe(0);
  });

  it('blend off commits exactly the placement plan', async () => {
    st().setBlend({ foundation: false, feather: 0, excavate: false });
    st().beginPlace('doc1', 'Slab', slab);
    st().aimPlace([1, 13, 1], true);
    await st().commitPlace(host);
    expect(st().pendingCount).toBe(9);
  });
});
