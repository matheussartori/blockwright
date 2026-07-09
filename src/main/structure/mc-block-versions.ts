// Per-version block knowledge for the DOWNGRADER (v2.3 §1.4) — the registry no reference
// tool ships (Amulet drops these blocks as "unknown"; Litematica's answer was "edit the NBT
// by hand"). Two tables over the same version math as `mc-data-version.ts`:
//
//   • BLOCK_RENAMES — ids renamed within the supported range (1.18.2+): a downgrade below
//     `renamedIn` restores the old id LOSSLESSLY (the exact remap Amulet never does).
//   • BLOCK_INTRODUCED — blocks that don't exist before `in`, each with a curated stand-in
//     for older targets (same-shape family where one exists, so stairs stay stairs and the
//     blockstate properties survive). No entry ⇒ the block is assumed to exist at every
//     supported target (fail-open: this table is best-effort, extended per release).
//
// Vanilla (`minecraft:`) ids only — a mod block's history is unknowable here.
import { mcVersionRank } from '@/shared/mc-version';

/** A block id renamed within the supported range. */
export interface BlockRename {
  /** The MODERN id (what a newer file contains). */
  id: string;
  /** The id every release before `renamedIn` uses. */
  before: string;
  /** First release with the new id. */
  renamedIn: string;
}

export const BLOCK_RENAMES: BlockRename[] = [
  // 1.20.3: minecraft:grass (the plant) became short_grass to stop shadowing grass_block.
  { id: 'minecraft:short_grass', before: 'minecraft:grass', renamedIn: '1.20.3' },
];

/** A block that doesn't exist before `in`, with its downgrade stand-in. */
export interface IntroducedBlock {
  /** First release that has the block. */
  in: string;
  /** Curated substitute for older targets. Omitted ⇒ `structure_void` (terrain preserved on
   *  paste — an honest hole beats a wrong block). Must itself exist at 1.18.2 or carry its
   *  own entry (the resolver walks the chain). */
  substitute?: string;
  /** The substitute accepts the SAME blockstate property set (stairs→stairs, door→door) —
   *  keep `Properties`. Otherwise properties are dropped (never write a state the target
   *  can't parse). */
  keepProps?: boolean;
}

const V = (in_: string, substitute?: string, keepProps?: boolean): IntroducedBlock => ({
  in: in_,
  ...(substitute ? { substitute } : {}),
  ...(keepProps ? { keepProps } : {}),
});

/** Wood-set entries (planks/log/leaves/door/…) for one family introduced in `in`, each
 *  substituting the same-shape block of `sub` — an OVERWORLD family that has every shape
 *  (nether woods lack logs/leaves/saplings), so properties survive. Hanging signs are NOT
 *  here — they arrived for every wood at once in 1.20 (see `hangingSigns`). A shape the
 *  family never had (bamboo has no log) is a dead key that matches nothing — harmless. */
function woodSet(in_: string, family: string, sub: string): Record<string, IntroducedBlock> {
  const shapes = [
    'planks', 'log', 'wood', 'leaves', 'sapling', 'button', 'door', 'trapdoor', 'fence',
    'fence_gate', 'pressure_plate', 'sign', 'wall_sign', 'slab', 'stairs',
  ];
  const out: Record<string, IntroducedBlock> = {};
  for (const shape of shapes) {
    out[`minecraft:${family}_${shape}`] = V(in_, `minecraft:${sub}_${shape}`, true);
  }
  out[`minecraft:stripped_${family}_log`] = V(in_, `minecraft:stripped_${sub}_log`, true);
  out[`minecraft:stripped_${family}_wood`] = V(in_, `minecraft:stripped_${sub}_wood`, true);
  return out;
}

/** Hanging signs (1.20, every wood at once) — the older same-wood standing/wall sign is the
 *  stand-in (its `attached` property doesn't exist there, so properties are dropped). Woods
 *  newer than 1.20 route through their own family's substitute wood. */
function hangingSigns(): Record<string, IntroducedBlock> {
  const subFor: Record<string, string> = {
    oak: 'oak', spruce: 'spruce', birch: 'birch', jungle: 'jungle', acacia: 'acacia',
    dark_oak: 'dark_oak', crimson: 'crimson', warped: 'warped',
    mangrove: 'spruce', cherry: 'birch', bamboo: 'jungle',
  };
  const out: Record<string, IntroducedBlock> = {};
  for (const [wood, sub] of Object.entries(subFor)) {
    out[`minecraft:${wood}_hanging_sign`] = V('1.20', `minecraft:${sub}_sign`);
    out[`minecraft:${wood}_wall_hanging_sign`] = V('1.20', `minecraft:${sub}_wall_sign`);
  }
  out['minecraft:pale_oak_hanging_sign'] = V('1.21.2', 'minecraft:birch_sign');
  out['minecraft:pale_oak_wall_hanging_sign'] = V('1.21.2', 'minecraft:birch_wall_sign');
  return out;
}

