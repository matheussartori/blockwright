// The Worldgen Doctor: an on-demand check-up over the WHOLE active workspace's data
// pack — every structure def, template pool, structure set, biome tag and structure
// `.nbt` — surfacing the "my pack silently doesn't load / never generates" class of
// failure BEFORE launching the game (`/reload` doesn't even touch worldgen JSON, so
// each missed check costs a full leave-and-rejoin). One small function per RULE, all
// reporting through a shared DoctorRun context; findings carry stable codes the
// renderer localizes with a fix-it explanation (`doctor.issue.<code>`).
//
// Adding a rule = one `check*` function + a call in `doctorWorkspace` + its
// `doctor.issue.<code>` strings (en + pt-BR) + a case in doctor.test.ts.
import fs from 'node:fs';
import path from 'node:path';
import { datapackFormatFor, structureFolder } from '@/shared/domain/worldgen';
import { MAX_JIGSAW_ADAPTED_DISTANCE } from '@/shared/domain/split';
import type { Workspace, WorkspaceDoctorReport, DoctorFinding } from '@/shared/types';
import { getActiveWorkspace } from '../structure/assets/content-pack';
import { lintStructure, readLintRaw } from '../structure/lint';
import type { RawStructure } from '../structure/io/raw';

/** Every finding code the doctor can emit — TYPED, so a new rule must add its code here,
 *  and the i18n guard in doctor.test.ts then requires its `doctor.issue.<code>` string
 *  (the pt-BR side follows via the i18n coverage test). Keeps a typo'd/forgotten code
 *  from surfacing as a raw key in the dialog. */
export const DOCTOR_CODES = [
  'wrong_folder',
  'invalid_json',
  'invalid_nbt',
  'missing_spawn_overrides',
  'missing_pool',
  'distance_cap',
  'biomes_empty',
  'empty_set',
  'missing_structure_def',
  'separation_ge_spacing',
  'pool_empty',
  'missing_structure_file',
  'biome_tag_empty',
  'stale_format',
  'nbt_oversized',
  'waterlog_risk',
  'mob_equipment',
  // The per-file structure linter's codes (structure/lint.ts), re-reported here so a
  // workspace check-up covers every .nbt without opening each one.
  'suspect_air',
  'block_out_of_range',
  'orphan_palette',
  'bad_data_marker',
] as const;
export type DoctorCode = (typeof DOCTOR_CODES)[number];

/** The shared state a run's rule functions read and report into. */
interface DoctorRun {
  ws: Workspace;
  /** `data/<namespace>` under the workspace root. */
  dataDir: string;
  /** The structure folder THIS version reads (`structure` vs legacy `structures`). */
  sf: 'structure' | 'structures';
  /** Structure-def ids seen by `checkStructureDefs` (sets validate references against it). */
  defIds: Set<string>;
  /** Decoded `.nbt`s by absolute path (filled by `checkStructureFiles`, reused by the
   *  waterlog rule so each file is parsed once per run). */
  nbts: Map<string, RawStructure>;
  checked: number;
  findings: DoctorFinding[];
}

/** Recursively list files under `dir` with an extension (empty when dir is missing). */
function listFiles(dir: string, ext: string): string[] {
  if (!fs.existsSync(dir)) return [];
  const out: string[] = [];
  const walk = (d: string): void => {
    for (const entry of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, entry.name);
      if (entry.isDirectory()) walk(p);
      else if (entry.name.endsWith(ext)) out.push(p);
    }
  };
  walk(dir);
  return out;
}

function readJson(file: string): Record<string, unknown> | null {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8')) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function report(run: DoctorRun, level: DoctorFinding['level'], code: DoctorCode, file: string, detail?: string): void {
  run.findings.push({ level, code, file: path.relative(run.ws.root, file), ...(detail ? { detail } : {}) });
}

/** Walk one JSON-file family: count it, report `invalid_json`, hand valid ones on. */
function eachJson(run: DoctorRun, dir: string, visit: (file: string, json: Record<string, unknown>) => void): void {
  for (const file of listFiles(dir, '.json')) {
    run.checked++;
    const json = readJson(file);
    if (!json) report(run, 'error', 'invalid_json', file);
    else visit(file, json);
  }
}

/** Resolve a `ns:path` resource id to a file under the workspace, or null for a
 *  foreign namespace (vanilla/minecraft refs can't be checked against the mod). */
function resourceFile(run: DoctorRun, id: string, folder: string, ext: string): string | null {
  const [ns, rel] = id.includes(':') ? (id.split(':', 2) as [string, string]) : ['minecraft', id];
  if (ns !== run.ws.namespace) return null;
  return path.join(run.ws.root, 'data', ns, folder, rel + ext);
}

/** Folder-name drift: `.nbt`s sitting in the folder this MC version does NOT read. */
function checkStructureFolder(run: DoctorRun): void {
  const legacyDir = path.join(run.dataDir, run.sf === 'structure' ? 'structures' : 'structure');
  if (listFiles(legacyDir, '.nbt').length > 0) report(run, 'error', 'wrong_folder', legacyDir, run.sf);
}

