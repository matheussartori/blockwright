// Convert a structure between formats for the "Export As…" Save dialog. `.nbt` → `.nbt`
// is a plain copy (lossless — keeps block entities); anything else round-trips through the
// shared raw {size, palette, blocks} shape: `.nbt`/`.schem` in, `.nbt`/`.schem` out.
import fs from 'node:fs/promises';
import { decodeSchem, encodeSchem, omitKeys, type RawBlockEntity, type RawStructure } from './schematic';
import { decodeLitematic, encodeLitematic } from './litematica';
import { readAuthoring } from '../authoring/nbt-decode';
import { encodeStructure } from '../authoring/nbt-encode';

const DEFAULT_DATA_VERSION = 3955;
type Format = 'nbt' | 'schem' | 'litematic';
const formatOf = (p: string): Format => {
  const l = p.toLowerCase();
  return l.endsWith('.schem') ? 'schem' : l.endsWith('.litematic') ? 'litematic' : 'nbt';
};

/** Read a structure file (`.nbt`, `.schem`, or `.litematic`) into raw {size, palette, blocks}. */
export async function readRaw(filePath: string): Promise<RawStructure> {
  const fmt = formatOf(filePath);
  if (fmt === 'schem') return decodeSchem(await fs.readFile(filePath));
  if (fmt === 'litematic') return decodeLitematic(await fs.readFile(filePath));
  const a = await readAuthoring(filePath);
  const palette = (a.palette ?? []).map((p) => ({ Name: p.Name, Properties: p.Properties as Record<string, string> | undefined }));
  const blockEntities: RawBlockEntity[] = [];
  for (const b of a.blocks ?? []) {
    if (b.nbt && Object.keys(b.nbt).length) {
      blockEntities.push({
        pos: b.pos as [number, number, number],
        id: String((b.nbt as Record<string, unknown>).id ?? palette[b.state]?.Name ?? ''),
        nbt: omitKeys(b.nbt as Record<string, unknown>, ['id', 'x', 'y', 'z']),
      });
    }
  }
  return {
    size: (a.size ?? [0, 0, 0]) as [number, number, number],
    palette,
    blocks: (a.blocks ?? []).map((b) => ({ state: b.state, pos: b.pos as [number, number, number] })),
    blockEntities,
  };
}

/** Write `src` to `dest`, choosing the encoding from the destination's extension. */
export async function convertStructure(srcPath: string, destPath: string): Promise<void> {
  const dest = formatOf(destPath);
  // .nbt → .nbt: a plain copy keeps everything (block entities, entities) intact.
  if (dest === 'nbt' && formatOf(srcPath) === 'nbt') {
    await fs.copyFile(srcPath, destPath);
    return;
  }
  const raw = await readRaw(srcPath);
  if (dest === 'schem') {
    await fs.writeFile(destPath, encodeSchem(raw));
    return;
  }
  if (dest === 'litematic') {
    await fs.writeFile(destPath, encodeLitematic(raw, Date.now()));
    return;
  }
  // any → .nbt — re-attach block entities to their block by position.
  const beByPos = new Map((raw.blockEntities ?? []).map((be) => [be.pos.join(','), be]));
  await fs.writeFile(
    destPath,
    encodeStructure({
      dataVersion: DEFAULT_DATA_VERSION,
      size: raw.size,
      palette: raw.palette.map((p) => ({ Name: p.Name, Properties: p.Properties })),
      blocks: raw.blocks.map((b) => {
        const be = beByPos.get(b.pos.join(','));
        return be ? { state: b.state, pos: b.pos, nbt: { id: be.id, ...be.nbt } } : { state: b.state, pos: b.pos };
      }),
      entities: [],
    }),
  );
}
