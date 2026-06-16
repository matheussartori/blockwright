// The haunted-tower keep, QA'd against the defects the user hit on a TALL build (a 25×123×25
// spire is 5 storeys of ~22 blocks each — far too tall for a single 45° flight to fit a 25-wide
// tower). Guards three fixes:
//   1. Circulation: every storey is reachable on foot via the code-built switchback stair core,
//      and the compile emits NO "could not connect floors" warning.
//   2. Door: a clear 1-wide × 2-tall tunnel runs behind the front door (the front face is
//      double-thick — plinth + shaft wall — so the build must carve the shaft wall itself, or
//      the entrance dead-ends into a locked wall).
//   3. Decay weathers to mossy only — it never punches AIR holes through the exterior wall.
import { describe, expect, it } from 'vitest';
import { compileStructureReport } from '../../../authoring/compile';
import { structureFloorPlan } from '../../index';
import type { AuthoringBlock, AuthoringPaletteEntry } from '../../../authoring/types';

function compileTower(size: [number, number, number], floors: number) {
  const corner: [number, number, number] = [size[0] - 1, size[1] - 1, size[2] - 1];
  // Thread the structure's authoritative floor plan, exactly as real generation does
  // (ai/emit-handler.ts), so every tapered upper storey is a recognised floor plane.
  const planFloors = structureFloorPlan('haunted-tower', size, { floors, decoration: 'cursed' });
  return compileStructureReport(
    {
      DataVersion: 3955,
      size,
      palette: [{ Name: 'minecraft:air' }],
      ops: [{ op: 'template', name: 'haunted-tower', from: [0, 0, 0], to: corner, params: { decoration: 'cursed', surroundings: 'none', floors } }],
    },
    { structureType: 'haunted-tower', floors: planFloors },
  );
}

const FULL = (n: string): boolean => {
  const id = n.replace('minecraft:', '');
  if (/air$/.test(id)) return false;
  if (id.endsWith('_stairs') || id.endsWith('_slab') || id === 'ladder' || id.endsWith('_door')) return false;
  if (id.includes('pane') || id.includes('bars') || id.includes('fence') || id.includes('chain')) return false;
  if (id.includes('lantern') || id.includes('torch') || id.includes('candle') || id.includes('carpet')) return false;
  return true;
};

/** Flood the walkable space from a ground-floor cell (step ±1 in height, plus ladder travel)
 *  and return the set of reachable foot-cell keys. */
function reachableFeet(blocks: AuthoringBlock[], palette: AuthoringPaletteEntry[], size: [number, number, number]): Set<string> {
  const nameAt = new Map<string, string>();
  for (const b of blocks) { const n = palette[b.state]?.Name ?? ''; if (!/:air$/.test(n)) nameAt.set(b.pos.join(','), n); }
  const at = (x: number, y: number, z: number) => nameAt.get(`${x},${y},${z}`);
  const isFull = (x: number, y: number, z: number) => { const n = at(x, y, z); return n !== undefined && FULL(n); };
  const isLadder = (x: number, y: number, z: number) => at(x, y, z) === 'minecraft:ladder';
  const foot = (x: number, y: number, z: number) =>
    !isFull(x, y, z) && !isFull(x, y + 1, z) && (isLadder(x, y, z) || at(x, y - 1, z) !== undefined || at(x, y, z) !== undefined);
  const seen = new Set<string>();
  const cx = Math.floor(size[0] / 2), cz = Math.floor(size[2] / 2);
  const start: [number, number, number] = [cx, 1, cz];
  if (!foot(...start)) return seen;
  const q = [start];
  seen.add(start.join(','));
  while (q.length) {
    const [x, y, z] = q.shift()!;
    const moves: [number, number, number][] = [];
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) for (const dy of [0, 1, -1]) moves.push([x + dx, y + dy, z + dz]);
    if (isLadder(x, y, z) || isLadder(x, y - 1, z)) { moves.push([x, y + 1, z], [x, y - 1, z]); }
    for (const [nx, ny, nz] of moves) {
      if (nx < 0 || ny < 0 || nz < 0 || nx >= size[0] || ny >= size[1] || nz >= size[2]) continue;
      const k = `${nx},${ny},${nz}`;
      if (seen.has(k) || !foot(nx, ny, nz)) continue;
      seen.add(k); q.push([nx, ny, nz]);
    }
  }
  return seen;
}

describe('haunted-tower (tall build)', () => {
  const size: [number, number, number] = [25, 123, 25];
  const { report } = compileTower(size, 5);
  const planes = structureFloorPlan('haunted-tower', size, { floors: 5, decoration: 'cursed' })
    .map((f) => Math.min(f.from, f.to));

  it('connects every storey with a clean stair core and warns about none', () => {
    expect(report.warnings, JSON.stringify(report.warnings)).toHaveLength(0);
    const feet = reachableFeet(report.blocks, report.palette, size);
    for (const fy of planes) {
      const reached = (() => {
        for (let x = 2; x <= size[0] - 3; x++) for (let z = 2; z <= size[2] - 3; z++) if (feet.has(`${x},${fy + 1},${z}`)) return true;
        return false;
      })();
      expect(reached, `storey floor at y=${fy} must be reachable on foot`).toBe(true);
    }
  });

  it('keeps a clear tunnel behind the front door', () => {
    const nameAt = new Map<string, string>();
    for (const b of report.blocks) { const n = report.palette[b.state]?.Name ?? ''; if (!/:air$/.test(n)) nameAt.set(b.pos.join(','), n); }
    const isFull = (x: number, y: number, z: number) => { const n = nameAt.get(`${x},${y},${z}`); return n !== undefined && FULL(n); };
    const cx = Math.floor(size[0] / 2);
    // The door sits at z=0; behind it (z=1, z=2) at both door-half heights must be passable.
    for (const z of [1, 2]) for (const y of [1, 2]) {
      expect(isFull(cx, y, z), `door tunnel blocked at (${cx},${y},${z})`).toBe(false);
    }
  });

  it('never punches air holes through the exterior wall (decay weathers, not breaches)', () => {
    const present = new Set<string>();
    for (const b of report.blocks) if (!/:air$/.test(report.palette[b.state]?.Name ?? '')) present.add(b.pos.join(','));
    // The front shaft wall plane (z=1), ground-storey band: the only gaps should be the door
    // (cx) and the centred lancet slit — never scattered decay holes.
    let holes = 0;
    for (let y = 1; y <= 20; y++) for (let x = 1; x <= size[0] - 2; x++) if (!present.has(`${x},${y},1`)) holes++;
    expect(holes, 'too many gaps in the front wall — decay is punching holes').toBeLessThanOrEqual(4);
  });
});
