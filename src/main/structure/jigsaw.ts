// Extracts jigsaw connectors from a parsed structure. A jigsaw is an ordinary
// block (so its `orientation` is a normal blockstate property) plus a block
// entity that carries the connection data (`name`/`target`/`pool`/…). That
// block-entity NBT is what `load-structure` otherwise discards, so this is the
// one place that reads it.
import type { JigsawConnector, JigsawJoint } from '@/shared/types';

const JIGSAW_BLOCK = 'minecraft:jigsaw';

/** Raw palette entry as produced by `nbt.simplify`. */
interface RawPaletteEntry {
  Name: string;
  Properties?: Record<string, string | number>;
}

/** Raw block as produced by `nbt.simplify`, including its block-entity NBT. */
interface RawBlock {
  state: number;
  pos: [number, number, number];
  nbt?: Record<string, unknown>;
}

function str(v: unknown, fallback = ''): string {
  return typeof v === 'string' ? v : fallback;
}

function num(v: unknown): number {
  return typeof v === 'number' ? v : 0;
}

function joint(v: unknown): JigsawJoint {
  return v === 'rollable' ? 'rollable' : 'aligned';
}

/** Collect every jigsaw block in a structure as a connector. Vanilla writes the
 *  block-entity `id` as "minecraft:jigsaw"; we also accept the palette name so a
 *  jigsaw with no extra NBT is still picked up. */
export function extractJigsaws(palette: RawPaletteEntry[], blocks: RawBlock[]): JigsawConnector[] {
  const out: JigsawConnector[] = [];
  for (const block of blocks) {
    const entry = palette[block.state];
    const isJigsaw = entry?.Name === JIGSAW_BLOCK || block.nbt?.id === JIGSAW_BLOCK;
    if (!isJigsaw || !block.pos) continue;

    const nbt = block.nbt ?? {};
    out.push({
      pos: block.pos,
      name: str(nbt.name),
      target: str(nbt.target),
      pool: str(nbt.pool),
      finalState: str(nbt.final_state, 'minecraft:air'),
      joint: joint(nbt.joint),
      orientation: str(entry?.Properties?.orientation, 'north_up'),
      selectionPriority: num(nbt.selection_priority),
      placementPriority: num(nbt.placement_priority),
    });
  }
  return out;
}
