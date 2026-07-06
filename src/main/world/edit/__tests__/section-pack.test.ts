import { describe, expect, it } from 'vitest';
import { bitsForBlockStates, pairsToBig, unpackNonSpanning } from '../../../structure/io/long-bits';
import type { RawPaletteEntry } from '../../../structure/io/raw';
import { blockStateString } from '../../../structure/io/raw';
import { packSectionCells, SECTION_VOLUME } from '../section-pack';

/** Deterministic pseudo-random (no Math.random — reproducible failures). */
function rng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 0x100000000;
  };
}

const entry = (i: number): RawPaletteEntry =>
  i === 0 ? { Name: 'minecraft:air' } : { Name: `minecraft:block_${i}`, Properties: { facing: 'north', idx: String(i) } };

function randomCells(paletteSize: number, seed: number): RawPaletteEntry[] {
  const rand = rng(seed);
  const cells = new Array<RawPaletteEntry>(SECTION_VOLUME);
  for (let i = 0; i < SECTION_VOLUME; i++) {
    // Guarantee every palette entry appears at least once (first N cells), rest random.
    const idx = i < paletteSize ? i : Math.floor(rand() * paletteSize);
    cells[i] = entry(idx);
  }
  return cells;
}

describe('packSectionCells', () => {
  it('rejects a partial section', () => {
    expect(() => packSectionCells([entry(0)])).toThrow(/4096/);
  });

  it('omits data for a uniform section (single-entry palette)', () => {
    const packed = packSectionCells(new Array(SECTION_VOLUME).fill(entry(1)));
    expect(packed.palette).toHaveLength(1);
    expect(packed.data).toBeNull();
  });

  it('floors bits at 4 for a 2-entry palette (Anvil block-state rule)', () => {
    const cells = randomCells(2, 42);
    const packed = packSectionCells(cells);
    expect(packed.palette).toHaveLength(2);
    // 4 bits ⇒ 16 entries per long ⇒ 256 longs for 4096 cells.
    expect(packed.data).toHaveLength(256);
  });

  // Property test across the bit-width boundaries: 2→4 bits, 16/17→4/5 bits, 32/33→5/6,
  // 256/257→8/9. Round-trip through the INDEPENDENT unpacker must restore every cell.
  it.each([2, 3, 15, 16, 17, 31, 32, 33, 255, 256, 257])(
    'round-trips a %i-entry palette through the non-spanning unpacker',
    (paletteSize) => {
      const cells = randomCells(paletteSize, paletteSize * 7 + 1);
      const packed = packSectionCells(cells);
      expect(packed.palette.length).toBe(paletteSize);
      const bits = bitsForBlockStates(paletteSize);
      expect(packed.data).toHaveLength(Math.ceil(SECTION_VOLUME / Math.floor(64 / bits)));

      const indices = unpackNonSpanning(pairsToBig(packed.data ?? []), bits, SECTION_VOLUME);
      for (let i = 0; i < SECTION_VOLUME; i++) {
        expect(blockStateString(packed.palette[indices[i]])).toBe(blockStateString(cells[i]));
      }
    },
  );

  it('dedups identical states even when they are distinct objects', () => {
    const cells = new Array<RawPaletteEntry>(SECTION_VOLUME);
    for (let i = 0; i < SECTION_VOLUME; i++) {
      cells[i] = { Name: 'minecraft:oak_stairs', Properties: { facing: 'east', half: 'bottom' } };
    }
    const packed = packSectionCells(cells);
    expect(packed.palette).toHaveLength(1);
    expect(packed.data).toBeNull();
  });
});
