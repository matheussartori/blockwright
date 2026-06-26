// Reassemble a split jigsaw assembly back into ONE structure — the inverse of
// split-structure.ts. The split cuts a structure into disjoint grid slots, each ≤ the
// Structure Block limit, replacing the ≤2 seam cells per tree edge with a `minecraft:jigsaw`
// connector whose `final_state` is the original block. So stitching back is exact:
//   • place every piece at its slot origin (a deterministic function of size+limit), and
//   • where a cell holds a jigsaw connector, restore its `final_state`.
// The slots tile the whole volume with no overlap, so each original cell is restored once.
//
// This also handles pieces with NO connectors (e.g. regions a player re-saved from the world
// with structure blocks) — those are placed verbatim — so the same merge backs both the
// "Open Jigsaw Assembly" and the "Reimport from World" flows.
import { pieceName, splitPlan, type SplitManifest, type Vec3 } from '@/shared/domain/split';
import { AIR, blockStateString, type RawBlockEntity, type RawPaletteEntry, type RawStructure } from './raw';
import { parseBlockState } from './schematic';
import { readRaw } from './convert';
import { encodeStructure } from '../authoring/nbt-encode';

const JIGSAW = 'minecraft:jigsaw';
const posKey = (p: Vec3): string => `${p[0]},${p[1]},${p[2]}`;

/** One decoded piece paired with the slot origin it occupies in the original structure. */
export interface PlacedPiece {
  origin: Vec3;
  raw: RawStructure;
}

/**
 * Stitch decoded pieces back into one structure (PURE — no IO).
 *
 * @param pieces - Each piece's decoded `RawStructure` plus the slot origin it tiles.
 * @param size - The original structure size (from the manifest).
 * @returns The reassembled structure. Jigsaw connector cells are replaced by their
 *   `final_state`; a connector whose final state is air leaves the cell empty.
 */
export function mergeFromPieces(pieces: PlacedPiece[], size: Vec3): RawStructure {
  // Resolved cells keyed by world position. Disjoint slots → no collisions.
  const cells = new Map<string, { entry: RawPaletteEntry; be?: RawBlockEntity }>();
  const entities: RawStructure['entities'] = [];

  for (const { origin, raw } of pieces) {
    const beByPos = new Map((raw.blockEntities ?? []).map((be) => [posKey(be.pos), be]));
    for (const b of raw.blocks) {
      const entry = raw.palette[b.state];
      if (!entry) continue;
      const world: Vec3 = [origin[0] + b.pos[0], origin[1] + b.pos[1], origin[2] + b.pos[2]];
      const be = beByPos.get(posKey(b.pos));
      if (entry.Name === JIGSAW) {
        // Restore the original block the connector stands in for.
        const fs = be?.nbt?.final_state;
        const restored = parseBlockState(typeof fs === 'string' && fs ? fs : AIR);
        if (restored.Name === AIR) continue; // the cell was air/omitted in the source
        cells.set(posKey(world), { entry: restored });
      } else {
        cells.set(posKey(world), { entry, be: be && be.id !== JIGSAW ? be : undefined });
      }
    }
    for (const e of raw.entities ?? []) {
      entities.push({
        pos: [e.pos[0] + origin[0], e.pos[1] + origin[1], e.pos[2] + origin[2]],
        blockPos: [e.blockPos[0] + origin[0], e.blockPos[1] + origin[1], e.blockPos[2] + origin[2]],
        nbt: e.nbt,
      });
    }
  }

  // Intern a fresh palette + flat block list from the resolved cells.
  const palette: RawPaletteEntry[] = [];
  const paletteIndex = new Map<string, number>();
  const intern = (entry: RawPaletteEntry): number => {
    const k = blockStateString(entry);
    let idx = paletteIndex.get(k);
    if (idx === undefined) {
      idx = palette.length;
      palette.push(entry);
      paletteIndex.set(k, idx);
    }
    return idx;
  };

  const blocks: RawStructure['blocks'] = [];
  const blockEntities: RawBlockEntity[] = [];
  for (const [k, { entry, be }] of cells) {
    const pos = k.split(',').map(Number) as Vec3;
    blocks.push({ state: intern(entry), pos });
    if (be) blockEntities.push({ pos, id: be.id, nbt: be.nbt });
  }

  return { size, palette, blocks, blockEntities, entities };
}

/**
 * Read the piece `.nbt` files named by a manifest and stitch them back together.
 *
 * @param manifest - The split's recorded `size`/`limit`/`base` (recomputes the slot grid).
 * @param findPiece - Resolves a canonical piece name (`p_i_j_k`) to its `.nbt` path, or
 *   null when that piece is missing on disk.
 * @returns The reassembled structure plus the names of any pieces that couldn't be found
 *   (a non-empty `missing` means the result has holes — the caller decides whether to warn).
 */
export async function reassemble(
  manifest: SplitManifest,
  findPiece: (name: string) => string | null,
): Promise<{ raw: RawStructure; missing: string[] }> {
  const plan = splitPlan(manifest.size, manifest.limit);
  const pieces: PlacedPiece[] = [];
  const missing: string[] = [];
  for (const slot of plan.slots) {
    const name = pieceName(slot);
    const file = findPiece(name);
    if (!file) {
      missing.push(name);
      continue;
    }
    pieces.push({ origin: slot.min, raw: await readRaw(file) });
  }
  return { raw: mergeFromPieces(pieces, manifest.size), missing };
}

/** Encode a reassembled structure to a gzipped `.nbt` buffer, re-attaching block entities
 *  to their block by position (the encoder takes the BE on the block, like convert.ts). */
export function encodeMergedNbt(raw: RawStructure, dataVersion: number): Buffer {
  const beByPos = new Map((raw.blockEntities ?? []).map((be) => [posKey(be.pos), be]));
  return encodeStructure({
    dataVersion,
    size: raw.size,
    palette: raw.palette.map((p) => ({ Name: p.Name, Properties: p.Properties })),
    blocks: raw.blocks.map((b) => {
      const be = beByPos.get(posKey(b.pos));
      return be ? { state: b.state, pos: b.pos, nbt: { id: be.id, ...be.nbt } } : { state: b.state, pos: b.pos };
    }),
    entities: (raw.entities ?? []).map((e) => ({
      pos: e.pos,
      blockPos: e.blockPos,
      ...(Object.keys(e.nbt).length ? { nbt: e.nbt } : {}),
    })),
  });
}
