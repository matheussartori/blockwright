// Compile the Blockwright authoring JSON into a real gzip-compressed Minecraft
// `.nbt` structure file: validate → expand ops to blocks → run the post-processing
// passes → encode. This is the JSON→NBT step the knowledge base describes.
import fs from 'node:fs/promises';
import { encodeStructure } from './nbt-encode';
import { resolveBlocks } from './ops';
import { carveStairwells, connectBlocks, fillInteriorAir, fixDoors, fixPlacement, runPasses, type Pass } from './passes';
import type { AuthoringStructure } from './types';
import { validateAuthoring } from './validate';

/** Informational result of the post-processing passes: auto-applied `fixes` (shown
 *  to the user/model) and `warnings` (left for the model to address next emit). */
export interface CompileReport {
  fixes: string[];
  warnings: string[];
}

// Order matters: stairwells are carved before connections are derived; door hinges
// are mirrored on the as-authored leaves; placement is fixed against the real blocks;
// the interior air-fill runs last so it doesn't interfere with neighbour/support
// lookups.
const PIPELINE: Pass[] = [carveStairwells, fixDoors, connectBlocks, fixPlacement, fillInteriorAir];

/** Compile to a `.nbt` buffer plus the post-processing report. */
export function compileStructureReport(s: AuthoringStructure): { buffer: Buffer; report: CompileReport } {
  validateAuthoring(s);
  const size = (s.size ?? [0, 0, 0]) as [number, number, number];
  // Expand volumetric ops → blocks (transform/roof ops may extend the palette),
  // then run the passes (connections, stairwell headroom, interior air).
  const resolved = resolveBlocks(s);
  const result = runPasses(resolved.blocks, resolved.palette, { size }, PIPELINE);
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
export function compileStructure(s: AuthoringStructure): Buffer {
  return compileStructureReport(s).buffer;
}

/** Compile and write the authoring JSON to `filePath`, returning the report. */
export async function writeStructureFile(s: AuthoringStructure, filePath: string): Promise<CompileReport> {
  const { buffer, report } = compileStructureReport(s);
  await fs.writeFile(filePath, buffer);
  return report;
}
