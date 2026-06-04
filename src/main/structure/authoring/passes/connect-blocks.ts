// Glass panes, iron bars, fences and walls are *connecting* blocks: their visual
// shape comes from the north/south/east/west (and, for walls, up) blockstate
// properties, which vanilla computes from neighbours at placement time. A real
// structure-block save bakes those booleans into the palette; the authoring JSON
// the AI emits does not, so an isolated pane keeps all-false and renders as the
// bare `_post` column (the "laser beam"). This pass reproduces vanilla's placement
// logic: it derives each connecting block's sides from its neighbours and splits
// palette entries per distinct combination.
import { posKey } from '../geometry';
import { bareId, makeIntern } from '../palette';
import type { AuthoringPaletteEntry } from '../types';
import type { Pass } from './types';

type ConnFamily = 'pane' | 'fence_wood' | 'fence_nether' | 'wall';

const DIRS: { dx: number; dz: number; key: 'north' | 'south' | 'east' | 'west' }[] = [
  { dx: 0, dz: -1, key: 'north' },
  { dx: 0, dz: 1, key: 'south' },
  { dx: 1, dz: 0, key: 'east' },
  { dx: -1, dz: 0, key: 'west' },
];

/** Which connecting family a block belongs to, or null if it doesn't connect. */
export function connFamily(name: string): ConnFamily | null {
  const id = bareId(name);
  if (id === 'glass_pane' || id.endsWith('_glass_pane') || id === 'iron_bars' || id.endsWith('_bars')) return 'pane';
  if (id === 'nether_brick_fence') return 'fence_nether';
  if (id.endsWith('_fence')) return 'fence_wood'; // `_fence_gate` ends in `_gate`, excluded
  if (id.endsWith('_wall')) return 'wall'; // wall_sign/_banner/_torch end in other suffixes
  return null;
}

// Thin / non-full neighbours a connecting block does NOT attach to (beyond its own
// family, handled separately). A pragmatic denylist: anything not matched here
// counts as a full block the connection grabs onto. Not 100% vanilla-exact (e.g.
// directional stair faces), but right for the common cases.
const NON_SOLID_SUFFIX = [
  '_slab', '_stairs', '_door', '_trapdoor', '_button', '_pressure_plate', '_sign',
  '_banner', '_carpet', '_torch', '_sapling', '_rail', '_head', '_skull', '_bed',
  '_candle', '_fan', '_fence_gate', '_hanging_sign',
];
const NON_SOLID_IDS = new Set([
  'air', 'cave_air', 'void_air', 'water', 'lava', 'torch', 'redstone_wire', 'lever',
  'ladder', 'vine', 'scaffolding', 'chain', 'lantern', 'soul_lantern', 'tripwire',
  'tripwire_hook', 'flower_pot', 'snow', 'cobweb', 'end_rod', 'lightning_rod', 'conduit',
]);

/** Whether a neighbour presents a full face that a pane/fence/wall connects to. */
function isSolidNeighbour(name: string): boolean {
  const id = bareId(name);
  if (NON_SOLID_IDS.has(id)) return false;
  if (NON_SOLID_SUFFIX.some((s) => id.endsWith(s))) return false;
  return true;
}

/** Does a block of `family` connect to a neighbour named `neighbour`? Same-family
 *  members connect to each other (panes also grab iron bars — one family); any
 *  family also connects to a full solid block. */
function connectsTo(family: ConnFamily, neighbour: string): boolean {
  if (connFamily(neighbour) === family) return true;
  return isSolidNeighbour(neighbour);
}

/** Merge the original props with the computed connection properties. Panes/bars/
 *  fences use boolean sides; walls use up + none|low|tall per side. */
function connectionProps(
  family: ConnFamily,
  sides: Record<string, boolean>,
  base: Record<string, unknown> | undefined,
): Record<string, unknown> {
  const out: Record<string, unknown> = { ...(base ?? {}) };
  if (family === 'wall') {
    const { north: n, south: s, east: e, west: w } = sides;
    // Vanilla heights: tall against full blocks/walls — which is all we connect to.
    for (const k of ['north', 'south', 'east', 'west'] as const) out[k] = sides[k] ? 'tall' : 'none';
    // Post (up) shows unless the wall passes straight through (two opposite sides).
    const straight = (n && s && !e && !w) || (e && w && !n && !s);
    out.up = straight ? 'false' : 'true';
  } else {
    for (const k of ['north', 'south', 'east', 'west'] as const) out[k] = sides[k] ? 'true' : 'false';
  }
  return out;
}

/** Bake neighbour-derived connection properties into connecting blocks, splitting
 *  palette entries per distinct (name, properties) combination. */
export const connectBlocks: Pass = (blocks, palette) => {
  const families = palette.map((p) => connFamily(p.Name));
  if (!families.some(Boolean)) return { blocks, palette }; // nothing to connect

  // Name lookup by cell, to test neighbours.
  const nameAt = new Map<string, string>();
  for (const b of blocks) nameAt.set(posKey(...b.pos), palette[b.state]?.Name ?? '');

  // Find-or-append a palette entry for a (name, props) combo, deduped by key.
  const outPalette = palette.slice();
  const intern = makeIntern(outPalette);

  const outBlocks = blocks.map((b) => {
    const family = families[b.state];
    if (!family) return b;
    const base: AuthoringPaletteEntry = palette[b.state];
    const [x, y, z] = b.pos;
    const sides: Record<string, boolean> = {};
    for (const { dx, dz, key } of DIRS) {
      const n = nameAt.get(posKey(x + dx, y, z + dz));
      sides[key] = n !== undefined && connectsTo(family, n);
    }
    const props = connectionProps(family, sides, base.Properties);
    const state = intern({ Name: base.Name, Properties: props });
    return { ...b, state };
  });

  return { blocks: outBlocks, palette: outPalette };
};