export const BLOCK_INTRODUCED: Record<string, IntroducedBlock> = {
  // ── 1.19 (The Wild) ────────────────────────────────────────────────────────────────
  ...woodSet('1.19', 'mangrove', 'spruce'),
  ...hangingSigns(),
  'minecraft:mangrove_roots': V('1.19', 'minecraft:oak_fence'),
  'minecraft:muddy_mangrove_roots': V('1.19', 'minecraft:coarse_dirt'),
  'minecraft:mangrove_propagule': V('1.19'),
  'minecraft:mud': V('1.19', 'minecraft:coarse_dirt'),
  'minecraft:packed_mud': V('1.19', 'minecraft:dirt'),
  'minecraft:mud_bricks': V('1.19', 'minecraft:bricks'),
  'minecraft:mud_brick_stairs': V('1.19', 'minecraft:brick_stairs', true),
  'minecraft:mud_brick_slab': V('1.19', 'minecraft:brick_slab', true),
  'minecraft:mud_brick_wall': V('1.19', 'minecraft:brick_wall', true),
  'minecraft:sculk': V('1.19', 'minecraft:black_concrete'),
  'minecraft:sculk_vein': V('1.19', 'minecraft:glow_lichen', true),
  'minecraft:sculk_catalyst': V('1.19', 'minecraft:obsidian'),
  'minecraft:sculk_shrieker': V('1.19', 'minecraft:obsidian'),
  'minecraft:reinforced_deepslate': V('1.19', 'minecraft:obsidian'),
  'minecraft:ochre_froglight': V('1.19', 'minecraft:shroomlight'),
  'minecraft:verdant_froglight': V('1.19', 'minecraft:shroomlight'),
  'minecraft:pearlescent_froglight': V('1.19', 'minecraft:shroomlight'),
  'minecraft:frogspawn': V('1.19'),

  // ── 1.20 (Trails & Tales) ──────────────────────────────────────────────────────────
  ...woodSet('1.20', 'cherry', 'birch'),
  ...woodSet('1.20', 'bamboo', 'jungle'),
  'minecraft:bamboo_block': V('1.20', 'minecraft:jungle_log', true),
  'minecraft:stripped_bamboo_block': V('1.20', 'minecraft:stripped_jungle_log', true),
  'minecraft:bamboo_mosaic': V('1.20', 'minecraft:jungle_planks'),
  'minecraft:bamboo_mosaic_stairs': V('1.20', 'minecraft:jungle_stairs', true),
  'minecraft:bamboo_mosaic_slab': V('1.20', 'minecraft:jungle_slab', true),
  'minecraft:cherry_leaves': V('1.20', 'minecraft:birch_leaves', true),
  'minecraft:pink_petals': V('1.20'),
  'minecraft:chiseled_bookshelf': V('1.20', 'minecraft:bookshelf'),
  'minecraft:decorated_pot': V('1.20', 'minecraft:terracotta'),
  'minecraft:suspicious_sand': V('1.20', 'minecraft:sand'),
  'minecraft:suspicious_gravel': V('1.20', 'minecraft:gravel'),
  'minecraft:torchflower': V('1.20', 'minecraft:dandelion'),
  'minecraft:torchflower_crop': V('1.20'),
  'minecraft:pitcher_plant': V('1.20'),
  'minecraft:pitcher_crop': V('1.20'),
  'minecraft:sniffer_egg': V('1.20'),
  'minecraft:calibrated_sculk_sensor': V('1.20', 'minecraft:sculk_sensor'),
  'minecraft:piglin_head': V('1.20', 'minecraft:zombie_head'),
  'minecraft:piglin_wall_head': V('1.20', 'minecraft:zombie_wall_head', true),

  // ── 1.21 (Tricky Trials) ───────────────────────────────────────────────────────────
  'minecraft:crafter': V('1.21', 'minecraft:dispenser'),
  'minecraft:trial_spawner': V('1.21', 'minecraft:spawner'),
  'minecraft:vault': V('1.21', 'minecraft:chiseled_deepslate'),
  'minecraft:heavy_core': V('1.21', 'minecraft:polished_deepslate'),
  ...copperFamily('1.21'),
  ...tuffFamily('1.21'),

  // ── 1.21.2/1.21.4 (The Garden Awakens) ─────────────────────────────────────────────
  ...woodSet('1.21.2', 'pale_oak', 'birch'),
  'minecraft:pale_moss_block': V('1.21.2', 'minecraft:moss_block'),
  'minecraft:pale_moss_carpet': V('1.21.2', 'minecraft:moss_carpet'),
  'minecraft:pale_hanging_moss': V('1.21.2'),
  'minecraft:creaking_heart': V('1.21.2', 'minecraft:dark_oak_log'),
  'minecraft:resin_clump': V('1.21.4'),
  'minecraft:resin_block': V('1.21.4', 'minecraft:orange_terracotta'),
  'minecraft:resin_bricks': V('1.21.4', 'minecraft:red_sandstone'),
  'minecraft:resin_brick_stairs': V('1.21.4', 'minecraft:red_sandstone_stairs', true),
  'minecraft:resin_brick_slab': V('1.21.4', 'minecraft:red_sandstone_slab', true),
  'minecraft:resin_brick_wall': V('1.21.4', 'minecraft:red_sandstone_wall', true),
  'minecraft:chiseled_resin_bricks': V('1.21.4', 'minecraft:chiseled_red_sandstone'),
  'minecraft:open_eyeblossom': V('1.21.4', 'minecraft:oxeye_daisy'),
  'minecraft:closed_eyeblossom': V('1.21.4', 'minecraft:oxeye_daisy'),

  // ── 1.21.5 (Spring to Life) / 1.21.6 ───────────────────────────────────────────────
  'minecraft:bush': V('1.21.5'),
  'minecraft:firefly_bush': V('1.21.5'),
  'minecraft:cactus_flower': V('1.21.5'),
  'minecraft:short_dry_grass': V('1.21.5'),
  'minecraft:tall_dry_grass': V('1.21.5'),
  'minecraft:wildflowers': V('1.21.5'),
  'minecraft:leaf_litter': V('1.21.5'),
  'minecraft:test_block': V('1.21.5'),
  'minecraft:test_instance_block': V('1.21.5'),
  'minecraft:dried_ghast': V('1.21.6'),

  // ── 1.21.9 (The Copper Age) ────────────────────────────────────────────────────────
  'minecraft:copper_chest': V('1.21.9', 'minecraft:chest'),
  'minecraft:copper_golem_statue': V('1.21.9'),
  'minecraft:copper_torch': V('1.21.9', 'minecraft:torch'),
  'minecraft:copper_wall_torch': V('1.21.9', 'minecraft:wall_torch', true),
  'minecraft:copper_lantern': V('1.21.9', 'minecraft:lantern', true),
  'minecraft:copper_chain': V('1.21.9', 'minecraft:chain', true),
  'minecraft:copper_bars': V('1.21.9', 'minecraft:iron_bars', true),
  ...lightningRods('1.21.9'),
  ...shelves('1.21.9'),
};

