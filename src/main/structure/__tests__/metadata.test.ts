import { describe, expect, it } from 'vitest';
import type { PaletteEntry, StructureData } from '@/shared/types';
import { buildMetadata, metadataFromStructure } from '../metadata';

const entry = (name: string, air = false): PaletteEntry => ({
  name,
  properties: {},
  models: [],
  color: [0, 0, 0],
  air,
});

/** A minimal StructureData: stone + air palette, blocks as given. */
const structure = (blocks: StructureData['blocks'], dataVersion?: number): StructureData => ({
  name: 'fixture.nbt',
  path: '/tmp/fixture.nbt',
  size: [4, 4, 4],
  palette: [entry('minecraft:stone'), entry('minecraft:air', true)],
  blocks,
  textures: [],
  hasContent: false,
  blockCount: blocks.length,
  jigsaws: [],
  dataMarkers: [],
  entities: [],
  ...(dataVersion !== undefined ? { dataVersion } : {}),
});

describe('buildMetadata', () => {
  it('sorts the palette by count and caps the long tail', () => {
    const counts = new Map<string, number>();
    for (let i = 0; i < 45; i++) counts.set(`minecraft:block_${i}`, i + 1);
    const meta = buildMetadata({
      name: 'big',
      source: '/tmp/big.nbt',
      size: [4, 4, 4],
      solids: [[0, 0, 0]],
      paletteCounts: counts,
      floors: [],
    });
    expect(meta.palette).toHaveLength(40); // PALETTE_CAP
    expect(meta.palette[0]).toEqual({ name: 'minecraft:block_44', count: 45 }); // most-used first
    expect(meta.palette.at(-1)?.count).toBeGreaterThan(1); // the tail got dropped, not the head
  });

  it('keeps explicit floors, auto-detects when omitted, and records dataVersion', () => {
    const base = {
      name: 'f',
      source: '/tmp/f.nbt',
      size: [3, 5, 3] as [number, number, number],
      solids: [[0, 0, 0], [1, 0, 1], [2, 0, 2]] as [number, number, number][],
      paletteCounts: new Map([['minecraft:stone', 3]]),
    };
    const explicit = buildMetadata({ ...base, floors: [{ id: 'f1', name: 'Ground', from: 0, to: 3 }] });
    expect(explicit.floors).toEqual([{ id: 'f1', name: 'Ground', from: 0, to: 3 }]);
    expect(explicit.dataVersion).toBeUndefined();

    const detected = buildMetadata({ ...base, dataVersion: 4903 });
    expect(Array.isArray(detected.floors)).toBe(true); // delegated to detectFloors (own tests)
    expect(detected.dataVersion).toBe(4903);
    expect(detected.blockCount).toBe(3);
  });
});

describe('metadataFromStructure', () => {
  it('drops air blocks and threads the source DataVersion through', () => {
    const s = structure(
      [
        { state: 0, pos: [0, 0, 0] },
        { state: 0, pos: [1, 0, 0] },
        { state: 1, pos: [2, 0, 0] }, // air — excluded from solids + palette counts
      ],
      4903,
    );
    const meta = metadataFromStructure(s);
    expect(meta.blockCount).toBe(2);
    expect(meta.palette).toEqual([{ name: 'minecraft:stone', count: 2 }]);
    expect(meta.dataVersion).toBe(4903);
    expect(meta.source).toBe('/tmp/fixture.nbt');
  });

  it('omits dataVersion when the source format carried none', () => {
    const meta = metadataFromStructure(structure([{ state: 0, pos: [0, 0, 0] }]));
    expect(meta.dataVersion).toBeUndefined();
  });
});
