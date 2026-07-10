// Magic select over the STREAMED WORLD (v2.3 §1.1) — the contiguous same-block region
// from a picked cell, read through a callback into the resident chunk payloads (the
// world has no EditData). Pure except for that injected read, so the flood itself is
// unit-tested. 6-connected like the structure editor's, and capped: a grass plain is one
// contiguous region of thousands — the cap keeps the pick, the overlay and the fill sane.
import { sameFamily } from '@/shared/domain/block-family';
import type { MatchMode } from '../editor/ops';
import type { BlockState } from './blend';
import { AIR } from './edit-overlay';

/** Hard cap on a world magic selection (also the overlay instance budget). */
export const WORLD_MAGIC_CAP = 4096;

export interface WorldMagicRegion {
  cells: [number, number, number][];
  /** The picked block's id (the panel readout). */
  block: string;
  /** True when the flood hit the cap — the region continues beyond what's selected. */
  truncated: boolean;
}

const NEIGHBORS: [number, number, number][] = [
  [1, 0, 0], [-1, 0, 0],
  [0, 1, 0], [0, -1, 0],
  [0, 0, 1], [0, 0, -1],
];

/**
 * Flood the contiguous region matching the block at `start` under `mode`.
 *
 * @param start   The picked world cell.
 * @param blockAt Reads a cell's state from resident data; null = unknown (chunk not
 *   streamed in) — the flood stops there, like it stops at a non-match.
 * @param mode    The tolerance: exact state / same block id / same material family.
 * @param cap     Region size cap (default {@link WORLD_MAGIC_CAP}).
 * @returns The region, or null when the start cell is unknown or air.
 */
export function worldMagicRegion(
  start: [number, number, number],
  blockAt: (x: number, y: number, z: number) => BlockState | null,
  mode: MatchMode,
  cap = WORLD_MAGIC_CAP,
): WorldMagicRegion | null {
  const target = blockAt(start[0], start[1], start[2]);
  if (!target || target.name === AIR) return null;
  const targetProps = JSON.stringify(target.properties ?? {});
  const matches = (s: BlockState | null): boolean => {
    if (!s || s.name === AIR) return false;
    if (mode === 'family') return sameFamily(s.name, target.name);
    if (s.name !== target.name) return false;
    return mode === 'block' || JSON.stringify(s.properties ?? {}) === targetProps;
  };
  const seen = new Set<string>();
  const cells: [number, number, number][] = [];
  const queue: [number, number, number][] = [start];
  let truncated = false;
  while (queue.length) {
    const c = queue.shift()!;
    const key = `${c[0]},${c[1]},${c[2]}`;
    if (seen.has(key)) continue;
    seen.add(key);
    if (!matches(blockAt(c[0], c[1], c[2]))) continue;
    if (cells.length >= cap) {
      truncated = true;
      break;
    }
    cells.push(c);
    for (const n of NEIGHBORS) queue.push([c[0] + n[0], c[1] + n[1], c[2] + n[2]]);
  }
  return { cells, block: target.name, truncated };
}
