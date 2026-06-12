// Compile the Blockwright authoring JSON into a real gzip-compressed Minecraft
// `.nbt` structure file: validate → expand ops to blocks → run the post-processing
// passes → encode. This is the JSON→NBT step the knowledge base describes.
import fs from 'node:fs/promises';
import { structureFinalizers } from '../domain';
import { gradeFromFloors, type FloorRange } from './floors';
import { encodeStructure } from './nbt-encode';
import { resolveBlocks } from './ops';
import {
  connectBlocks, fillInteriorAir, fixChimney, fixCirculation, fixDoors, fixPlacement, preserveShell, rebuildStairwells, runPasses,
  type Pass, type ShellLockCell,
} from './passes';
import type { AuthoringBlock, AuthoringPaletteEntry, AuthoringStructure } from './types';
import { validateAuthoring } from './validate';

/** Informational result of a compile: auto-applied `fixes` (shown to the user/model),
 *  `warnings` (left for the model to address next emit — op-expansion warnings like a
 *  skipped basement, then pass warnings), and the FINAL post-pass `blocks`/`palette`
 *  exactly as encoded into the `.nbt` (including the explicit interior-air cells) — so
 *  a caller needing stats or metadata never re-expands the ops. */
export interface CompileReport {
  fixes: string[];
  warnings: string[];
  blocks: AuthoringBlock[];
  palette: AuthoringPaletteEntry[];
}

/** Options threaded into compilation — notably the SELECTED structure-type id, so the
 *  pipeline can run that structure's declared finalize passes (e.g. the house's chimney
 *  fix). Omit for a context-free build (no structure-scoped passes run). */
export interface CompileOptions {
  structureType?: string;
  /** The user's Floor plan (UI) for this build. When present it OVERRIDES the storeys
   *  the model declared in `structure.floors` for grade detection (see the air-fill).
   *  Omit to use the model's own floors. */
  floors?: FloorRange[];
  /** Optional sink for the per-pass code-fix play-by-play (the AI Console dock).
   *  Omit for context-free compiles (catalog/module previews) so they stay quiet. */
  log?: (message: string) => void;
  /** The protected SHELL cells of a seeded structure — `preserveShell`
   *  restores any of these the model deleted. Omit for everything else (the pass no-ops). */
  lockCells?: ShellLockCell[];
}

/** Build the pass pipeline for a build. Most passes are ALWAYS-ON; the only
 *  STRUCTURE-SCOPED one left is `'chimney'` (house), gated by the selected structure
 *  module's declared `finalize` list.
 *
 *  `rebuildStairwells` OWNS all vertical circulation: it is always-on and
 *  self-gating (it engages only when it finds ≥2 storey floor planes and a real
 *  climbing flight/ladder to rebuild), so it works on free-form AI builds too — no
 *  stairs finalizer needed. */
function pipelineFor(structureType?: string): Pass[] {
  const passes: Pass[] = [];
  // The shell lock runs FIRST (no-op unless `lockCells` is supplied): it re-asserts the
  // code-built exterior the AI deleted, so the floor/roof/walls are whole BEFORE the rest.
  // Order matters: vertical circulation is rebuilt next (so the openings/landings it
  // cuts are in place); door hinges are mirrored on the as-authored leaves; placement
  // is fixed against the real blocks (and drops orphan door halves / floating
  // railings); circulation cleanup (drop stray ladders / cap orphan floor holes) runs
  // once everything has settled. Connection sides are derived AFTER every pass that
  // adds/removes blocks (placement carves, circulation caps, the chimney rebuilds its
  // flue) so no pane/fence/wall is left with a baked side pointing at a removed
  // neighbour; the interior air-fill runs last so it doesn't interfere with
  // neighbour/support lookups.
  passes.push(preserveShell, rebuildStairwells, fixDoors, fixPlacement, fixCirculation);
  if (structureFinalizers(structureType).includes('chimney')) passes.push(fixChimney);
  passes.push(connectBlocks, fillInteriorAir);
  return passes;
}

/** Compile to a `.nbt` buffer plus the post-processing report. */
export function compileStructureReport(s: AuthoringStructure, opts?: CompileOptions): { buffer: Buffer; report: CompileReport } {
  validateAuthoring(s);
  const size = (s.size ?? [0, 0, 0]) as [number, number, number];
  // Expand volumetric ops → blocks (transform/roof ops may extend the palette), then
  // run the passes (structure-scoped finalizers + connections, stairwell headroom, air).
  const resolved = resolveBlocks(s);
  // Grade (ground-floor level) for the air-fill: the user's Floor plan wins when
  // defined, else the storeys the model labelled in the build itself.
  const grade = gradeFromFloors(opts?.floors?.length ? opts.floors : s.floors);
  const ctx = { size, structureType: opts?.structureType, grade, log: opts?.log, lockCells: opts?.lockCells };
  const result = runPasses(resolved.blocks, resolved.palette, ctx, pipelineFor(opts?.structureType));
  const buffer = encodeStructure({
    dataVersion: s.DataVersion ?? 3955,
    size,
    palette: result.palette,
    blocks: result.blocks,
    entities: s.entities ?? [],
  });
  return {
    buffer,
    report: {
      fixes: result.fixes ?? [],
      warnings: [...resolved.warnings, ...(result.warnings ?? [])],
      blocks: result.blocks,
      palette: result.palette,
    },
  };
}

/** Compile to a gzip-compressed `.nbt` buffer (Java big-endian). */
export function compileStructure(s: AuthoringStructure, opts?: CompileOptions): Buffer {
  return compileStructureReport(s, opts).buffer;
}

/** Compile and write the authoring JSON to `filePath`, returning the report. */
export async function writeStructureFile(s: AuthoringStructure, filePath: string, opts?: CompileOptions): Promise<CompileReport> {
  const { buffer, report } = compileStructureReport(s, opts);
  await fs.writeFile(filePath, buffer);
  return report;
}