/** Structure defs: the jigsaw codec's hard requirements + the never-generates traps. */
function checkStructureDefs(run: DoctorRun): void {
  eachJson(run, path.join(run.dataDir, 'worldgen', 'structure'), (file, json) => {
    run.defIds.add(`${run.ws.namespace}:${path.basename(file, '.json')}`);
    if (String(json.type ?? '') === 'minecraft:jigsaw') {
      // The 1.21+ codec REQUIRES spawn_overrides (even {}) — its absence fails the
      // whole datapack load with no in-game error.
      if (!('spawn_overrides' in json)) report(run, 'error', 'missing_spawn_overrides', file);
      const pool = typeof json.start_pool === 'string' ? json.start_pool : null;
      const poolFile = pool ? resourceFile(run, pool, 'worldgen/template_pool', '.json') : null;
      if (pool && poolFile && !fs.existsSync(poolFile)) report(run, 'error', 'missing_pool', file, pool);
      const dist = Number(json.max_distance_from_center ?? 80);
      if (String(json.terrain_adaptation ?? 'none') !== 'none' && dist > MAX_JIGSAW_ADAPTED_DISTANCE) {
        report(run, 'error', 'distance_cap', file, String(dist));
      }
    }
    if (Array.isArray(json.biomes) && json.biomes.length === 0) report(run, 'error', 'biomes_empty', file);
  });
}

/** Structure sets: placement math + every referenced def must exist. */
function checkStructureSets(run: DoctorRun): void {
  eachJson(run, path.join(run.dataDir, 'worldgen', 'structure_set'), (file, json) => {
    const structures = json.structures;
    if (!Array.isArray(structures) || structures.length === 0) {
      report(run, 'error', 'empty_set', file);
    } else {
      for (const s of structures as { structure?: string }[]) {
        const id = s?.structure;
        if (typeof id === 'string' && id.startsWith(`${run.ws.namespace}:`) && !run.defIds.has(id)) {
          report(run, 'error', 'missing_structure_def', file, id);
        }
      }
    }
    const placement = json.placement as Record<string, unknown> | undefined;
    const spacing = Number(placement?.spacing ?? NaN);
    const separation = Number(placement?.separation ?? NaN);
    if (Number.isFinite(spacing) && Number.isFinite(separation) && separation >= spacing) {
      report(run, 'error', 'separation_ge_spacing', file, `${separation} ≥ ${spacing}`);
    }
  });
}

/** Template pools: every element's structure must exist on disk. */
function checkTemplatePools(run: DoctorRun): void {
  eachJson(run, path.join(run.dataDir, 'worldgen', 'template_pool'), (file, json) => {
    const elements = Array.isArray(json.elements) ? (json.elements as { element?: { location?: string } }[]) : [];
    if (elements.length === 0) report(run, 'warning', 'pool_empty', file);
    for (const e of elements) {
      const loc = e?.element?.location;
      if (typeof loc !== 'string') continue;
      const nbt = resourceFile(run, loc, run.sf, '.nbt');
      if (nbt && !fs.existsSync(nbt)) report(run, 'error', 'missing_structure_file', file, loc);
    }
  });
}

/** Biome tags: an empty has_structure tag = "it compiles but never generates". */
function checkBiomeTags(run: DoctorRun): void {
  eachJson(run, path.join(run.dataDir, 'tags', 'worldgen', 'biome', 'has_structure'), (file, json) => {
    if (!Array.isArray(json.values) || json.values.length === 0) report(run, 'error', 'biome_tag_empty', file);
  });
}

/** pack.mcmeta (when the workspace ships one): a stale format loads with an
 *  "incompatible" warning — or not at all on strict readers. */
function checkPackMeta(run: DoctorRun): void {
  const meta = path.join(run.ws.root, 'pack.mcmeta');
  if (!fs.existsSync(meta)) return;
  run.checked++;
  const json = readJson(meta) as { pack?: { pack_format?: number } } | null;
  if (!json) {
    report(run, 'error', 'invalid_json', meta);
    return;
  }
  const format = json.pack?.pack_format;
  const expected = datapackFormatFor(run.ws.minecraftVersion);
  if (typeof format === 'number' && format < expected) {
    report(run, 'warning', 'stale_format', meta, `${format} → ${expected}`);
  }
}

/** Equipment slots a mob can carry. Vanilla RE-ROLLS equipment when a structure
 *  generates naturally (saved gear is not preserved) — the documented jigsaw gotcha. */
function entityHasEquipment(nbt: Record<string, unknown>): boolean {
  const lists = [nbt.ArmorItems, nbt.HandItems];
  if (lists.some((l) => Array.isArray(l) && l.some((it) => it && typeof it === 'object' && 'id' in (it as object)))) {
    return true;
  }
  // 1.21.5+ moved gear to a single `equipment` compound.
  const eq = nbt.equipment;
  return !!eq && typeof eq === 'object' && Object.keys(eq).length > 0;
}

/** Structure `.nbt`s: flag ones a vanilla Structure Block can't load whole, saved
 *  mob gear that natural generation would silently re-roll, and everything the
 *  per-file linter catches (air-vs-void, out-of-range blocks, orphans, markers). */
