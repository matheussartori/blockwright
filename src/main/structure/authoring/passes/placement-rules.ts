// Block placement rules, lifted from knowledge/nbt/03-blocks-and-blockstates.md
// into code so they're enforced deterministically rather than hoped-for from the
// model. The placement pass (./placement.ts) consults these predicates; keeping
// the data here makes the rule set easy to scan and extend.
import { bareId } from '../palette';

/** Floor/hanging lanterns. A floor lantern rests on a solid block below; a
 *  `hanging:true` lantern hangs from a block above. */
export const isLantern = (id: string): boolean => id === 'lantern' || id === 'soul_lantern';

/** The FLOOR torch forms (not the `wall_*` variants) — they need a solid block
 *  directly beneath them or they pop off on placement. */
export const isFloorTorch = (id: string): boolean =>
  id === 'torch' || id === 'soul_torch' || id === 'redstone_torch';

/** Candles sit on top of a full solid block and can't stack on each other.
 *  (`*_candle_cake` ends in `_cake`, so it's correctly excluded.) */
export const isCandle = (id: string): boolean => id === 'candle' || id.endsWith('_candle');

/** A FLOOR skull/head (`skeleton_skull`, `zombie_head`, …) — the ground variant that
 *  rests ON TOP of a block below. The `*_wall_skull`/`*_wall_head` variants attach to a
 *  wall instead and are excluded here. A floor head with nothing beneath it pops off on
 *  spawn (the "floating skull" defect). */
export const isFloorHead = (id: string): boolean =>
  (id.endsWith('_skull') || id.endsWith('_head')) && !id.includes('_wall_');

// Blocks that need a solid block directly beneath them (carpets, plates, rails,
// small plants). Removed when left floating — a low-risk auto-fix.
const GROUND_SUFFIX = ['_carpet', '_pressure_plate', '_sapling'];
const GROUND_IDS = new Set([
  'rail', 'powered_rail', 'detector_rail', 'activator_rail',
  'poppy', 'dandelion', 'blue_orchid', 'allium', 'azure_bluet', 'oxeye_daisy', 'cornflower',
  'lily_of_the_valley', 'red_tulip', 'orange_tulip', 'white_tulip', 'pink_tulip', 'wither_rose',
  'torchflower', 'short_grass', 'fern', 'dead_bush', 'sweet_berry_bush', 'sugar_cane',
  'red_mushroom', 'brown_mushroom',
]);

/** Whether a block needs a solid block directly below it to survive. */
export const needsGroundBelow = (id: string): boolean =>
  GROUND_IDS.has(id) || GROUND_SUFFIX.some((s) => id.endsWith(s));

// Blocks that do NOT present a solid full face a fixture can mount on / rest on —
// crucially glass and panes (you can't put a torch on glass) plus the thin/
// transparent/decorative set. Anything not matched counts as solid support. Used
// for torches and wall fixtures (lanterns/candles/carpets are more permissive and
// use a plain "is there any block" test instead).
const NON_SUPPORT_SUFFIX = [
  '_glass', '_glass_pane', '_pane', '_bars', '_fence', '_fence_gate', '_wall', '_door',
  '_trapdoor', '_carpet', '_button', '_pressure_plate', '_sign', '_banner', '_torch',
  '_sapling', '_rail', '_head', '_skull', '_bed', '_candle', '_fan', '_hanging_sign', '_leaves',
];
const NON_SUPPORT_IDS = new Set([
  'air', 'cave_air', 'void_air', 'water', 'lava', 'glass', 'tinted_glass', 'glass_pane', 'iron_bars',
  'torch', 'soul_torch', 'redstone_torch', 'wall_torch', 'lantern', 'soul_lantern', 'chain', 'ladder',
  'vine', 'scaffolding', 'lever', 'tripwire', 'tripwire_hook', 'flower_pot', 'snow', 'cobweb',
  'end_rod', 'lightning_rod', 'conduit', 'candle', 'rail', 'powered_rail', 'detector_rail',
  'activator_rail',
]);

/** Does this neighbour present a solid full face a torch/wall fixture can mount on?
 *  Glass, panes, bars and thin/decorative blocks do NOT (the bug behind torches
 *  stuck to windows). `undefined` (no block) is never support. */
export function isSolidSupport(name: string | undefined): boolean {
  if (name === undefined) return false;
  const id = bareId(name);
  if (NON_SUPPORT_IDS.has(id)) return false;
  if (NON_SUPPORT_SUFFIX.some((s) => id.endsWith(s))) return false;
  return true;
}

/** Wall-mounted fixtures, split by how we repair an unsupported one: a `torch` can
 *  be re-anchored to an adjacent solid wall (cheap, orientation-agnostic); `attach`
 *  blocks (sign/banner/ladder) can't be re-anchored without changing what they show,
 *  so they're removed instead. */
export function wallFixtureKind(name: string): 'torch' | 'attach' | null {
  const id = bareId(name);
  if (id === 'wall_torch' || id.endsWith('_wall_torch')) return 'torch';
  if (id.endsWith('_wall_sign') || id.endsWith('_wall_banner') || id === 'ladder') return 'attach';
  return null;
}

/** The four horizontal facings with their unit (dx,dz). A wall fixture's support
 *  sits OPPOSITE its facing (at `pos - (dx,dz)`); it leans away from that wall. */
export const FACINGS: { facing: string; dx: number; dz: number }[] = [
  { facing: 'north', dx: 0, dz: -1 },
  { facing: 'south', dx: 0, dz: 1 },
  { facing: 'east', dx: 1, dz: 0 },
  { facing: 'west', dx: -1, dz: 0 },
];
