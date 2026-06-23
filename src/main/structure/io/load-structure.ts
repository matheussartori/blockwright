// Reads and parses Minecraft `.nbt` structure files into renderable data.
import fs from 'node:fs/promises';
import path from 'node:path';
import * as nbt from 'prismarine-nbt';
import type { JigsawConnector, PaletteEntry, StructureData } from '@/shared/types';
import { getActiveWorkspace, hasContent } from '../assets/content-pack';
import { collectTextures } from '../assets/model-loader';
import { isAir, resolveBlock } from '../assets/blockstate-resolver';
import { fallbackColor } from '../assets/fallback-color';
import { extractJigsaws } from '../jigsaw/jigsaw';
import { decodeSchem } from './schematic';
import { decodeLitematic } from './litematica';

// The raw structure shape lives in ./raw (shared by every codec); re-exported here so the
// existing `from './load-structure'` importers (jigsaw extraction) keep resolving it.
export type { RawPaletteEntry, RawBlock } from './raw';
import type { RawPaletteEntry, RawBlock } from './raw';

/** Lightweight structure metadata for jigsaw assembly: just size + connectors,
 *  skipping the (expensive) model resolution that full loading does. */
export interface StructureMeta {
  size: [number, number, number];
  jigsaws: JigsawConnector[];
}

/** Parse only the size and jigsaw connectors of a structure file. Used by the
 *  assembler, which traverses many pieces and never needs their meshes. */
export async function loadStructureMeta(filePath: string): Promise<StructureMeta> {
  const buffer = await fs.readFile(filePath);
  const { parsed } = await nbt.parse(buffer);
  const root = nbt.simplify(parsed) as { size?: number[]; palette?: RawPaletteEntry[]; blocks?: RawBlock[] };
  return {
    size: (root.size ?? [0, 0, 0]) as [number, number, number],
    jigsaws: extractJigsaws(root.palette ?? [], root.blocks ?? []),
  };
}

/** Resolve raw {size, palette, blocks} (from ANY source format — vanilla `.nbt` or an
 *  imported schematic) into renderable StructureData: resolve each palette entry's models +
 *  textures, filter blocks, extract jigsaws. The single place the resolution lives, so a
 *  `.schem`/`.litematic` import produces exactly the same shape as a native `.nbt`. */
export function buildStructureData(
  filePath: string,
  size: [number, number, number],
  rawPalette: RawPaletteEntry[],
  rawBlocks: RawBlock[],
): StructureData {
  const withContent = hasContent();
  // Resolve models if the vanilla pack is present or a mod workspace is open
  // (workspace structures reference both mod and vanilla blocks).
  const canResolve = withContent || getActiveWorkspace() !== null;

  const palette: PaletteEntry[] = rawPalette.map((raw) => {
    const properties = normalizeProps(raw.Properties);
    const air = isAir(raw.Name);
    const models = !air && canResolve ? resolveBlock(raw.Name, properties) : [];
    return { name: raw.Name, properties, models, color: fallbackColor(raw.Name), air };
  });

  const blocks = rawBlocks
    .filter((b) => b.pos && typeof b.state === 'number')
    .map((b) => ({ state: b.state, pos: b.pos as [number, number, number] }));

  const textureSet = new Set<string>();
  for (const entry of palette) collectTextures(entry.models, textureSet);

  return {
    name: path.basename(filePath),
    path: filePath,
    size,
    palette,
    blocks,
    textures: [...textureSet],
    hasContent: withContent,
    blockCount: blocks.filter((b) => !palette[b.state]?.air).length,
    jigsaws: extractJigsaws(rawPalette, rawBlocks),
  };
}

/** Parse a structure file at `filePath` into a fully resolved StructureData. Handles the
 *  vanilla `.nbt` structure format plus imported Sponge `.schem` and Litematica `.litematic`
 *  schematics (decoded to the same raw shape), so all three render + edit identically. */
export async function loadStructure(filePath: string): Promise<StructureData> {
  const buffer = await fs.readFile(filePath);
  const lower = filePath.toLowerCase();
  if (lower.endsWith('.schem') || lower.endsWith('.litematic')) {
    const raw = lower.endsWith('.schem') ? await decodeSchem(buffer) : await decodeLitematic(buffer);
    return buildStructureData(filePath, raw.size, raw.palette, raw.blocks);
  }
  const { parsed } = await nbt.parse(buffer);
  const root = nbt.simplify(parsed) as {
    size?: number[];
    palette?: RawPaletteEntry[];
    blocks?: RawBlock[];
  };
  const size = (root.size ?? [0, 0, 0]) as [number, number, number];
  return buildStructureData(filePath, size, root.palette ?? [], root.blocks ?? []);
}

function normalizeProps(
  props: Record<string, string | number> | undefined,
): Record<string, string> {
  const out: Record<string, string> = {};
  if (props) for (const [k, v] of Object.entries(props)) out[k] = String(v);
  return out;
}
