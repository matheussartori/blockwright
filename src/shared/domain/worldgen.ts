// Worldgen scaffolding shared by BOTH processes (no Node/electron). When a generated
// structure is exported into a mod workspace, a bare `.nbt` won't place itself in the
// world — Minecraft needs four worldgen JSON files alongside it (a jigsaw structure
// definition, a template pool, a structure set, and a biome tag). This module holds the
// presets the export UI offers and the PURE helpers (resource-name + folder convention +
// non-fs validation) that main and the renderer must agree on, so the preview the user
// sees and the files main writes can't drift.
import { mcVersionAtLeast, nearestVersionValue } from '../mc-version';
import {
  edgePoolLeaf,
  MAX_JIGSAW_DEPTH,
  MAX_RECONSTRUCT_SPAN,
  MAX_SPLIT_PIECES,
  pieceName,
  startPoolLeaf,
  type SplitPlan,
} from './split';

/** How a structure conforms to the ground it spawns on. Vanilla's terms; default
 *  `beard_thin` blends a foundation in like villages do. */
export type TerrainAdaptation = 'none' | 'beard_thin' | 'beard_box' | 'bury' | 'encapsulate';

export const TERRAIN_ADAPTATIONS: readonly TerrainAdaptation[] = [
  'none',
  'beard_thin',
  'beard_box',
  'bury',
  'encapsulate',
] as const;

/** A named bundle of biomes the structure is allowed to spawn in (→ the `has_structure`
 *  tag). Broad by default so a first export actually shows up — an empty biome match is
 *  the classic "it compiles but never generates" silent failure. */
export interface BiomePreset {
  id: string;
  biomes: string[];
}

export const BIOME_PRESETS: readonly BiomePreset[] = [
  {
    id: 'overworld_surface',
    biomes: [
      'minecraft:plains', 'minecraft:sunflower_plains', 'minecraft:meadow', 'minecraft:cherry_grove',
      'minecraft:forest', 'minecraft:flower_forest', 'minecraft:birch_forest',
      'minecraft:old_growth_birch_forest', 'minecraft:dark_forest', 'minecraft:taiga',
      'minecraft:old_growth_pine_taiga', 'minecraft:old_growth_spruce_taiga', 'minecraft:snowy_taiga',
      'minecraft:savanna', 'minecraft:savanna_plateau', 'minecraft:windswept_hills',
      'minecraft:windswept_forest', 'minecraft:windswept_gravelly_hills', 'minecraft:snowy_plains',
      'minecraft:grove', 'minecraft:jungle', 'minecraft:sparse_jungle', 'minecraft:bamboo_jungle',
      'minecraft:beach', 'minecraft:desert', 'minecraft:swamp', 'minecraft:mangrove_swamp',
    ],
  },
  {
    id: 'plains',
    biomes: ['minecraft:plains', 'minecraft:sunflower_plains', 'minecraft:meadow'],
  },
  {
    id: 'forest',
    biomes: [
      'minecraft:forest', 'minecraft:flower_forest', 'minecraft:birch_forest',
      'minecraft:old_growth_birch_forest', 'minecraft:dark_forest', 'minecraft:taiga',
    ],
  },
  {
    id: 'snowy',
    biomes: ['minecraft:snowy_plains', 'minecraft:snowy_taiga', 'minecraft:grove', 'minecraft:snowy_slopes'],
  },
];

/** How often the structure spawns, as a `spacing`/`separation` pair (chunks). `separation`
 *  must stay strictly below `spacing` or the structure never places. */
export interface RarityPreset {
  id: string;
  spacing: number;
  separation: number;
}

export const RARITY_PRESETS: readonly RarityPreset[] = [
  { id: 'common', spacing: 16, separation: 6 },
  { id: 'uncommon', spacing: 32, separation: 8 },
  { id: 'rare', spacing: 64, separation: 16 },
];

export const SPACING_MIN = 1;
export const SPACING_MAX = 256;

/** The worldgen plumbing the user chose in the export dialog. */
export interface WorldgenOptions {
  /** Write the four worldgen JSON files (so it generates in-world), or just drop the `.nbt`. */
  generate: boolean;
  terrainAdaptation: TerrainAdaptation;
  /** Biome ids the structure may spawn in (the `has_structure` tag values). */
  biomes: string[];
  spacing: number;
  separation: number;
}

export const DEFAULT_WORLDGEN: WorldgenOptions = {
  generate: false,
  terrainAdaptation: 'beard_thin',
  biomes: [...BIOME_PRESETS[0].biomes],
  spacing: 32,
  separation: 8,
};