/** The 1.21 copper build set (bulb/grate/door/trapdoor/chiseled + oxidation/waxed variants). */
function copperFamily(in_: string): Record<string, IntroducedBlock> {
  const out: Record<string, IntroducedBlock> = {};
  for (const wax of ['', 'waxed_']) {
    for (const oxide of ['', 'exposed_', 'weathered_', 'oxidized_']) {
      out[`minecraft:${wax}${oxide}chiseled_copper`] = V(in_, `minecraft:${wax}${oxide}cut_copper`);
      out[`minecraft:${wax}${oxide}copper_grate`] = V(in_, `minecraft:${wax}${oxide}cut_copper`);
      out[`minecraft:${wax}${oxide}copper_bulb`] = V(in_, 'minecraft:redstone_lamp');
      out[`minecraft:${wax}${oxide}copper_door`] = V(in_, 'minecraft:iron_door', true);
      out[`minecraft:${wax}${oxide}copper_trapdoor`] = V(in_, 'minecraft:iron_trapdoor', true);
    }
  }
  return out;
}

/** The 1.21 tuff build set, substituting the same-shape andesite/stone-brick blocks. */
function tuffFamily(in_: string): Record<string, IntroducedBlock> {
  return {
    'minecraft:tuff_stairs': V(in_, 'minecraft:andesite_stairs', true),
    'minecraft:tuff_slab': V(in_, 'minecraft:andesite_slab', true),
    'minecraft:tuff_wall': V(in_, 'minecraft:andesite_wall', true),
    'minecraft:chiseled_tuff': V(in_, 'minecraft:chiseled_stone_bricks'),
    'minecraft:polished_tuff': V(in_, 'minecraft:polished_andesite'),
    'minecraft:polished_tuff_stairs': V(in_, 'minecraft:polished_andesite_stairs', true),
    'minecraft:polished_tuff_slab': V(in_, 'minecraft:polished_andesite_slab', true),
    'minecraft:polished_tuff_wall': V(in_, 'minecraft:andesite_wall', true),
    'minecraft:tuff_bricks': V(in_, 'minecraft:stone_bricks'),
    'minecraft:tuff_brick_stairs': V(in_, 'minecraft:stone_brick_stairs', true),
    'minecraft:tuff_brick_slab': V(in_, 'minecraft:stone_brick_slab', true),
    'minecraft:tuff_brick_wall': V(in_, 'minecraft:stone_brick_wall', true),
    'minecraft:chiseled_tuff_bricks': V(in_, 'minecraft:chiseled_stone_bricks'),
  };
}

