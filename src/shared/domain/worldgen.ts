// Worldgen scaffolding shared by BOTH processes (no Node/electron). When a generated
// structure is exported into a mod workspace, a bare `.nbt` won't place itself in the
// world — Minecraft needs four worldgen JSON files alongside it (a jigsaw structure
// definition, a template pool, a structure set, and a biome tag). This module holds the
// presets the export UI offers and the PURE helpers (resource-name + folder convention +
// non-fs validation) that main and the renderer must agree on, so the preview the user
// sees and the files main writes can't drift.
import { minorOf } from '../mc-version';

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
 *  pack moves between versions, so we pick it from the workspace's detected version. */
export function structureFolder(version: string | null | undefined): 'structure' | 'structures' {
  const minor = minorOf(version);
  if (!minor) return 'structure'; // unknown → assume modern
  const [major, min] = minor.split('.').map(Number);
  return major * 100 + min >= 121 ? 'structure' : 'structures';
}

export type FileKind = 'nbt' | 'structure' | 'template_pool' | 'structure_set' | 'biome_tag';

/** One file the export will write, as a workspace-relative path. */
export interface PlannedFileSpec {
  /** Relative to the workspace root, e.g. `data/mymod/structure/tower.nbt`. */
  rel: string;
  kind: FileKind;
}

/** The exact set of files an export writes for these options — pure, so the dialog's
 *  preview tree and main's writer are computed from the same function. */
export function plannedFiles(
  namespace: string,
  name: string,
  version: string | null | undefined,
  worldgen: WorldgenOptions,
): PlannedFileSpec[] {
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
  | 'source_missing';

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
