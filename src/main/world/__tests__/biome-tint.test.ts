import { describe, expect, it } from 'vitest';
import { grassTintFor } from '../biome-tint';
import type { ColumnData, SectionData } from '../anvil/chunk-decode';

function col(sections: Partial<SectionData>[]): ColumnData {
  return {
    cx: 0,
    cz: 0,
    dataVersion: 3955,
    minSectionY: 0,
    heightmap: null,
    blockEntities: [],
    entities: [],
    sections: sections.map((s) => ({
      sectionY: 0,
      palette: [],
      blocks: null,
      uniform: true,
      biomePalette: null,
      biomes: null,
      ...s,
    })),
  };
}

describe('grassTintFor', () => {
  it('returns null when no section carries biome data', () => {
    expect(grassTintFor(col([{ biomePalette: null }]))).toBeNull();
  });

  it('uses the highest biome-bearing section and maps a known biome to its tint', () => {
    const tint = grassTintFor(
      col([
        { sectionY: 2, biomePalette: ['minecraft:swamp'] },
        { sectionY: 5, biomePalette: ['minecraft:desert'] }, // higher → picked
      ]),
    );
    // Desert grass is the khaki tint, distinct from the default plains green.
    expect(tint).toEqual([0xbf / 255, 0xb7 / 255, 0x55 / 255]);
  });

  it('falls back to the default green for an unknown/mod biome', () => {
    const tint = grassTintFor(col([{ biomePalette: ['theplacebeyond:bleak'] }]));
    expect(tint).toEqual([0x7c / 255, 0xbd / 255, 0x59 / 255]);
  });

  it('picks the dominant biome from a multi-biome section grid', () => {
    const biomes = new Uint8Array(64).fill(1); // mostly index 1 (jungle)
    biomes[0] = 0;
    const tint = grassTintFor(
      col([{ biomePalette: ['minecraft:plains', 'minecraft:jungle'], biomes, uniform: false }]),
    );
    expect(tint).toEqual([0x59 / 255, 0xc9 / 255, 0x3c / 255]); // jungle
  });
});
