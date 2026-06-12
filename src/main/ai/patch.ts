// Merging a `patch`-mode emit onto its previous version. A patch reuses the prior
// build as its base and APPENDS new geometry: palette entries are append-only (so the
// indices the model references stay valid), and ops/blocks concatenate (later ops
// overwrite earlier cells at compile time). Size/DataVersion/entities/floors are
// inherited unless the patch restates them. Pure — the IO (reading the prior version
// off disk) lives in the caller (generate.ts).
import type { AuthoringOp, AuthoringStructure } from '../structure/authoring';
import { makeIntern } from '../structure/authoring/palette';

/** Remap every palette reference an op carries (`state`, plus the roof/stairs
 *  `fill`/`clear`) through `remap`. Ops without palette refs pass through unchanged. */
function remapOpStates(op: AuthoringOp, remap: (s: number) => number): AuthoringOp {
  const out = { ...op } as AuthoringOp & { state?: number; fill?: number; clear?: number };
  if (typeof out.state === 'number') out.state = remap(out.state);
  if (typeof out.fill === 'number') out.fill = remap(out.fill);
  if (typeof out.clear === 'number') out.clear = remap(out.clear);
  return out;
}

/**
 * Merge a `patch`-mode emit onto the previous version it builds on.
 *
 * The patch's palette is addressed as a CONTINUATION of the previous one (its entry
 * `j` is referenced as `prev.palette.length + j`). Models routinely re-send entries
 * the base already has, so each patch entry is interned against the merged palette
 * (dedup by name+props) and the patch's op/block indices in the continuation range
 * are remapped onto the interned slots — re-sent duplicates land back on the existing
 * entry instead of bloating the palette, and indices can never silently shift.
 * Indices below `prev.palette.length` reference the base palette and pass through.
 *
 * @param prev - The previous (full) authoring structure, read from the version scratch.
 * @param input - The patch the model just emitted (only NEW palette entries + ops/blocks).
 * @returns A complete authoring structure: `prev` with `input`'s palette/ops/blocks
 *   appended, and size/DataVersion/entities/floors taken from `input` when present, else
 *   inherited from `prev`.
 */
export function mergePatch(prev: AuthoringStructure, input: AuthoringStructure): AuthoringStructure {
  const base = (prev.palette ?? []).length;
  const palette = (prev.palette ?? []).slice();
  const intern = makeIntern(palette);
  const mapped = (input.palette ?? []).map((e) => intern(e));
  const remap = (s: number): number => (s >= base ? mapped[s - base] ?? s : s);
  return {
    DataVersion: input.DataVersion ?? prev.DataVersion,
    size: (input.size ?? prev.size) as [number, number, number],
    palette,
    ops: [...(prev.ops ?? []), ...(input.ops ?? []).map((o) => remapOpStates(o, remap))],
    blocks: [...(prev.blocks ?? []), ...(input.blocks ?? []).map((b) => ({ ...b, state: remap(b.state) }))],
    entities: input.entities ?? prev.entities,
    // Inherit the labelled storeys so a localized patch doesn't drop the grade
    // (and with it the basement's structure_void surround). See gradeFromFloors.
    floors: input.floors ?? prev.floors,
  };
}
