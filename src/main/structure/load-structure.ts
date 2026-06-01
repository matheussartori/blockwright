// Reads and parses Minecraft `.nbt` structure files into renderable data.
import fs from 'node:fs/promises';
import path from 'node:path';
import * as nbt from 'prismarine-nbt';
import type { JigsawConnector, PaletteEntry, StructureData } from '@/shared/types';
import { getActiveWorkspace, hasContent } from './content-pack';
import { collectTextures } from './model-loader';
import { isAir, resolveBlock } from './blockstate-resolver';
import { fallbackColor } from './fallback-color';
import { extractJigsaws } from './jigsaw';

interface RawPaletteEntry {
  Name: string;
  Properties?: Record<string, string | number>;
}
interface RawBlock {
  state: number;
  pos: [number, number, number];
  /** Block-entity NBT (chests, jigsaws, …) — preserved for jigsaw extraction. */
  nbt?: Record<string, unknown>;
}

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

/** Parse a structure NBT file at `filePath` into a fully resolved StructureData. */
export async function loadStructure(filePath: string): Promise<StructureData> {
  const buffer = await fs.readFile(filePath);
  const { parsed } = await nbt.parse(buffer);
  const root = nbt.simplify(parsed) as {
    size?: number[];
    palette?: RawPaletteEntry[];
    blocks?: RawBlock[];
  };

  const rawPalette = root.palette ?? [];
  const rawBlocks = root.blocks ?? [];

  const withContent = hasContent();
  // Resolve models if the vanilla pack is present or a mod workspace is open
  // (workspace structures reference both mod and vanilla blocks).
  const canResolve = withContent || getActiveWorkspace() !== null;
  const size = (root.size ?? [0, 0, 0]) as [number, number, number];

  const palette: PaletteEntry[] = rawPalette.map((raw) => {
    const properties = normalizeProps(raw.Properties);
    const air = isAir(raw.Name);
    const models = !air && canResolve ? resolveBlock(raw.Name, properties) : [];
    return {
      name: raw.Name,
      properties,
      models,
      color: fallbackColor(raw.Name),
      air,
    };
  });

  const blocks = rawBlocks
    .filter((b) => b.pos && typeof b.state === 'number')
    .map((b) => ({ state: b.state, pos: b.pos as [number, number, number] }));

  const jigsaws = extractJigsaws(rawPalette, rawBlocks);

  const blockCount = blocks.filter((b) => !palette[b.state]?.air).length;

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
    blockCount,
    jigsaws,
  };
}

function normalizeProps(
  props: Record<string, string | number> | undefined,
): Record<string, string> {
  const out: Record<string, string> = {};
  if (props) for (const [k, v] of Object.entries(props)) out[k] = String(v);
  return out;
}
