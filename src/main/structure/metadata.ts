// The `.bw.json` METADATA SIDECAR: a compact, human-readable snapshot of everything
// the AI needs to know about an `.nbt` before it edits it — the size, the block count,
// the dominant palette, and the recognised storeys (see `detectFloors`). The app used
// to make the user describe the floor plan by hand; now it recognises the build and
// writes this file so a follow-up like "add a window to the second floor" maps to a
// real y range without the user spelling it out.
//
// WHERE it lives (per the product decision):
//   • A file OPENED from outside the generated library → the sidecar goes to a TEMP
//     dir (we don't pollute the user's own folder with a file they didn't ask for).
//   • A file inside the library, or a build the user then ASKS to alter → the sidecar
//     sits next to the `.nbt` in its library folder (and the temp copy is removed).
import { app } from 'electron';
import { createHash } from 'node:crypto';
import fsp from 'node:fs/promises';
import path from 'node:path';
import type { FloorDef, StructureData } from '@/shared/types';
import { detectFloors } from '@/shared/structure/detect-floors';
import { getOutputDir } from '../ai/output-dir';

/** Sidecar extension. A build `cottage.nbt` gets `cottage.bw.json` beside it. */
export const METADATA_EXT = '.bw.json';

/** The metadata snapshot written alongside an `.nbt`. Versioned (`schema`) so the
 *  shape can grow without breaking older readers. */
export interface StructureMetadata {
  schema: 1;
  /** ISO timestamp this snapshot was written. */
  generatedAt: string;
  /** The structure's display name (file stem). */
  name: string;
  /** Absolute path of the `.nbt` this describes. */
  source: string;
  /** Build size `[X, Y, Z]`. */
  size: [number, number, number];
  /** Total solid (non-air) blocks. */
  blockCount: number;
  /** The dominant palette: block id → count, most-used first (capped). */
  palette: { name: string; count: number }[];
  /** The recognised storeys (auto-detected, possibly user-corrected). */
  floors: FloorDef[];
}

/** How many palette entries to keep in the snapshot (the long tail isn't useful
 *  guidance and just bloats the file). */
const PALETTE_CAP = 40;

/** Inputs for {@link buildMetadata} — decoupled from any one block representation, so
 *  both the loaded {@link StructureData} and the compiler's resolved blocks can feed it. */
export interface MetadataInput {
  name: string;
  source: string;
  size: [number, number, number];
  /** Every solid (non-air) cell — drives floor detection when `floors` is omitted. */
  solids: [number, number, number][];
  /** Block id → count (air excluded). */
  paletteCounts: Map<string, number>;
  /** Explicit storeys (e.g. the user's corrected plan); auto-detected from `solids`
   *  when omitted. */
  floors?: FloorDef[];
}

/** Assemble a {@link StructureMetadata} snapshot. Pure (no IO): floors are taken as
 *  given or detected from the solids; the palette is the top {@link PALETTE_CAP} ids. */
export function buildMetadata(input: MetadataInput): StructureMetadata {
  const palette = [...input.paletteCounts.entries()]
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, PALETTE_CAP);
  const floors = input.floors?.length ? input.floors : detectFloors({ size: input.size, solids: input.solids });
  return {
    schema: 1,
    generatedAt: new Date().toISOString(),
    name: input.name,
    source: input.source,
    size: input.size,
    blockCount: input.solids.length,
    palette,
    floors,
  };
}

/** Build a snapshot from a fully-loaded {@link StructureData} (the renderer-facing
 *  shape main parses on open). Air blocks are dropped via the palette's `air` flag. */
export function metadataFromStructure(data: StructureData, floors?: FloorDef[]): StructureMetadata {
  const solids: [number, number, number][] = [];
  const counts = new Map<string, number>();
  for (const b of data.blocks) {
    const entry = data.palette[b.state];
    if (!entry || entry.air) continue;
    solids.push(b.pos);
    counts.set(entry.name, (counts.get(entry.name) ?? 0) + 1);
  }
  return buildMetadata({
    name: data.name,
    source: data.path,
    size: data.size,
    solids,
    paletteCounts: counts,
    floors,
  });
}

/** Is `p` inside the user's generated-structure library (so its sidecar belongs
 *  beside it rather than in a temp dir)? */
export function isInsideLibrary(p: string): boolean {
  const root = path.resolve(getOutputDir());
  const rel = path.relative(root, path.resolve(p));
  return rel !== '' && !rel.startsWith('..') && !path.isAbsolute(rel);
}

/** The sidecar path beside an `.nbt` (same dir, stem + `.bw.json`). */
export function librarySidecarPath(nbtPath: string): string {
  const dir = path.dirname(nbtPath);
  const stem = path.basename(nbtPath).replace(/\.nbt$/i, '');
  return path.join(dir, `${stem}${METADATA_EXT}`);
}

/** A deterministic temp sidecar path for a `source` opened from outside the library
 *  (hashed so re-opening the same file overwrites its cached snapshot). */
export function tempSidecarPath(source: string): string {
  const hash = createHash('sha1').update(path.resolve(source)).digest('hex').slice(0, 16);
  const stem = path.basename(source).replace(/\.nbt$/i, '');
  return path.join(app.getPath('temp'), 'blockwright-metadata', `${stem}-${hash}${METADATA_EXT}`);
}

/** Write a snapshot to `jsonPath` (creating parent dirs). Best-effort: a failed write
 *  just means the AI works without the sidecar, never an aborted open/build. */
export async function writeMetadataJson(jsonPath: string, meta: StructureMetadata): Promise<void> {
  try {
    await fsp.mkdir(path.dirname(jsonPath), { recursive: true });
    await fsp.writeFile(jsonPath, JSON.stringify(meta, null, 2));
  } catch {
    /* sidecar is an optimisation, not a requirement */
  }
}

/** Remove the temp sidecar for `source`, if any (after it's been promoted into the
 *  library folder on the first alteration). Best-effort. */
export async function removeTempMetadata(source: string): Promise<void> {
  try {
    await fsp.rm(tempSidecarPath(source), { force: true });
  } catch {
    /* nothing to clean up */
  }
}

/** Write the load-time sidecar for a just-opened structure: beside it when it lives in
 *  the library, else in the temp dir (don't pollute the user's folder).
 *  @returns The path written, or null on failure. */
export async function writeLoadMetadata(meta: StructureMetadata): Promise<string | null> {
  const jsonPath = isInsideLibrary(meta.source) ? librarySidecarPath(meta.source) : tempSidecarPath(meta.source);
  await writeMetadataJson(jsonPath, meta);
  return jsonPath;
}
