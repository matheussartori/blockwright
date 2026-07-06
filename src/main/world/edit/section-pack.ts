// Re-pack one 16³ chunk section's block states for the Anvil 1.16+ (non-spanning) format.
// The rules vanilla's `ChunkSerializer` enforces, asserted here so an edited section is
// byte-compatible with what the game itself would write:
//   • the palette is rebuilt from the 4096 cells (never grown-only — stale entries would
//     inflate `bits` and waste sectors),
//   • `bits = max(4, ceil(log2(paletteLen)))` — block states floor at 4 (biomes don't),
//   • a single-entry palette OMITS the `data` array entirely (uniform section),
//   • cell order is YZX (`ly*256 + lz*16 + lx`), packed non-spanning.
import type { RawPaletteEntry } from '../../structure/io/raw';
import { blockStateString } from '../../structure/io/raw';
import { bigToPairs, bitsForBlockStates, packNonSpanning } from '../../structure/io/long-bits';

export const SECTION_VOLUME = 4096;

export interface PackedSection {
  palette: RawPaletteEntry[];
  /** Non-spanning packed indices as prismarine `[hi, lo]` pairs, or null when the section is
   *  uniform (palette length 1 ⇒ vanilla omits `data`). */
  data: [number, number][] | null;
}

/**
 * Rebuild a section's palette + packed data from its 4096 cells.
 *
 * @param cells Exactly 4096 block states in YZX order.
 * @returns The deduped palette (first-seen order) and the packed long array (null if uniform).
 * @throws If `cells` isn't exactly 4096 entries — a partial section is a caller bug, never
 *   something to "best effort" write into a save.
 */
export function packSectionCells(cells: RawPaletteEntry[]): PackedSection {
  if (cells.length !== SECTION_VOLUME) {
    throw new Error(`section repack needs exactly ${SECTION_VOLUME} cells, got ${cells.length}`);
  }
  const palette: RawPaletteEntry[] = [];
  const byKey = new Map<string, number>();
  const indices = new Uint16Array(SECTION_VOLUME);
  for (let i = 0; i < SECTION_VOLUME; i++) {
    const key = blockStateString(cells[i]);
    let idx = byKey.get(key);
    if (idx === undefined) {
      idx = palette.length;
      byKey.set(key, idx);
      palette.push(cells[i]);
    }
    indices[i] = idx;
  }
  if (palette.length === 1) return { palette, data: null };
  const bits = bitsForBlockStates(palette.length);
  return { palette, data: bigToPairs(packNonSpanning(indices, bits)) };
}
