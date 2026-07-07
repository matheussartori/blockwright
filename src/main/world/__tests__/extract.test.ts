import { describe, expect, it } from 'vitest';
import type { ColumnData, SectionData } from '../anvil/chunk-decode';
import { blockStateString, type RawPaletteEntry } from '../../structure/io/raw';
import { encodeRaw } from '../../structure/io/convert';
import { decodeSchem } from '../../structure/io/schematic';
import { extractRegion, type ChunkGetter } from '../extract';

const yzx = (lx: number, ly: number, lz: number) => ly * 256 + lz * 16 + lx;

/** A minimal SectionData with an explicit 4096-cell grid. */
function grid(sectionY: number, palette: RawPaletteEntry[], set: (cells: Uint16Array) => void): SectionData {
  const cells = new Uint16Array(4096);
  set(cells);
  return { sectionY, palette, blocks: cells, uniform: false, biomePalette: null, biomes: null };
}

/** A uniform (single-block) section. */
function uniform(sectionY: number, name: string): SectionData {
  return { sectionY, palette: [{ Name: name }], blocks: null, uniform: true, biomePalette: null, biomes: null };
}

function column(cx: number, cz: number, sections: SectionData[], extra: Partial<ColumnData> = {}): ColumnData {
  return { cx, cz, dataVersion: 3955, minSectionY: 0, sections, heightmap: null, blockEntities: [], entities: [], ...extra };
}

/** Look up a block's palette entry at a relative pos in an extracted structure. */
function entryAt(raw: Awaited<ReturnType<typeof extractRegion>>, pos: [number, number, number]): RawPaletteEntry | undefined {
  const b = raw.blocks.find((x) => x.pos[0] === pos[0] && x.pos[1] === pos[1] && x.pos[2] === pos[2]);
  return b ? raw.palette[b.state] : undefined;
}

describe('extractRegion', () => {
  it('samples cells across a chunk boundary, relativising positions and interning the palette', async () => {
    // A stone block at world (1,2,3) in chunk (0,0) and a dirt block at world (17,2,3) in chunk (1,0).
    const c00 = column(0, 0, [
      grid(0, [{ Name: 'minecraft:air' }, { Name: 'minecraft:stone' }], (cells) => {
        cells[yzx(1, 2, 3)] = 1;
      }),
    ]);
    const c10 = column(1, 0, [
      grid(0, [{ Name: 'minecraft:air' }, { Name: 'minecraft:dirt' }], (cells) => {
        cells[yzx(1, 2, 3)] = 1; // world x=17 → local 1
      }),
    ]);
    const getChunk: ChunkGetter = async (_dim, cx) => (cx === 0 ? c00 : cx === 1 ? c10 : null);

    const raw = await extractRegion({ dim: 'overworld', min: [0, 0, 0], max: [17, 3, 3] }, getChunk);

    expect(raw.size).toEqual([18, 4, 4]);
    expect(raw.blocks.length).toBe(18 * 4 * 4);
    // Air is index 0.
    expect(blockStateString(raw.palette[0])).toBe('minecraft:air');
    // The two solid blocks landed at box-relative coords with the right ids.
    expect(entryAt(raw, [1, 2, 3])?.Name).toBe('minecraft:stone');
    expect(entryAt(raw, [17, 2, 3])?.Name).toBe('minecraft:dirt');
    // An empty cell is air.
    expect(entryAt(raw, [0, 0, 0])?.Name).toBe('minecraft:air');
  });

  it('treats an absent/uniform section correctly (missing ⇒ air, uniform ⇒ that block)', async () => {
    // Section Y=1 present as uniform bedrock; section Y=0 absent (all air).
    const col = column(0, 0, [uniform(1, 'minecraft:bedrock')]);
    const getChunk: ChunkGetter = async () => col;

    const raw = await extractRegion({ dim: 'overworld', min: [0, 0, 0], max: [0, 31, 0] }, getChunk);

    expect(entryAt(raw, [0, 0, 0])?.Name).toBe('minecraft:air'); // world Y=0, absent section
    expect(entryAt(raw, [0, 16, 0])?.Name).toBe('minecraft:bedrock'); // world Y=16 → section Y=1
  });

  it('handles negative-Y sections via floor division', async () => {
    // World Y=-5 is section Y=-1, local Y=11.
    const col = column(0, 0, [
      grid(-1, [{ Name: 'minecraft:air' }, { Name: 'minecraft:deepslate' }], (cells) => {
        cells[yzx(0, 11, 0)] = 1;
      }),
    ]);
    const getChunk: ChunkGetter = async () => col;

    const raw = await extractRegion({ dim: 'overworld', min: [0, -8, 0], max: [0, -1, 0] }, getChunk);
    expect(entryAt(raw, [0, 3, 0])?.Name).toBe('minecraft:deepslate'); // world Y=-5 → relative 3
  });

  it('carries block entities and entities inside the box (relativised), drops those outside', async () => {
    const col = column(0, 0, [uniform(0, 'minecraft:stone')], {
      blockEntities: [
        { pos: [2, 3, 4], id: 'minecraft:chest', nbt: { Items: [] } },
        { pos: [50, 3, 4], id: 'minecraft:chest', nbt: {} }, // outside box
      ],
      entities: [
        { pos: [2.5, 3.5, 4.5], blockPos: [2, 3, 4], nbt: { id: 'minecraft:armor_stand' } },
        { pos: [99.5, 3.5, 4.5], blockPos: [99, 3, 4], nbt: {} }, // outside box
      ],
    });
    const getChunk: ChunkGetter = async () => col;

    const raw = await extractRegion({ dim: 'overworld', min: [1, 1, 1], max: [10, 10, 10] }, getChunk);

    expect(raw.blockEntities).toHaveLength(1);
    expect(raw.blockEntities![0].pos).toEqual([1, 2, 3]); // (2,3,4) - (1,1,1)
    expect(raw.blockEntities![0].id).toBe('minecraft:chest');
    expect(raw.entities).toHaveLength(1);
    expect(raw.entities![0].pos).toEqual([1.5, 2.5, 3.5]);
    expect(raw.entities![0].blockPos).toEqual([1, 2, 3]);
  });

  it('produces an encodable structure — a .schem round-trip preserves the sampled blocks', async () => {
    const col = column(0, 0, [
      grid(0, [{ Name: 'minecraft:air' }, { Name: 'minecraft:oak_stairs', Properties: { facing: 'east' } }], (cells) => {
        cells[yzx(2, 1, 2)] = 1;
      }),
    ]);
    const getChunk: ChunkGetter = async () => col;

    const raw = await extractRegion({ dim: 'overworld', min: [0, 0, 0], max: [3, 3, 3] }, getChunk);
    // encodeRaw picks the codec from the extension; decode it back and confirm the block survives.
    const buffer = encodeRaw(raw, 'x.schem', 1_700_000_000_000);
    const back = await decodeSchem(buffer);

    expect(back.size).toEqual([4, 4, 4]);
    const b = back.blocks.find((x) => x.pos[0] === 2 && x.pos[1] === 1 && x.pos[2] === 2);
    expect(b).toBeDefined();
    expect(blockStateString(back.palette[b!.state])).toBe('minecraft:oak_stairs[facing=east]');
  });
});