/** Lowercase a free-typed name into a legal resource id (`My Tower!` → `my_tower`). */
export function sanitizeResourceName(raw: string): string {
  const s = raw
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '_')
    .replace(/^[_]+|[_]+$/g, '');
  return s || 'structure';
}

/** Whether a name is already a legal resource id (no normalization needed). */
export function isValidResourceName(raw: string): boolean {
  return /^[a-z0-9._-]+$/.test(raw);
}

/** The structure folder Minecraft reads for this version. Renamed `structures` →
 *  `structure` (singular) in 1.21 — using the wrong one is the #1 silent breakage when a
 *  pack moves between versions, so we pick it from the workspace's detected version.
 *  Year-numbered releases (26.x) rank above 1.21, so they resolve modern. */
export function structureFolder(version: string | null | undefined): 'structure' | 'structures' {
  // Unknown → assume modern.
  return mcVersionAtLeast(version, '1.21') ? 'structure' : 'structures';
}

/** Known release → data-pack `pack_format` pairs. The format number churns every drop
 *  (48 in 1.21.1 → 107 in 26.2); stamping a stale one makes the pack load with an
 *  "incompatible" warning — or, on strict readers, not at all. */
export const DATA_PACK_FORMATS: Record<string, number> = {
  '1.20.2': 18,
  '1.20.4': 26,
  '1.20.6': 41,
  '1.21.1': 48,
  '1.21.3': 57,
  '1.21.4': 61,
  '1.21.5': 71,
  '26.2': 107,
};

/** The data-pack `pack_format` to stamp for a target version: exact match, else the
 *  nearest OLDER known release's, else the 1.21.1 baseline (48). Pure, shared so the
 *  export writers and any preview agree. */
export function datapackFormatFor(version: string | null | undefined): number {
  return nearestVersionValue(DATA_PACK_FORMATS, version) ?? DATA_PACK_FORMATS['1.21.1'];
}

export type FileKind = 'nbt' | 'structure' | 'template_pool' | 'structure_set' | 'biome_tag' | 'piece';

/** One file the export will write, as a workspace-relative path. */
export interface PlannedFileSpec {
  /** Relative to the workspace root, e.g. `data/mymod/structure/tower.nbt`. */
  rel: string;
  kind: FileKind;
}

/** The exact set of files an export writes for these options — pure, so the dialog's
 *  preview tree and main's writer are computed from the same function. When `split` is an
 *  oversized plan, the structure is cut into a jigsaw assembly instead (many piece `.nbt`s +
 *  per-edge template pools); the worldgen JSON is mandatory there (the pieces can't reassemble
 *  without it), so it's emitted regardless of `worldgen.generate`. */
export function plannedFiles(
  namespace: string,
  name: string,
  version: string | null | undefined,
  worldgen: WorldgenOptions,
  split?: SplitPlan,
): PlannedFileSpec[] {
  if (split?.oversized) return splitFileSpecs(namespace, name, version, split).map((s) => ({ rel: s.rel, kind: s.kind }));

  const sf = structureFolder(version);
  const files: PlannedFileSpec[] = [{ rel: `data/${namespace}/${sf}/${name}.nbt`, kind: 'nbt' }];
  if (worldgen.generate) {
    files.push(
      { rel: `data/${namespace}/worldgen/structure/${name}.json`, kind: 'structure' },
      { rel: `data/${namespace}/worldgen/template_pool/${name}/start.json`, kind: 'template_pool' },
      { rel: `data/${namespace}/worldgen/structure_set/${name}.json`, kind: 'structure_set' },
      { rel: `data/${namespace}/tags/worldgen/biome/has_structure/${name}.json`, kind: 'biome_tag' },
    );
  }
  return files;
}

/** A planned file of a SPLIT export, tagged with what it represents so main's writer can fill
 *  the right content (a piece buffer, a pool pointing at a piece, the structure def, …) while
 *  the preview and the writer share the exact same path list. */
export interface SplitFileSpec extends PlannedFileSpec {
  ref:
    | { type: 'piece'; slot: number }
    | { type: 'start_pool' }
    | { type: 'edge_pool'; edgeId: string }
    | { type: 'structure' }
    | { type: 'structure_set' }
    | { type: 'biome_tag' };
}

/** The ordered file list for a split (jigsaw) export: one `.nbt` per piece, a start pool +
 *  one pool per tree edge, then the structure/structure_set/biome-tag JSON. Pure. */