/** Oxidized lightning-rod variants (1.21.9) — the plain rod exists since 1.17. */
function lightningRods(in_: string): Record<string, IntroducedBlock> {
  const out: Record<string, IntroducedBlock> = {};
  for (const wax of ['', 'waxed_']) {
    for (const oxide of ['exposed_', 'weathered_', 'oxidized_']) {
      out[`minecraft:${wax}${oxide}lightning_rod`] = V(in_, 'minecraft:lightning_rod', true);
    }
    if (wax) out[`minecraft:${wax}lightning_rod`] = V(in_, 'minecraft:lightning_rod', true);
  }
  return out;
}

/** The 1.21.9 wood shelves — bookshelf is the closest older shape. */
function shelves(in_: string): Record<string, IntroducedBlock> {
  const out: Record<string, IntroducedBlock> = {};
  for (const wood of ['oak', 'spruce', 'birch', 'jungle', 'acacia', 'dark_oak', 'mangrove', 'cherry', 'bamboo', 'crimson', 'warped', 'pale_oak']) {
    out[`minecraft:${wood}_shelf`] = V(in_, 'minecraft:bookshelf');
  }
  return out;
}

export const STRUCTURE_VOID = 'minecraft:structure_void';

/** One palette-entry downgrade decision. */
export type BlockDowngrade =
  | { kind: 'keep' }
  | { kind: 'rename'; to: string }
  | { kind: 'substitute'; to: string; keepProps: boolean };

/**
 * Decide what happens to a block id when the file is downgraded to `target`.
 *
 * Renames are undone first (lossless), then existence is checked: a block introduced after
 * `target` resolves through its curated substitute chain, falling back to `structure_void`
 * when the chain dies before reaching a block the target knows. Non-vanilla ids are kept
 * verbatim (a mod block's history is the mod's business).
 *
 * @param id     The block id as the source file has it.
 * @param target The downgrade target version (e.g. "1.21.1").
 * @returns The decision — `keep`, a lossless `rename`, or a lossy `substitute`.
 */
export function downgradeBlockId(id: string, target: string): BlockDowngrade {
  if (!id.startsWith('minecraft:')) return { kind: 'keep' };
  const targetRank = mcVersionRank(target);
  if (targetRank === null) return { kind: 'keep' };

  const rename = BLOCK_RENAMES.find((r) => r.id === id);
  const renamed = rename && targetRank < (mcVersionRank(rename.renamedIn) ?? Infinity) ? rename.before : id;

  // Walk the substitute chain until a block the target knows (guard against table cycles).
  let current = renamed;
  let keepProps = true;
  for (let hops = 0; hops < 8; hops++) {
    const info = BLOCK_INTRODUCED[current];
    if (!info || targetRank >= (mcVersionRank(info.in) ?? -Infinity)) {
      if (current === id) return { kind: 'keep' };
      if (current === renamed && rename) return { kind: 'rename', to: current };
      return { kind: 'substitute', to: current, keepProps };
    }
    if (!info.substitute) break;
    keepProps = keepProps && info.keepProps === true;
    current = info.substitute;
  }
  return { kind: 'substitute', to: STRUCTURE_VOID, keepProps: false };
}
