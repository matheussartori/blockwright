// Reads and parses Minecraft `.nbt` structure files into renderable data.
import fs from 'node:fs/promises';
import path from 'node:path';
import * as nbt from 'prismarine-nbt';
import type { PaletteEntry, StructureData } from '@/shared/types';
import { hasContent } from './content-pack';
import { collectTextures } from './model-loader';
import { isAir, resolveBlock } from './blockstate-resolver';
import { fallbackColor } from './fallback-color';

interface RawPaletteEntry {
  Name: string;
  Properties?: Record<string, string | number>;
}
interface RawBlock {
  state: number;
  pos: [number, number, number];
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

  const withContent = hasContent();
  const size = (root.size ?? [0, 0, 0]) as [number, number, number];

  const palette: PaletteEntry[] = (root.palette ?? []).map((raw) => {
    const properties = normalizeProps(raw.Properties);
    const air = isAir(raw.Name);
    const models = !air && withContent ? resolveBlock(raw.Name, properties) : [];
    return {
      name: raw.Name,
      properties,
      models,
      color: fallbackColor(raw.Name),
      air,
    };
  });

  const blocks = (root.blocks ?? [])
    .filter((b) => b.pos && typeof b.state === 'number')
    .map((b) => ({ state: b.state, pos: b.pos as [number, number, number] }));

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
  };
}

function normalizeProps(
  props: Record<string, string | number> | undefined,
): Record<string, string> {
  const out: Record<string, string> = {};
  if (props) for (const [k, v] of Object.entries(props)) out[k] = String(v);
  return out;
}
