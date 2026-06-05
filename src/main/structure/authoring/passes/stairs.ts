// Multi-storey finalizer: keep a staircase OFF the wall. The model routinely jams a
// flight flush against an outer wall / into a corner, leaving no standing room beside it
// to start the climb. This pass detects a real climbing flight pressed against the
// exterior shell and, when the interior side is clear, shifts the whole flight ONE block
// off the wall; when it can't do so safely (boxed in on both sides) it leaves the geometry
// alone and warns — the `stairsToLadder` pass that runs next turns those irreparable
// flights into a wall ladder. Runs BEFORE `carveStairwells`, so the headroom/landing carve
// then applies to the flight's new position. Gated to storeyed structures by the compile
// pipeline (declared in each structure module's `finalize`).
//
// Conservative: it only ever moves a flight into cells that are currently EMPTY and not
// part of the shell, so it never overwrites a wall, furniture, or another stair.
import { posKey } from '../geometry';
import { computeEnvelope } from './envelope';
import { isAir } from '../palette';
import { findFlights } from './flights';
import type { AuthoringBlock } from '../types';
import type { Pass } from './types';

export const insetStairs: Pass = (blocks, palette) => {
  const at = new Map<string, AuthoringBlock>();
  for (const b of blocks) at.set(posKey(...b.pos), b);
  const nameOf = (s: number): string => palette[s]?.Name ?? '';
  const present = (x: number, y: number, z: number): boolean => {
    const b = at.get(posKey(x, y, z));
    return !!b && !isAir(nameOf(b.state));
  };
  const { isShell } = computeEnvelope(blocks, palette);

  const removeKeys = new Set<string>();
  const moved = new Map<string, AuthoringBlock>();
  let insets = 0;
  let blocked = 0;

  for (const { chain, dir } of findFlights(blocks, palette)) {
    const [fx] = dir;
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
