// Entity-chunk NBT patching for Place-into-World (§2.2 fidelity) — the `entities/` counterpart
// of chunk-patch.ts. Since 1.17 entities live in their OWN region set (`entities/r.*.mca`), one
// chunk record per column: `{ DataVersion, Position: [cx, cz], Entities: [...] }`. Same write
// rule as blocks: patch the tag-typed tree in place (existing entities ride through untouched),
// never rebuild from a projection. A column that never held entities has NO record (often no
// FILE) — `makeEntityChunkRoot` synthesizes the minimal root vanilla accepts.
import { randomBytes } from 'node:crypto';
import { inferEntityCompound } from '../../structure/authoring/nbt-encode';
import { MAX_KNOWN_DATA_VERSION } from './chunk-patch';
import {
  compoundItems,
  compoundListTag,
  compoundOf,
  compoundTag,
  doubleListTag,
  intArrayTag,
  intTag,
  numberOf,
  type Compound,
  type Tag,
} from './nbt-tree';

/** One entity to append: its absolute world position + the entity compound (must carry `id`). */
export interface EntityPlacement {
  pos: [number, number, number];
  nbt: Record<string, unknown>;
}

/** The edit gate for an ENTITY chunk: only the DataVersion ceiling applies (entity chunks have
 *  no `Status`/sections — they're just a list). Null when editable. */
export function entityChunkGate(root: Tag): string | null {
  const value = compoundOf(root);
  if (!value) return 'entity chunk NBT root is not a compound';
  const dv = numberOf(value.DataVersion);
  if (dv !== null && dv > MAX_KNOWN_DATA_VERSION) {
    return `entities DataVersion ${dv} is newer than this Blockwright knows — refusing to write`;
  }
  return null;
}

/** The minimal entity-chunk root vanilla loads: DataVersion + Position + an empty Entities
 *  list. `dataVersion` should be the BLOCK chunk's (the two sets stay in step). */
export function makeEntityChunkRoot(cx: number, cz: number, dataVersion: number): Tag {
  return compoundTag({
    DataVersion: intTag(dataVersion),
    Position: intArrayTag([cx, cz]),
    Entities: compoundListTag([]),
  });
}

/**
 * Append placed entities to one entity chunk's tag-typed NBT tree, IN PLACE. Existing entities
 * are untouched (a paste adds, never replaces — clearing mobs is not a block edit's business).
 *
 * @param root       The parsed (or synthesized) entity-chunk root tag (mutated).
 * @param placements Entities whose positions all fall inside this chunk column.
 */
export function patchEntityChunk(root: Tag, placements: EntityPlacement[]): void {
  const value = compoundOf(root);
  if (!value) throw new Error('entity chunk NBT root is not a compound');
  const entities = compoundItems(value.Entities);
  for (const p of placements) entities.push(entityRecord(p));
  value.Entities = compoundListTag(entities);
}

/** A fresh v4 UUID as the 4 signed int32s Minecraft's IntArray UUID form wants. */
function randomUuidInts(): number[] {
  const bytes = randomBytes(16);
  bytes[6] = (bytes[6] & 0x0f) | 0x40; // version 4
  bytes[8] = (bytes[8] & 0x3f) | 0x80; // IETF variant
  return [0, 4, 8, 12].map((i) => bytes.readInt32BE(i));
}

/**
 * Build one entity compound from a placement: the source NBT re-typed via the authoring
 * inference (`inferEntityCompound` stamps the exact-typed `Rotation`/`Motion` lists), with
 * `Pos` from the placement position, a REGENERATED `UUID` (a pasted copy must never duplicate
 * one), and the hanging entities' `TileX/Y/Z` re-anchored to the final position (best-effort —
 * vanilla re-derives them on load via `moveTo`, but a region-file write has no game to do that).
 */
function entityRecord(p: EntityPlacement): Compound {
  if (typeof p.nbt.id !== 'string') throw new Error('placed entity has no id');
  const source = Object.fromEntries(Object.entries(p.nbt).filter(([k]) => !['Pos', 'UUID'].includes(k)));
  const record = inferEntityCompound(source).value as Compound;
  record.Pos = doubleListTag(p.pos);
  record.UUID = intArrayTag(randomUuidInts());
  if (typeof p.nbt.TileX === 'number') {
    record.TileX = intTag(Math.floor(p.pos[0]));
    record.TileY = intTag(Math.floor(p.pos[1]));
    record.TileZ = intTag(Math.floor(p.pos[2]));
  }
  return record;
}
