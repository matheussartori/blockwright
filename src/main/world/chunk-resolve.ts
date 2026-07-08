// Bridge a decoded `ColumnData` (pure block data) into a `ChunkRenderPayload` (resolved models +
// texture keys + a unified palette), reusing the EXISTING asset pipeline (`resolveBlockEntry`). A
// world has millions of blocks but only a few hundred distinct block states, so every unique state
// is resolved once and memoized by its block-state string — the renderer's mesh worker then consumes
// the same shape as the single-structure path. Clear the memo whenever the content pack / workspace
// changes (asset resolution would otherwise be stale).
import type { ChunkRenderPayload, ChunkSectionPayload } from '@/shared/types';
import type { PaletteEntry } from '@/shared/types';
import { blockStateString, type RawPaletteEntry } from '../structure/io/raw';
import { resolveBlockEntry } from '../structure/catalog/block-catalog';
import { resolveEntities } from '../structure/assets/entity';
import { hasContent } from '../structure/assets/content-pack';
import type { ColumnData } from './anvil/chunk-decode';
import { grassTintFor } from './biome-tint';

interface Resolved {
  entry: PaletteEntry;
  textures: string[];
}

const memo = new Map<string, Resolved>();
/** Block ids already reported as fallback-coloured (warn ONCE per id, not per state). */
const reportedMisses = new Set<string>();

/** Drop the resolution memo (on workspace/content switch). */
export function clearChunkResolveCache(): void {
  memo.clear();
  reportedMisses.clear();
}

const normalizeProps = (props?: Record<string, string | number>): Record<string, string> =>
  Object.fromEntries(Object.entries(props ?? {}).map(([k, v]) => [k, String(v)]));

function resolveEntry(raw: RawPaletteEntry): Resolved {
  const key = blockStateString(raw);
  const hit = memo.get(key);
  if (hit) return hit;
  const resolved = resolveBlockEntry(raw.Name, normalizeProps(raw.Properties));
  memo.set(key, resolved);
  // Missing-texture diagnostics: a solid block whose model didn't resolve renders as a
  // flat colour. Surface each id once in the console (→ the Console dock), so modded
  // worlds don't silently miss — the complaint BlueMap gets.
  if (!resolved.entry.air && resolved.entry.models.length === 0 && !reportedMisses.has(raw.Name)) {
    reportedMisses.add(raw.Name);
    console.warn(`[world] no model/texture for ${key} — rendering as a flat colour`);
  }
  return resolved;
}

/** Resolve a decoded column into a render payload with a column-unified palette. */
export function resolveColumn(col: ColumnData): ChunkRenderPayload {
  const palette: PaletteEntry[] = [];
  const paletteIndex = new Map<string, number>(); // block-state string → unified index
  const textureKeys = new Set<string>();
  const sections: ChunkSectionPayload[] = [];

  /** Intern one section-local palette entry into the column palette, returning its unified index. */
  const intern = (raw: RawPaletteEntry): number => {
    const key = blockStateString(raw);
    const existing = paletteIndex.get(key);
    if (existing !== undefined) return existing;
    const { entry, textures } = resolveEntry(raw);
    const idx = palette.length;
    palette.push(entry);
    for (const t of textures) textureKeys.add(t);
    paletteIndex.set(key, idx);
    return idx;
  };

  for (const s of col.sections) {
    const localToUnified = s.palette.map(intern);
    // Biome palette + quart indices ride along (the cursor readout resolves them client-side).
    const biome = { biomePalette: s.biomePalette, biomes: s.biomes };
    if (s.uniform || !s.blocks) {
      sections.push({ sectionY: s.sectionY, blocks: null, uniform: true, fill: localToUnified[0] ?? 0, ...biome });
    } else {
      const blocks = new Uint16Array(4096);
      for (let c = 0; c < 4096; c++) blocks[c] = localToUnified[s.blocks[c]];
      sections.push({ sectionY: s.sectionY, blocks, uniform: false, fill: 0, ...biome });
    }
  }

  // Resolve entities to render shapes (armor stand → real model when its texture is on disk, else a
  // fallback cube) and fold their texture keys into the preload set. Skip entirely for the common
  // entity-free chunk (also keeps the content-pack probe off the hot path).
  const entities = col.entities.length ? resolveEntities(col.entities, hasContent()) : [];
  for (const e of entities) if (e.textureKey) textureKeys.add(e.textureKey);

  return {
    cx: col.cx,
    cz: col.cz,
    palette,
    sections,
    textureKeys: [...textureKeys],
    heightmap: col.heightmap,
    grassTint: grassTintFor(col),
    entities,
    empty: sections.length === 0 && entities.length === 0,
  };
}