export function splitFileSpecs(
  namespace: string,
  base: string,
  version: string | null | undefined,
  plan: SplitPlan,
): SplitFileSpec[] {
  const sf = structureFolder(version);
  const tp = `data/${namespace}/worldgen/template_pool/${base}`;
  const out: SplitFileSpec[] = [];
  for (const slot of plan.slots) {
    out.push({ rel: `data/${namespace}/${sf}/${base}/${pieceName(slot)}.nbt`, kind: 'piece', ref: { type: 'piece', slot: slot.index } });
  }
  out.push({ rel: `${tp}/${startPoolLeaf}.json`, kind: 'template_pool', ref: { type: 'start_pool' } });
  for (const edge of plan.edges) {
    out.push({ rel: `${tp}/${edgePoolLeaf(edge.edgeId)}.json`, kind: 'template_pool', ref: { type: 'edge_pool', edgeId: edge.edgeId } });
  }
  out.push(
    { rel: `data/${namespace}/worldgen/structure/${base}.json`, kind: 'structure', ref: { type: 'structure' } },
    { rel: `data/${namespace}/worldgen/structure_set/${base}.json`, kind: 'structure_set', ref: { type: 'structure_set' } },
    { rel: `data/${namespace}/tags/worldgen/biome/has_structure/${base}.json`, kind: 'biome_tag', ref: { type: 'biome_tag' } },
  );
  return out;
}

/** A reason the export can't proceed (`error`) or something to double-check (`warning`).
 *  Carries a stable `code` the renderer localizes — never a baked English string. */
export type IssueCode =
  | 'name_invalid'
  | 'separation_ge_spacing'
  | 'biomes_empty'
  | 'spacing_range'
  | 'overwrite'
  | 'legacy_folder'
  | 'no_workspace'
  | 'source_missing'
  | 'split_active'
  | 'split_too_many'
  | 'split_too_deep'
  | 'split_span'
  | 'split_block_entity';

export interface ValidationIssue {
  level: 'error' | 'warning';
  code: IssueCode;
  /** Optional context the renderer interpolates (e.g. the overwritten file's path). */
  detail?: string;
}

/** Split issues into the BLOCKING errors and the informational warnings (per-file overwrite
 *  warnings are shown as file badges, so they're excluded). The export GATE (`canExport`) and
 *  the preview LIST both derive from this, so the button and the message can't disagree. */
export function splitIssues(issues: ValidationIssue[]): { errors: ValidationIssue[]; warnings: ValidationIssue[] } {
  return {
    errors: issues.filter((i) => i.level === 'error'),
    warnings: issues.filter((i) => i.level === 'warning' && i.code !== 'overwrite'),
  };
}

/** Checks specific to a SPLIT (jigsaw) export. `split_active` is an informational note that
 *  the structure exceeds the size limit and is being cut up; the rest are hard limits of the
 *  jigsaw mechanism (piece count / recursion depth / reconstructable span). Pure — the
 *  per-cell block-entity-loss warning can only be known once main reads the blocks. */
export function validateSplit(plan: SplitPlan): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  if (!plan.oversized) return issues;
  issues.push({ level: 'warning', code: 'split_active', detail: String(plan.pieceCount) });
  if (plan.pieceCount > MAX_SPLIT_PIECES) issues.push({ level: 'error', code: 'split_too_many', detail: String(plan.pieceCount) });
  if (plan.depth + 1 > MAX_JIGSAW_DEPTH) issues.push({ level: 'error', code: 'split_too_deep', detail: String(plan.depth + 1) });
  if (Math.max(plan.size[0], plan.size[2]) > MAX_RECONSTRUCT_SPAN) {
    issues.push({ level: 'warning', code: 'split_span', detail: String(Math.max(plan.size[0], plan.size[2])) });
  }
  return issues;
}

/** The non-fs checks (name + worldgen numbers + biomes). Overwrite / missing-source /
 *  legacy-folder checks need the disk and are added by main's planner. */
export function validateOptions(name: string, worldgen: WorldgenOptions): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  if (!isValidResourceName(name)) issues.push({ level: 'error', code: 'name_invalid' });
  if (worldgen.generate) {
    if (worldgen.spacing < SPACING_MIN || worldgen.spacing > SPACING_MAX) {
      issues.push({ level: 'error', code: 'spacing_range' });
    }
    if (worldgen.separation >= worldgen.spacing) issues.push({ level: 'error', code: 'separation_ge_spacing' });
    if (worldgen.biomes.length === 0) issues.push({ level: 'error', code: 'biomes_empty' });
  }
  return issues;
}
