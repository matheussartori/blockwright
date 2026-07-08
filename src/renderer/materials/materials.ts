// The Bill of Materials behind the Materials panel: roll a structure's blocks up
// into gatherable ITEM counts (state-aware — all oak_stairs states are one row),
// with stack + shulker-box math, entities included, and CSV/JSON serializers for
// the export. Pure (no React/IO) so the rollup rules are unit-testable.
//
// Rollup rules (each one a documented Minecraft item/block mismatch):
//  • air-like palette entries (air / structure_void) are not materials;
//  • purely technical blocks that have no item form are skipped (piston_head,
//    portal interiors, fire, bubble columns);
//  • multi-cell blocks count ONCE per item: a door/tall-plant `half=upper` and a
//    bed `part=head` are the free second cell of the base block;
//  • a double slab (`type=double`) is TWO slab items in one cell;
//  • stacked-in-place blocks (`candles`/`pickles`/`eggs`/`layers`) count their
//    live amount;
//  • source water/lava (`level=0` or no level) tallies as its bucket (stack 1);
//    flowing cells are free;
//  • stack size is 64 except signs/banners (16) and shulker boxes/buckets (1).
import type { StructureData } from '@/shared/types';

export interface MaterialRow {
  /** The gatherable item id (namespaced), e.g. `minecraft:oak_stairs`. */
  id: string;
  count: number;
  stackSize: number;
  /** Whole stacks + the loose remainder (`count = stacks·stackSize + remainder`). */
  stacks: number;
  remainder: number;
  /** Shulker boxes needed to carry it all (27 stacks each); 0 when it fits a stack. */
  shulkers: number;
  /** A representative palette index for the row's swatch, -1 for synthesized ids
   *  (water/lava buckets) with no palette entry of their own. */
  paletteState: number;
}

export interface EntityRow {
  id: string;
  count: number;
}

export interface MaterialList {
  blocks: MaterialRow[];
  entities: EntityRow[];
  /** Total item count across all block rows. */
  totalItems: number;
}

/** Blocks with no item form — placed by mechanics, never gathered. */
const NON_ITEM = new Set([
  'minecraft:piston_head',
  'minecraft:moving_piston',
  'minecraft:nether_portal',
  'minecraft:end_portal',
  'minecraft:end_gateway',
  'minecraft:fire',
  'minecraft:soul_fire',
  'minecraft:frosted_ice',
  'minecraft:bubble_column',
]);

/** Props whose value IS the item count of the cell (candles, sea pickles, …). */
const COUNT_PROPS = ['candles', 'pickles', 'eggs', 'layers'] as const;

function stackSizeFor(id: string): number {
  if (id.includes('shulker_box') || id.endsWith('_bucket')) return 1;
  if (id.endsWith('_sign') || id.endsWith('_banner')) return 16;
  return 64;
}

/** The item(s) a placed block cell costs, or null when the cell is free
 *  (technical block / the second half of a multi-cell block / flowing fluid). */
function itemForCell(name: string, props: Record<string, string> | undefined): { id: string; count: number } | null {
  if (NON_ITEM.has(name)) return null;
  // The free second cell of doors/tall plants (half=upper) and beds (part=head).
  if (props?.half === 'upper' || props?.part === 'head') return null;
  if (name === 'minecraft:water' || name === 'minecraft:lava') {
    // Only a SOURCE cell costs a bucket; flowing cells fill in on their own.
    if (props?.level !== undefined && props.level !== '0') return null;
    return { id: `${name}_bucket`, count: 1 };
  }
  if (props?.type === 'double' && name.endsWith('_slab')) return { id: name, count: 2 };
  for (const key of COUNT_PROPS) {
    const v = props?.[key];
    if (v !== undefined) {
      const n = Number.parseInt(v, 10);
      return { id: name, count: Number.isFinite(n) && n > 0 ? n : 1 };
    }
  }
  return { id: name, count: 1 };
}

/** Roll the structure's blocks + entities up into the Bill of Materials,
 *  sorted by count (desc) then id. */
export function buildMaterialList(data: StructureData): MaterialList {
  const rows = new Map<string, MaterialRow>();
  for (const b of data.blocks) {
    const entry = data.palette[b.state];
    if (!entry || entry.air) continue;
    const item = itemForCell(entry.name, entry.properties);
    if (!item) continue;
    let row = rows.get(item.id);
    if (!row) {
      row = { id: item.id, count: 0, stackSize: stackSizeFor(item.id), stacks: 0, remainder: 0, shulkers: 0, paletteState: item.id === entry.name ? b.state : -1 };
      rows.set(item.id, row);
    }
    row.count += item.count;
  }
  for (const row of rows.values()) {
    row.stacks = Math.floor(row.count / row.stackSize);
    row.remainder = row.count % row.stackSize;
    row.shulkers = row.count > row.stackSize ? Math.ceil(row.count / (row.stackSize * 27)) : 0;
  }

  const entities = new Map<string, EntityRow>();
  for (const e of data.entities ?? []) {
    const row = entities.get(e.id) ?? { id: e.id, count: 0 };
    row.count += 1;
    entities.set(e.id, row);
  }

  const byCount = <T extends { count: number; id: string }>(a: T, b: T) =>
    b.count - a.count || a.id.localeCompare(b.id);
  const blocks = [...rows.values()].sort(byCount);
  return {
    blocks,
    entities: [...entities.values()].sort(byCount),
    totalItems: blocks.reduce((sum, r) => sum + r.count, 0),
  };
}

/** Machine-readable CSV (the Litematica #1084 ask): one row per material,
 *  entities appended with `entity` type rows. */
export function materialsToCsv(list: MaterialList): string {
  const lines = ['type,id,count,stack_size,stacks,remainder,shulker_boxes'];
  for (const r of list.blocks) {
    lines.push(`block,${r.id},${r.count},${r.stackSize},${r.stacks},${r.remainder},${r.shulkers}`);
  }
  for (const e of list.entities) {
    lines.push(`entity,${e.id},${e.count},,,,`);
  }
  return lines.join('\n') + '\n';
}

/** JSON export: the list plus the structure's identity (name/size) for tooling. */
export function materialsToJson(list: MaterialList, meta: { name: string; size: [number, number, number] }): string {
  const payload = {
    name: meta.name,
    size: meta.size,
    totalItems: list.totalItems,
    blocks: list.blocks.map((r) => ({
      id: r.id,
      count: r.count,
      stackSize: r.stackSize,
      stacks: r.stacks,
      remainder: r.remainder,
      shulkers: r.shulkers,
    })),
    entities: list.entities,
  };
  return JSON.stringify(payload, null, 2) + '\n';
}
