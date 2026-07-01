// Material selection for rebuilt connectors: which block each floor plane is
// really made of, excluding terrain so a stair never inherits the yard's dirt.
import { bareId } from '../../palette';
import { isStructuralFull } from '../flights';
import type { AuthoringBlock, AuthoringPaletteEntry } from '../../types';

/** Ground / loose-fill blocks that read as TERRAIN, never construction: the surroundings
 *  yard's dirt/grass dominates the grade plane, and reusing it for a stair's treads/stringers
 *  put DIRT in a stone staircase (the "dirt na escada" defect). A derived stair must blend
 *  with the BUILD, so these are skipped when picking a plane's material. */
const GROUND_BLOCKS = new Set([
  'dirt', 'grass_block', 'coarse_dirt', 'rooted_dirt', 'podzol', 'mycelium', 'dirt_path',
  'farmland', 'mud', 'sand', 'red_sand', 'gravel', 'clay', 'snow_block', 'grass_path',
]);
function isGroundMaterial(name: string): boolean {
  return GROUND_BLOCKS.has(bareId(name ?? ''));
}

/** The dominant (most common) full CONSTRUCTION block of each given plane — its real floor
 *  material, reused for stringers so a rebuilt stair blends in. Terrain (dirt/grass/sand…) is
 *  excluded so a stair opening onto the yard's grade plane never inherits its dirt. A plane
 *  with only terrain yields no entry (the caller falls back to the build's stair material). */
export function planeMaterials(
  blocks: AuthoringBlock[], palette: AuthoringPaletteEntry[], planes: Set<number>,
): Map<number, number> {
  const tally = new Map<number, Map<number, number>>();
  for (const b of blocks) {
    const y = b.pos[1];
    if (!planes.has(y) || !isStructuralFull(palette, b.state)) continue;
    if (isGroundMaterial(palette[b.state]?.Name ?? '')) continue; // never a terrain block
    const m = tally.get(y) ?? new Map<number, number>();
    m.set(b.state, (m.get(b.state) ?? 0) + 1);
    tally.set(y, m);
  }
  const out = new Map<number, number>();
  for (const [y, m] of tally) {
    let best = -1, bestCount = -1;
    for (const [state, c] of m) if (c > bestCount) { bestCount = c; best = state; }
    if (best >= 0) out.set(y, best);
  }
  return out;
}
