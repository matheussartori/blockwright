import { describe, expect, it, vi } from 'vitest';

// The real resolver reaches the Electron `app` (content-dir), unavailable in the node test env — and
// resolution has its own tests. Stub it so this suite exercises ONLY the palette unification + remap.
vi.mock('../../structure/catalog/block-catalog', () => ({
  resolveBlockEntry: (name: string) => ({
    entry: { name, properties: {}, models: [], color: [0, 0, 0], air: name.endsWith(':air') },
    textures: [`block/${name.split(':')[1]}`],
  }),
}));

import { clearChunkResolveCache, resolveColumn } from '../chunk-resolve';
import type { ColumnData } from '../anvil/chunk-decode';
function column(): ColumnData {
  const blocks = new Uint16Array(4096); // all air (index 0)
  blocks[0] = 1; // one stone
  blocks[1] = 2; // one dirt
  return {
    cx: 3,
    cz: -4,
    dataVersion: 3955,
    minSectionY: 0,
    heightmap: null,
    blockEntities: [],
    sections: [
      {
        sectionY: 0,
        palette: [{ Name: 'minecraft:air' }, { Name: 'minecraft:stone' }, { Name: 'minecraft:dirt' }],
        blocks,
        uniform: false,
        biomePalette: null,
        biomes: null,
      },
      // Uniform bedrock — a different local palette; must unify with the column palette.
      { sectionY: 1, palette: [{ Name: 'minecraft:bedrock' }], blocks: null, uniform: true, biomePalette: null, biomes: null },
    ],
  };
}

describe('resolveColumn', () => {
  it('unifies the palette across sections and remaps section indices', () => {
    clearChunkResolveCache();
    const payload = resolveColumn(column());
    expect(payload.cx).toBe(3);
    expect(payload.cz).toBe(-4);
    expect(payload.empty).toBe(false);

    // Column palette holds each distinct state once: air, stone, dirt, bedrock.
    const names = payload.palette.map((p) => p.name);
    expect(names).toEqual(['minecraft:air', 'minecraft:stone', 'minecraft:dirt', 'minecraft:bedrock']);

    const s0 = payload.sections[0];
    expect(s0.uniform).toBe(false);
    expect(s0.blocks![0]).toBe(names.indexOf('minecraft:stone'));
    expect(s0.blocks![1]).toBe(names.indexOf('minecraft:dirt'));
    expect(s0.blocks![2]).toBe(names.indexOf('minecraft:air'));

    const s1 = payload.sections[1];
    expect(s1.uniform).toBe(true);
    expect(s1.blocks).toBeNull();
    expect(s1.fill).toBe(names.indexOf('minecraft:bedrock'));
  });

  it('reports an empty column when no sections remain', () => {
    const payload = resolveColumn({ ...column(), sections: [] });
    expect(payload.empty).toBe(true);
    expect(payload.palette).toEqual([]);
  });
});
