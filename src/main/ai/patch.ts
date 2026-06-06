// Merging a `patch`-mode emit onto its previous version. A patch reuses the prior
// build as its base and APPENDS new geometry: palette entries are append-only (so the
// indices the model references stay valid), and ops/blocks concatenate (later ops
// overwrite earlier cells at compile time). Size/DataVersion/entities/floors are
// inherited unless the patch restates them. Pure — the IO (reading the prior version
// off disk) lives in the caller (generate.ts).
import type { AuthoringStructure } from '../structure/authoring';

/**
 * Merge a `patch`-mode emit onto the previous version it builds on.
 *
 * @param prev - The previous (full) authoring structure, read from the version scratch.
 * @param input - The patch the model just emitted (only NEW palette entries + ops/blocks).
 * @returns A complete authoring structure: `prev` with `input`'s palette/ops/blocks
 *   appended, and size/DataVersion/entities/floors taken from `input` when present, else
 *   inherited from `prev`.
 */
export function mergePatch(prev: AuthoringStructure, input: AuthoringStructure): AuthoringStructure {
  return {
    DataVersion: input.DataVersion ?? prev.DataVersion,
    size: (input.size ?? prev.size) as [number, number, number],
    palette: [...(prev.palette ?? []), ...(input.palette ?? [])],
    ops: [...(prev.ops ?? []), ...(input.ops ?? [])],
    blocks: [...(prev.blocks ?? []), ...(input.blocks ?? [])],
    entities: input.entities ?? prev.entities,
    // Inherit the labelled storeys so a localized patch doesn't drop the grade
    // (and with it the basement's structure_void surround). See gradeFromFloors.
    floors: input.floors ?? prev.floors,
  };
}
