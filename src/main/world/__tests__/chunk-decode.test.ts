import { describe, expect, it } from 'vitest';
import { bigToPairs, packNonSpanning, packSpanning } from '../../structure/io/long-bits';
import { blockIndexAt, decodeChunk } from '../anvil/chunk-decode';

/** Build a section's `block_states.data` ([hi,lo] pairs) from a 4096 YZX cell array. */
function packSection(cells: number[], bits: number): [number, number][] {
  return bigToPairs(packNonSpanning(cells, bits));
}

const yzx = (lx: number, ly: number, lz: number) => ly * 256 + lz * 16 + lx;

describe('decodeChunk (1.18+ paletted, non-spanning)', () => {
  it('decodes sections, drops all-air, honours uniform fills, resolves cell indices', () => {
    // Section Y=0: air + stone; one stone block at (1,2,3).
    const cells = new Array(4096).fill(0);
    cells[yzx(1, 2, 3)] = 1;

    const nbt = {
      DataVersion: 3955,
      xPos: 5,
      zPos: -7,
      sections: [
        {
          Y: 0,
          block_states: {
            palette: [{ Name: 'minecraft:air' }, { Name: 'minecraft:stone' }],
            data: packSection(cells, 4),
          },
        },
        // Uniform bedrock section — single-entry palette, no data array.
        { Y: 1, block_states: { palette: [{ Name: 'minecraft:bedrock' }] } },
        // All-air section — must be dropped.
        { Y: 2, block_states: { palette: [{ Name: 'minecraft:air' }] } },
      ],
    };

    const col = decodeChunk(nbt as never)!;
    expect(col).not.toBeNull();
    expect(col.cx).toBe(5);
    expect(col.cz).toBe(-7);
    expect(col.dataVersion).toBe(3955);
    expect(col.minSectionY).toBe(0);
    expect(col.sections.map((s) => s.sectionY)).toEqual([0, 1]); // air section dropped

    const s0 = col.sections[0];
    expect(s0.uniform).toBe(false);
    expect(blockIndexAt(s0, 1, 2, 3)).toBe(1);
    expect(s0.palette[blockIndexAt(s0, 1, 2, 3)].Name).toBe('minecraft:stone');
    expect(blockIndexAt(s0, 0, 0, 0)).toBe(0); // air elsewhere

    const s1 = col.sections[1];
    expect(s1.uniform).toBe(true);
    expect(s1.blocks).toBeNull();
    expect(blockIndexAt(s1, 8, 8, 8)).toBe(0);
    expect(s1.palette[0].Name).toBe('minecraft:bedrock');
  });

  it('decodes a MOTION_BLOCKING heightmap to world Y', () => {
    const heights = new Array(256).fill(68); // 68 blocks above minY (=0)
    const nbt = {
      DataVersion: 3955,
      xPos: 0,
      zPos: 0,
      sections: [{ Y: 0, block_states: { palette: [{ Name: 'minecraft:stone' }] } }],
      Heightmaps: { MOTION_BLOCKING: bigToPairs(packNonSpanning(heights, 9)) },
    };
    const col = decodeChunk(nbt as never)!;
    expect(col.heightmap).not.toBeNull();
    expect(col.heightmap![0]).toBe(67); // minY(0) + 68 - 1
  });

  it('returns null for a chunk without sections (pre-1.13 / undecodable)', () => {
    expect(decodeChunk({ DataVersion: 100, Level: {} } as never)).toBeNull();
  });

  it('decodes the legacy 1.13–1.15 format (Level.Sections, spanning long array)', () => {
    const cells = new Array(4096).fill(0);
    cells[yzx(2, 4, 6)] = 1; // stone
    const nbt = {
      DataVersion: 1631, // 1.13.2 → spanning
      Level: {
        xPos: 1,
        zPos: 2,
        Sections: [
          {
            Y: 3,
            Palette: [{ Name: 'minecraft:air' }, { Name: 'minecraft:stone' }],
            BlockStates: bigToPairs(packSpanning(cells, 4)),
          },
        ],
      },
    };
    const col = decodeChunk(nbt as never)!;
    expect(col).not.toBeNull();
    expect(col.cx).toBe(1);
    expect(col.cz).toBe(2);
    expect(col.sections).toHaveLength(1);
    const s = col.sections[0];
    expect(s.sectionY).toBe(3);
    expect(blockIndexAt(s, 2, 4, 6)).toBe(1);
    expect(s.palette[blockIndexAt(s, 2, 4, 6)].Name).toBe('minecraft:stone');
  });

  it('decodes the legacy 1.16–1.17 format (Level.Sections, non-spanning)', () => {
    const cells = new Array(4096).fill(1); // all stone
    const nbt = {
      DataVersion: 2724, // 1.17 → non-spanning
      Level: {
        xPos: 0,
        zPos: 0,
        Sections: [
          { Y: 0, Palette: [{ Name: 'minecraft:air' }, { Name: 'minecraft:stone' }], BlockStates: bigToPairs(packNonSpanning(cells, 4)) },
        ],
      },
    };
    const col = decodeChunk(nbt as never)!;
    expect(col.sections).toHaveLength(1);
    expect(blockIndexAt(col.sections[0], 5, 5, 5)).toBe(1);
  });
});
