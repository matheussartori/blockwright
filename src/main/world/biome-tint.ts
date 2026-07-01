// Approximate biome grass/foliage tint. Vanilla derives grass colour from a temperature/downfall
// colormap (grass.png); we use a compact per-biome table instead — enough for foliage to VARY by
// biome (swamp dark, savanna khaki, jungle lush) rather than one flat green everywhere. The chunk's
// dominant surface biome picks the tint, carried on the render payload and applied to `tintindex`
// faces in the near geometry. Unknown/mod biomes fall back to the default plains green.
import type { ColumnData } from './anvil/chunk-decode';

/** Default plains grass (matches the renderer's historical fixed TINT 0x7cbd59). */
const DEFAULT: [number, number, number] = [0x7c / 255, 0xbd / 255, 0x59 / 255];

/** Grass tint per biome id (sRGB 0..1). Keyed by the bare path (namespace stripped). */
const GRASS: Record<string, [number, number, number]> = {
  swamp: [0x6a / 255, 0x70 / 255, 0x39 / 255],
  mangrove_swamp: [0x6a / 255, 0x70 / 255, 0x39 / 255],
  jungle: [0x59 / 255, 0xc9 / 255, 0x3c / 255],
  bamboo_jungle: [0x59 / 255, 0xc9 / 255, 0x3c / 255],
  sparse_jungle: [0x64 / 255, 0xc7 / 255, 0x3f / 255],
  savanna: [0xbf / 255, 0xb7 / 255, 0x55 / 255],
  savanna_plateau: [0xbf / 255, 0xb7 / 255, 0x55 / 255],
  windswept_savanna: [0xbf / 255, 0xb7 / 255, 0x55 / 255],
  desert: [0xbf / 255, 0xb7 / 255, 0x55 / 255],
  badlands: [0x90 / 255, 0x81 / 255, 0x4d / 255],
  wooded_badlands: [0x90 / 255, 0x81 / 255, 0x4d / 255],
  taiga: [0x86 / 255, 0xb7 / 255, 0x83 / 255],
  snowy_taiga: [0x60 / 255, 0xa1 / 255, 0x7b / 255],
  snowy_plains: [0x80 / 255, 0xb4 / 255, 0x97 / 255],
  ice_spikes: [0x80 / 255, 0xb4 / 255, 0x97 / 255],
  grove: [0x80 / 255, 0xb4 / 255, 0x97 / 255],
  dark_forest: [0x50 / 255, 0x76 / 255, 0x2f / 255],
  birch_forest: [0x88 / 255, 0xbb / 255, 0x67 / 255],
  old_growth_birch_forest: [0x88 / 255, 0xbb / 255, 0x67 / 255],
  forest: [0x79 / 255, 0xc0 / 255, 0x5a / 255],
  flower_forest: [0x79 / 255, 0xc0 / 255, 0x5a / 255],
  plains: DEFAULT,
  meadow: [0x83 / 255, 0xbb / 255, 0x6d / 255],
  cherry_grove: [0xb6 / 255, 0xdb / 255, 0x61 / 255],
};

/** The dominant surface biome's grass tint for a decoded chunk (null when no biome data). Samples
 *  the highest section that carries biomes — roughly the surface biome. */
export function grassTintFor(col: ColumnData): [number, number, number] | null {
  // Highest section with biome data first (closest to the surface).
  const withBiomes = col.sections.filter((s) => s.biomePalette && s.biomePalette.length);
  if (!withBiomes.length) return null;
  withBiomes.sort((a, b) => b.sectionY - a.sectionY);
  const s = withBiomes[0];
  const palette = s.biomePalette!;

  let biomeId: string;
  if (palette.length === 1 || !s.biomes) {
    biomeId = palette[0];
  } else {
    const counts = new Array(palette.length).fill(0);
    for (const idx of s.biomes) counts[idx]++;
    let best = 0;
    for (let i = 1; i < counts.length; i++) if (counts[i] > counts[best]) best = i;
    biomeId = palette[best];
  }
  return GRASS[biomeId.replace(/^.*:/, '')] ?? DEFAULT;
}
