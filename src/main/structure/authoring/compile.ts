// Compile the Blockwright authoring JSON into a real gzip-compressed Minecraft
// `.nbt` structure file: validate → expand ops to blocks → run the post-processing
// passes → encode. This is the JSON→NBT step the knowledge base describes.
import fs from 'node:fs/promises';
import { structureFinalizers } from '../domain';
import { encodeStructure } from './nbt-encode';
import { resolveBlocks } from './ops';
import {
  carveStairwells, connectBlocks, fillInteriorAir, fixChimney, fixDoors, fixPlacement, insetStairs, runPasses, type Pass,
} from './passes';
import type { AuthoringStructure } from './types';
import { validateAuthoring } from './validate';

/** Informational result of the post-processing passes: auto-applied `fixes` (shown
 *  to the user/model) and `warnings` (left for the model to address next emit). */
export interface CompileReport {
  fixes: string[];
  warnings: string[];
}

/** Options threaded into compilation — notably the SELECTED structure-type id, so the
 *  pipeline can run that structure's declared finalize passes (e.g. the house's chimney
 *  fix). Omit for a context-free build (no structure-scoped passes run). */
export interface CompileOptions {
  structureType?: string;
}

/** Build the pass pipeline for a build. The ALWAYS-ON passes repair any structure;
 *  the STRUCTURE-SCOPED ones are gated by the selected structure module's declared
 *  `finalize` list (the modular "which fix applies to which structure" mapping):
 *  `'stairs'` (multi-storey) runs BEFORE carving so the headroom carve lands on the
 *  inset flight; `'chimney'` (house) runs after the shell is settled. */
function pipelineFor(structureType?: string): Pass[] {
  const fin = structureFinalizers(structureType);
  const passes: Pass[] = [];
  if (fin.includes('stairs')) passes.push(insetStairs);
  // Order matters: stairwells are carved before connections are derived; door hinges
  // are mirrored on the as-authored leaves; placement is fixed against the real blocks;
  // the interior air-fill runs last so it doesn't interfere with neighbour/support lookups.
  passes.push(carveStairwells, fixDoors, connectBlocks, fixPlacement);
  if (fin.includes('chimney')) passes.push(fixChimney);
  passes.push(fillInteriorAir);
  return passes;
}

/** Compile to a `.nbt` buffer plus the post-processing report. */
export function compileStructureReport(s: AuthoringStructure, opts?: CompileOptions): { buffer: Buffer; report: CompileReport } {
  validateAuthoring(s);
  const size = (s.size ?? [0, 0, 0]) as [number, number, number];
  // Expand volumetric ops → blocks (transform/roof ops may extend the palette), then
  // run the passes (structure-scoped finalizers + connections, stairwell headroom, air).
  const resolved = resolveBlocks(s);
  const ctx = { size, structureType: opts?.structureType };
  const result = runPasses(resolved.blocks, resolved.palette, ctx, pipelineFor(opts?.structureType));
  const buffer = encodeStructure({
    dataVersion: s.DataVersion ?? 3955,
    size,
    palette: result.palette,
    blocks: result.blocks,
    entities: s.entities ?? [],
  });
  return { buffer, report: { fixes: result.fixes ?? [], warnings: result.warnings ?? [] } };
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
