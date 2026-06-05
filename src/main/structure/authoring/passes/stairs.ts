// Multi-storey finalizer: keep a staircase OFF the wall. The model routinely jams a
// flight flush against an outer wall / into a corner, leaving no standing room beside it
// to start the climb. This pass detects a real climbing flight pressed against the
// exterior shell and, when the interior side is clear, shifts the whole flight ONE block
// off the wall; when it can't do so safely (boxed in on both sides) it leaves the geometry
// alone and warns. Runs BEFORE `carveStairwells`, so the headroom/landing carve then
// applies to the flight's new position. Gated to storeyed structures by the compile
// pipeline (declared in each structure module's `finalize`).
//
// Conservative: it only ever moves a flight into cells that are currently EMPTY and not
// part of the shell, so it never overwrites a wall, furniture, or another stair.
import { posKey } from '../geometry';
import { computeEnvelope } from './envelope';
import { bareId, isAir } from '../palette';
import type { AuthoringBlock } from '../types';
import type { Pass } from './types';

const STAIR_DIR: Record<string, [number, number]> = {
  north: [0, -1], south: [0, 1], west: [-1, 0], east: [1, 0],
};

export const insetStairs: Pass = (blocks, palette) => {
  const at = new Map<string, AuthoringBlock>();
  for (const b of blocks) at.set(posKey(...b.pos), b);
  const nameOf = (s: number): string => palette[s]?.Name ?? '';
  const isBottomStair = (state: number): boolean => {
    const p = palette[state];
    if (!p || !bareId(p.Name).endsWith('_stairs')) return false;
    const half = p.Properties?.half;
    return half === undefined || half === 'bottom';
  };
  const facingOf = (state: number): string | undefined => {
    const f = palette[state]?.Properties?.facing;
    return typeof f === 'string' ? f : undefined;
  };
  const stairAt = (x: number, y: number, z: number, facing: string): boolean => {
    const b = at.get(posKey(x, y, z));
    return !!b && isBottomStair(b.state) && facingOf(b.state) === facing;
  };
  const present = (x: number, y: number, z: number): boolean => {
    const b = at.get(posKey(x, y, z));
    return !!b && !isAir(nameOf(b.state));
  };
  const { isShell } = computeEnvelope(blocks, palette);

  const removeKeys = new Set<string>();
  const moved = new Map<string, AuthoringBlock>();
  const visited = new Set<string>();
  let insets = 0;
  let blocked = 0;

  for (const b of blocks) {
    if (!isBottomStair(b.state)) continue;
    const facing = facingOf(b.state);
    if (!facing) continue;
    const dir = STAIR_DIR[facing];
    if (!dir) continue;
    const [fx, fz] = dir;
    const [x, y, z] = b.pos;
    if (stairAt(x - fx, y - 1, z - fz, facing)) continue; // only start from the bottom step

    // Walk the climbing chain up the ascent diagonal.
    const chain: AuthoringBlock[] = [];
    let cx = x, cy = y, cz = z;
    while (stairAt(cx, cy, cz, facing)) {
      chain.push(at.get(posKey(cx, cy, cz)) as AuthoringBlock);
      cx += fx; cy += 1; cz += fz;
    }
    if (chain.length < 2) continue; // a decorative single stair (chair/desk) — not a flight
    const startKey = posKey(...chain[0].pos);
    if (visited.has(startKey)) continue;
    visited.add(startKey);

    // Perpendicular axis (the flank direction): the non-ascent horizontal axis.
    const [px, pz] = fx !== 0 ? [0, 1] : [1, 0];
    const flankIsShell = (sx: number, sz: number): boolean =>
      chain.some((t) => isShell(t.pos[0] + sx, t.pos[1], t.pos[2] + sz));
    const plusShell = flankIsShell(px, pz);
    const minusShell = flankIsShell(-px, -pz);
    if (!plusShell && !minusShell) continue; // already off the walls — nothing to do

    // Shift toward the side that ISN'T the wall.
    const sign = plusShell && !minusShell ? -1 : !plusShell && minusShell ? 1 : 0;
    if (sign === 0) { blocked++; continue; } // walled on both sides (a tight well) — can't inset
    const sx = px * sign, sz = pz * sign;

    // Only shift if every destination cell is empty and not shell (never overwrite anything).
    const safe = chain.every((t) => {
      const nx = t.pos[0] + sx, ny = t.pos[1], nz = t.pos[2] + sz;
      return !present(nx, ny, nz) && !isShell(nx, ny, nz);
    });
    if (!safe) { blocked++; continue; }

    for (const t of chain) {
      removeKeys.add(posKey(...t.pos));
      const np: [number, number, number] = [t.pos[0] + sx, t.pos[1], t.pos[2] + sz];
      moved.set(posKey(...np), { ...t, pos: np });
    }
    insets++;
  }

  if (insets === 0 && blocked === 0) return { blocks, palette };
  const out = blocks
    .filter((b) => !removeKeys.has(posKey(...b.pos)))
    .concat([...moved.values()]);
  const fixes = insets ? [`Inset ${insets} staircase(s) one block off the wall so there's standing room to climb.`] : undefined;
  const warnings = blocked
    ? [`A staircase is pressed against the walls with no room to inset it off the wall — give the flight at `
      + `least one clear cell beside it (keep the stair core one block off the outer walls).`]
    : undefined;
  return { blocks: out, palette, fixes, warnings };
};
