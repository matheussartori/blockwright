// The structure linter: per-FILE authoring checks that don't need a workspace —
// suspicious air-vs-void semantics, blocks the target MC version doesn't know,
// orphaned palette entries, and data markers with nothing to say. Runs standalone
// over the open file (the Lint panel, via IPC) and inside the Doctor's workspace
// walk (each finding re-reported with its file). Positions ride along so the
// renderer can reveal a finding in the viewer with one click.
import fs from 'node:fs/promises';
import * as nbt from 'prismarine-nbt';
import type { LintFinding, LintReport } from '@/shared/types';
import type { RawBlock, RawEntity, RawPaletteEntry, RawStructure } from './io/raw';
import { decodeSchem } from './io/schematic';
import { decodeLitematic } from './io/litematica';
import { downgradeBlockId } from './mc-block-versions';

const AIR_NAMES = new Set(['minecraft:air', 'minecraft:cave_air', 'minecraft:void_air']);
const STRUCTURE_BLOCK = 'minecraft:structure_block';
/** Past this, per-marker findings stop being readable — summarize instead. */
const MARKER_CAP = 8;

/** Read a structure file for linting. Unlike `readAuthoring`/`readRaw`, the `.nbt`
 *  path keeps EXPLICIT AIR cells (the air-vs-void rule is about exactly those) and
 *  block-entity NBT (the data-marker rule reads it). */
export async function readLintRaw(filePath: string): Promise<RawStructure> {
  const buffer = await fs.readFile(filePath);
  const lower = filePath.toLowerCase();
  if (lower.endsWith('.schem')) return decodeSchem(buffer);
  if (lower.endsWith('.litematic')) return decodeLitematic(buffer);
  const { parsed } = await nbt.parse(buffer);
  const root = nbt.simplify(parsed) as {
    size?: number[];
    palette?: RawPaletteEntry[];
    blocks?: RawBlock[];
    entities?: { pos?: number[]; blockPos?: number[]; nbt?: Record<string, unknown> }[];
  };
  const entities: RawEntity[] = (root.entities ?? [])
    .filter((e) => Array.isArray(e.pos))
    .map((e) => ({
      pos: e.pos as [number, number, number],
      blockPos: (e.blockPos ?? e.pos) as [number, number, number],
      nbt: e.nbt ?? {},
    }));
  return {
    size: (root.size ?? [0, 0, 0]) as [number, number, number],
    palette: root.palette ?? [],
    blocks: root.blocks ?? [],
    entities,
  };
}

/** Explicit air ON the bounding-box boundary of a DENSE capture: on paste,
 *  `minecraft:air` CLEARS the world cell (void/omitted preserve it), so a captured
 *  shell of air around a build eats the terrain it lands on — the #1 "my paste
 *  carved a box into the hillside" surprise. Sparse builds are exempt (their air
 *  is the honest empty space around the shape, not a captured shell). */
function checkSuspectAir(raw: RawStructure, out: LintFinding[]): void {
  const [sx, sy, sz] = raw.size;
  const volume = sx * sy * sz;
  if (volume === 0 || raw.blocks.length / volume <= 0.5) return;
  const airStates = new Set(raw.palette.map((p, i) => (AIR_NAMES.has(p.Name) ? i : -1)));
  let count = 0;
  let first: [number, number, number] | undefined;
  for (const b of raw.blocks) {
    if (!airStates.has(b.state) || !b.pos) continue;
    const [x, y, z] = b.pos;
    if (x === 0 || y === 0 || z === 0 || x === sx - 1 || y === sy - 1 || z === sz - 1) {
      count++;
      first ??= b.pos;
    }
  }
  if (count > 0) out.push({ level: 'warning', code: 'suspect_air', detail: String(count), pos: first });
}

/** Blocks the target MC version doesn't know under that id: vanilla silently loads
 *  them as air, which is exactly the "downgrade loses blocks" trap. The downgrader
 *  registry doubles as the existence oracle (a non-`keep` decision = unknown id at
 *  the target, with a curated stand-in to suggest). */
function checkBlockRange(raw: RawStructure, targetVersion: string, out: LintFinding[]): void {
  const seen = new Set<string>();
  for (const b of raw.blocks) {
    const entry = raw.palette[b.state];
    if (!entry || seen.has(entry.Name)) continue;
    seen.add(entry.Name);
    const decision = downgradeBlockId(entry.Name, targetVersion);
    if (decision.kind === 'keep') continue;
    out.push({
      level: 'warning',
      code: 'block_out_of_range',
      detail: `${entry.Name} → ${decision.to}`,
      pos: b.pos,
    });
  }
}

/** Palette entries no block references — harmless in-game but pure bloat, and a
 *  frequent symptom of a buggy exporter upstream. */
function checkOrphanPalette(raw: RawStructure, out: LintFinding[]): void {
  const used = new Set(raw.blocks.map((b) => b.state));
  const orphans = raw.palette.map((p, i) => (used.has(i) ? null : p.Name)).filter((n): n is string => n !== null);
  if (orphans.length === 0) return;
  const shown = orphans.slice(0, 3).join(', ');
  const detail = orphans.length > 3 ? `${shown} +${orphans.length - 3}` : shown;
  out.push({ level: 'warning', code: 'orphan_palette', detail });
}

/** Data-mode structure blocks whose `metadata` is missing/empty: the mode says "a
 *  mod reads a payload here" but there is no payload — a marker the author forgot
 *  to fill (or an editor wiped). */
function checkDataMarkers(raw: RawStructure, out: LintFinding[]): void {
  let reported = 0;
  for (const b of raw.blocks) {
    const entry = raw.palette[b.state];
    const bnbt = b.nbt ?? {};
    const isStructureBlock = entry?.Name === STRUCTURE_BLOCK || bnbt.id === STRUCTURE_BLOCK;
    if (!isStructureBlock) continue;
    const mode = bnbt.mode ?? entry?.Properties?.mode;
    if (typeof mode !== 'string' || mode.toLowerCase() !== 'data') continue;
    if (typeof bnbt.metadata === 'string' && bnbt.metadata !== '') continue;
    if (reported++ >= MARKER_CAP) break;
    out.push({ level: 'warning', code: 'bad_data_marker', detail: b.pos?.join(', '), pos: b.pos });
  }
}

/**
 * Run every lint rule over a decoded structure.
 *
 * @param raw           The structure (air + block-entity NBT preserved — use `readLintRaw`).
 * @param targetVersion The MC version the file should work on (workspace / content pack),
 *                      or null to skip the block-range rule.
 * @returns Findings in rule order (empty = clean).
 */
export function lintStructure(raw: RawStructure, targetVersion: string | null): LintFinding[] {
  const out: LintFinding[] = [];
  checkSuspectAir(raw, out);
  if (targetVersion) checkBlockRange(raw, targetVersion, out);
  checkOrphanPalette(raw, out);
  checkDataMarkers(raw, out);
  return out;
}

/** Lint a structure file on disk (the IPC entry point). */
export async function lintStructureFile(filePath: string, targetVersion: string | null): Promise<LintReport> {
  return { findings: lintStructure(await readLintRaw(filePath), targetVersion) };
}
