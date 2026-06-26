// Cut a structure into CLEAN grid pieces (each ≤ the Structure Block limit) — no jigsaw
// connectors, just the raw geometry of each slot rebased to local coords. Unlike the jigsaw
// split (split-structure.ts), these pieces are what a player LOADS, edits, and re-SAVES with
// vanilla structure blocks; reassembly stitches the edited pieces back by the manifest grid
// (merge-structure.ts), so the pieces never need to carry reconnection data.
import { pieceName, type SplitPlan, type SplitSlot, type Vec3 } from '@/shared/domain/split';
import { blockStateString, type RawBlockEntity, type RawStructure } from './raw';
import type { AuthoringBlock, AuthoringEntity, AuthoringPaletteEntry } from '../authoring/types';
import { encodeStructure, type EncodeInput } from '../authoring/nbt-encode';

const posKey = (x: number, y: number, z: number): string => `${x},${y},${z}`;

/** One clean piece: its canonical name + the encoded `.nbt` buffer. */
export interface CleanPiece {
  name: string;
  slot: SplitSlot;
  buffer: Buffer;
}

/** Slice one slot into a self-contained `EncodeInput` (rebased blocks + block entities +
 *  entities), interning a per-piece palette. */
function slicePiece(raw: RawStructure, slot: SplitSlot, dataVersion: number): EncodeInput {
  const [mx, my, mz] = slot.min;
  const [sx, sy, sz] = slot.size;
  const beByPos = new Map((raw.blockEntities ?? []).map((be) => [posKey(be.pos[0], be.pos[1], be.pos[2]), be] as const));

  const palette: AuthoringPaletteEntry[] = [];
  const paletteIndex = new Map<string, number>();
  const intern = (entry: AuthoringPaletteEntry): number => {
    const k = blockStateString(entry as { Name: string; Properties?: Record<string, string | number> });
    let idx = paletteIndex.get(k);
    if (idx === undefined) {
      idx = palette.length;
      palette.push(entry);
      paletteIndex.set(k, idx);
    }
    return idx;
  };

  const blocks: AuthoringBlock[] = [];
  for (const b of raw.blocks) {
    const [x, y, z] = b.pos;
    if (x < mx || x >= mx + sx || y < my || y >= my + sy || z < mz || z >= mz + sz) continue;
    const state = intern(raw.palette[b.state]);
    const be = beByPos.get(posKey(x, y, z));
    const local: Vec3 = [x - mx, y - my, z - mz];
    blocks.push(be ? { state, pos: local, nbt: { id: be.id, ...(be as RawBlockEntity).nbt } } : { state, pos: local });
  }

  const entities: AuthoringEntity[] = [];
  for (const e of raw.entities ?? []) {
    const [bx, by, bz] = e.blockPos;
    if (bx < mx || bx >= mx + sx || by < my || by >= my + sy || bz < mz || bz >= mz + sz) continue;
    entities.push({
      pos: [e.pos[0] - mx, e.pos[1] - my, e.pos[2] - mz],
      blockPos: [bx - mx, by - my, bz - mz],
      ...(e.nbt && Object.keys(e.nbt).length > 0 ? { nbt: e.nbt } : {}),
    });
  }

  return { dataVersion, size: slot.size, palette, blocks, entities };
}

/** Slice a structure into clean, connector-free pieces — one per grid slot. */
export function sliceCleanPieces(raw: RawStructure, plan: SplitPlan, dataVersion: number): CleanPiece[] {
  return plan.slots.map((slot) => ({ name: pieceName(slot), slot, buffer: encodeStructure(slicePiece(raw, slot, dataVersion)) }));
}
