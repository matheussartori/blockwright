// The format-neutral intermediate every structure codec speaks: a `{size, palette, blocks,
// blockEntities?}` shape that `.nbt`, `.schem` and `.litematic` all decode to and encode from,
// so each renders/edits/converts identically. Kept in its own neutral module (not inside any
// one codec) so no codec owns the shared contract.

export interface RawPaletteEntry {
  Name: string;
  Properties?: Record<string, string | number>;
}

export interface RawBlock {
  state: number;
  pos: [number, number, number];
  /** Block-entity NBT (chests, jigsaws, …) — preserved for jigsaw extraction. */
  nbt?: Record<string, unknown>;
}

/** A block entity (chest contents, sign text, …) at a structure-local position. `nbt` is the
 *  data fields only — `id` (the block-entity type) and the position are kept separate. */
export interface RawBlockEntity {
  pos: [number, number, number];
  id: string;
  nbt: Record<string, unknown>;
}

/** A structure entity (armor stand, item frame, mob, …): a precise `pos` plus the `blockPos`
 *  it sits in (used to partition entities by piece on a split) and its raw NBT. */
export interface RawEntity {
  pos: [number, number, number];
  blockPos: [number, number, number];
  nbt: Record<string, unknown>;
}

export interface RawStructure {
  size: [number, number, number];
  palette: RawPaletteEntry[];
  blocks: RawBlock[];
  /** Block-entity data preserved through conversions (absent = none carried). */
  blockEntities?: RawBlockEntity[];
  /** Entities preserved through conversions (absent = none carried). */
  entities?: RawEntity[];
}

/** Drop the given keys from a plain object (the BE id/position live separately). */
export const omitKeys = (obj: Record<string, unknown>, keys: string[]): Record<string, unknown> =>
  Object.fromEntries(Object.entries(obj).filter(([k]) => !keys.includes(k)));

export const AIR = 'minecraft:air';

/** Build a block-state string from {Name, Properties} (keys sorted for clean round-trips).
 *  The canonical key for palette dedup across every codec. */
export function blockStateString(entry: RawPaletteEntry): string {
  const props = entry.Properties;
  if (!props || !Object.keys(props).length) return entry.Name;
  const inner = Object.keys(props)
    .sort()
    .map((k) => `${k}=${props[k]}`)
    .join(',');
  return `${entry.Name}[${inner}]`;
}