async function checkStructureFiles(run: DoctorRun): Promise<void> {
  for (const file of listFiles(path.join(run.dataDir, run.sf), '.nbt')) {
    run.checked++;
    try {
      const raw = await readLintRaw(file);
      run.nbts.set(file, raw);
      if (Math.max(...raw.size) > 48) report(run, 'warning', 'nbt_oversized', file, raw.size.join('×'));
      const armed = (raw.entities ?? []).find((e) => entityHasEquipment(e.nbt));
      if (armed) report(run, 'warning', 'mob_equipment', file, String(armed.nbt.id ?? ''));
      for (const f of lintStructure(raw, run.ws.minecraftVersion)) {
        report(run, f.level, f.code, file, f.detail);
      }
    } catch {
      report(run, 'error', 'invalid_nbt', file);
    }
  }
}

/** Biome refs that mean "this generates in/under water" — where vanilla hardcodes
 *  waterlogging of waterloggable blocks during generation. */
function isAquaticBiomeRef(ref: string): boolean {
  return /ocean|river|beach|swamp/.test(ref);
}

/** Jigsaw defs aimed at aquatic biomes whose start-pool pieces carry waterloggable
 *  blocks: vanilla force-waterlogs them below the surface, so dry interiors flood —
 *  a hardcoded behavior no `waterlogged=false` state survives. */
function checkWaterlogRisk(run: DoctorRun): void {
  eachJsonQuiet(run, path.join(run.dataDir, 'worldgen', 'structure'), (file, json) => {
    if (String(json.type ?? '') !== 'minecraft:jigsaw') return;
    const refs = biomeRefs(run, json.biomes);
    if (!refs.some(isAquaticBiomeRef)) return;
    const pool = typeof json.start_pool === 'string' ? json.start_pool : null;
    const poolFile = pool ? resourceFile(run, pool, 'worldgen/template_pool', '.json') : null;
    const poolJson = poolFile ? readJson(poolFile) : null;
    if (!poolJson) return;
    const elements = Array.isArray(poolJson.elements) ? (poolJson.elements as { element?: { location?: string } }[]) : [];
    for (const e of elements) {
      const loc = e?.element?.location;
      const nbtFile = typeof loc === 'string' ? resourceFile(run, loc, run.sf, '.nbt') : null;
      const a = nbtFile ? run.nbts.get(nbtFile) : null;
      const wet = a?.palette.find((p) => p.Properties && 'waterlogged' in p.Properties);
      if (wet) {
        report(run, 'warning', 'waterlog_risk', file, wet.Name);
        return;
      }
    }
  });
}

/** The biome refs a def declares: a string, an inline array, with own-namespace
 *  `#tags` expanded to their values (foreign tags stay as-is — still name-testable). */
function biomeRefs(run: DoctorRun, biomes: unknown): string[] {
  const raw = typeof biomes === 'string' ? [biomes] : Array.isArray(biomes) ? biomes.filter((b) => typeof b === 'string') : [];
  const out: string[] = [];
  for (const ref of raw as string[]) {
    out.push(ref);
    if (!ref.startsWith('#')) continue;
    const tagFile = resourceFile(run, ref.slice(1), 'tags/worldgen/biome', '.json');
    const tag = tagFile ? readJson(tagFile) : null;
    if (tag && Array.isArray(tag.values)) out.push(...(tag.values as unknown[]).filter((v): v is string => typeof v === 'string'));
  }
  return out;
}

/** Like eachJson but without counting/re-reporting — for second passes over a
 *  family another rule already counted (invalid files were already reported). */
function eachJsonQuiet(run: DoctorRun, dir: string, visit: (file: string, json: Record<string, unknown>) => void): void {
  for (const file of listFiles(dir, '.json')) {
    const json = readJson(file);
    if (json) visit(file, json);
  }
}

/** Run the doctor over the ACTIVE workspace (the IPC entry point). */
export async function runWorkspaceDoctor(): Promise<WorkspaceDoctorReport> {
  const ws = getActiveWorkspace();
  if (!ws) return { workspace: null, checkedFiles: 0, findings: [] };
  return doctorWorkspace(ws);
}

/**
 * Run every rule over one workspace's data pack.
 *
 * @returns The report: how many files were scanned + the findings (empty = all clear).
 */
export async function doctorWorkspace(ws: Workspace): Promise<WorkspaceDoctorReport> {
  const run: DoctorRun = {
    ws,
    dataDir: path.join(ws.root, 'data', ws.namespace),
    sf: structureFolder(ws.minecraftVersion),
    defIds: new Set(),
    nbts: new Map(),
    checked: 0,
    findings: [],
  };

  checkStructureFolder(run);
  checkStructureDefs(run); // fills defIds — must run before the sets check
  checkStructureSets(run);
  checkTemplatePools(run);
  checkBiomeTags(run);
  checkPackMeta(run);
  await checkStructureFiles(run); // fills nbts — must run before the waterlog rule
  checkWaterlogRisk(run);

  return { workspace: ws.name, checkedFiles: run.checked, findings: run.findings };
}
