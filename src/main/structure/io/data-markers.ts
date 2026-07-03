// Extracts data-mode structure blocks from a parsed structure. A data marker is an
// ordinary structure block set to Data mode whose block-entity `metadata` string is
// the payload a mod reads at placement time (spawn/trigger hooks etc.). Like the
// jigsaw extraction, this is read here because `load-structure` otherwise drops the
// block-entity NBT before StructureData crosses to the renderer.
import type { DataMarker } from '@/shared/types';
import type { RawBlock, RawPaletteEntry } from './raw';

const STRUCTURE_BLOCK = 'minecraft:structure_block';

/** True when the block is a structure block in Data mode — the blockstate property is
 *  lowercase ("data") while the block entity stores it uppercase ("DATA"). */
function isDataMode(entry: RawPaletteEntry | undefined, nbt: Record<string, unknown>): boolean {
  const isStructureBlock = entry?.Name === STRUCTURE_BLOCK || nbt.id === STRUCTURE_BLOCK;
  if (!isStructureBlock) return false;
  const mode = nbt.mode ?? entry?.Properties?.mode;
  return typeof mode === 'string' && mode.toLowerCase() === 'data';
}

/** Collect every data-mode structure block that carries a metadata string. Markers with
 *  an empty `metadata` are skipped — there is nothing to show or copy. */
export function extractDataMarkers(palette: RawPaletteEntry[], blocks: RawBlock[]): DataMarker[] {
  const out: DataMarker[] = [];
  for (const block of blocks) {
    if (!block.pos) continue;
    const nbt = block.nbt ?? {};
    if (!isDataMode(palette[block.state], nbt)) continue;
    if (typeof nbt.metadata !== 'string' || nbt.metadata === '') continue;
    out.push({ pos: block.pos, data: nbt.metadata });
  }
  return out;
}
