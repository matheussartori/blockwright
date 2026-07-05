// The pure structure-diff core: compare two structures cell by cell and classify every
// difference as added / removed / changed (identical cells are counted, not listed). No
// tool in the ecosystem does file-vs-file visual diff — this is the data layer behind the
// viewer's diff overlay and the summary panel; it knows nothing about Three.js or IPC.
//
// A cell is "occupied" when it holds a NON-air palette entry (explicit `minecraft:air` /
// `minecraft:structure_void` count as empty — they're the absence of geometry, and calling
// every captured-air cell "removed" would drown the real differences). Two occupied cells
// match when their block NAME and PROPERTIES are identical (a stair that changed facing is
// `changed`, exactly what naive string-replace re-themers get wrong).
import type { PaletteEntry, StructureData } from '@/shared/types';

export type DiffKind = 'added' | 'removed' | 'changed';

/** One differing cell: its "x,y,z" key (in A's coordinate space) + how it differs. */
export interface DiffCellMark {
  key: string;
  kind: DiffKind;
}

/** Per-block-name rollup of the differences (the palette-level summary). */
export interface BlockDelta {
  name: string;
  added: number;
  removed: number;
  changed: number;
}

export interface StructureDiff {
  /** Every differing cell, for the viewer overlay. */
  cells: DiffCellMark[];
  added: number;
  removed: number;
  changed: number;
  /** Cells occupied identically in both (the dimmed/ghosted rest). */
  same: number;
  /** Differences grouped by block name, biggest movers first. A `changed` cell counts
   *  once, under the NEW (B) block's name. */
  byBlock: BlockDelta[];
}

/** The minimal slice of a structure the diff needs (StructureData satisfies it). */
export interface DiffInput {
  size: [number, number, number];
  palette: PaletteEntry[];
  blocks: StructureData['blocks'];
}

/** A canonical "name|props" signature so property order can't fake a difference. */
function signature(entry: PaletteEntry): string {
  const props = entry.properties ?? {};
  const keys = Object.keys(props).sort();
  return `${entry.name}|${keys.map((k) => `${k}=${props[k]}`).join(',')}`;
}

/** Map of occupied cells: "x,y,z" → {signature, name}. Air-like entries are skipped. */
function occupied(s: DiffInput, offset: [number, number, number]): Map<string, { sig: string; name: string }> {
  const out = new Map<string, { sig: string; name: string }>();
  for (const b of s.blocks) {
    const entry = s.palette[b.state];
    if (!entry || entry.air) continue;
    const key = `${b.pos[0] + offset[0]},${b.pos[1] + offset[1]},${b.pos[2] + offset[2]}`;
    out.set(key, { sig: signature(entry), name: entry.name });
  }
  return out;
}

/**
 * Diff two structures cell by cell.
 *
 * @param a The BASE structure (its coordinate space anchors the result).
 * @param b The compared structure.
 * @param offset Where B's origin sits in A's space (anchor alignment; default = shared origin).
 * @returns The differing cells + counts + a per-block rollup. Sizes may differ freely —
 *   cells outside either box simply read as empty on that side.
 */
export function diffStructures(a: DiffInput, b: DiffInput, offset: [number, number, number] = [0, 0, 0]): StructureDiff {
  const cellsA = occupied(a, [0, 0, 0]);
  const cellsB = occupied(b, offset);

  const cells: DiffCellMark[] = [];
  const deltas = new Map<string, BlockDelta>();
  const counts: Record<DiffKind, number> = { added: 0, removed: 0, changed: 0 };
  const mark = (key: string, kind: DiffKind, name: string) => {
    cells.push({ key, kind });
    counts[kind]++;
    const d = deltas.get(name) ?? { name, added: 0, removed: 0, changed: 0 };
    d[kind]++;
    deltas.set(name, d);
  };

  let same = 0;
  for (const [key, av] of cellsA) {
    const bv = cellsB.get(key);
    if (!bv) mark(key, 'removed', av.name);
    else if (bv.sig !== av.sig) mark(key, 'changed', bv.name);
    else same++;
  }
  for (const [key, bv] of cellsB) {
    if (!cellsA.has(key)) mark(key, 'added', bv.name);
  }

  const byBlock = [...deltas.values()].sort(
    (x, y) => y.added + y.removed + y.changed - (x.added + x.removed + x.changed) || x.name.localeCompare(y.name),
  );
  return { cells, ...counts, same, byBlock };
}
