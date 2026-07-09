// Pure compositing of PENDING world edits over a streamed ChunkRenderPayload — the renderer-side
// half of in-world editing. Edits stay local (per-cell records) until "Save to World"; at mesh
// time this overlays them onto a CLONE of the chunk's cached payload, so the original (what main
// sent) is never mutated and discarding edits is just a re-mesh. Unit-tested (no Three/IO).
import type { ChunkRenderPayload, ChunkSectionPayload, PaletteEntry } from '@/shared/types';

/** One pending edit at an absolute world position. `name`/`properties` are the NBT-shaped state
 *  (what crosses IPC on save); air = `minecraft:air`. */
export interface PendingWorldEdit {
  x: number;
  y: number;
  z: number;
  name: string;
  properties?: Record<string, string>;
  /** Full block-entity NBT (with `id`) the Place tool carries for this cell — chest contents
   *  survive the paste. Painting/erasing over the cell replaces the record (and so drops it),
   *  which is exactly vanilla's "changed block loses its block entity" semantics. */
  blockEntity?: Record<string, unknown>;
}

/** A renderable palette entry + its texture keys for one painted block state (from
 *  `api.resolveBlock`, cached by state key in the world-edit store). */
export interface ResolvedWorldBlock {
  entry: PaletteEntry;
  textures: string[];
}

export const AIR = 'minecraft:air';

/** Canonical key for a block state (name + sorted props) — the resolution cache key. */
export function stateKeyOf(name: string, properties?: Record<string, string>): string {
  if (!properties || !Object.keys(properties).length) return name;
  const inner = Object.keys(properties)
    .sort()
    .map((k) => `${k}=${properties[k]}`)
    .join(',');
  return `${name}[${inner}]`;
}

export const cellKeyOf = (x: number, y: number, z: number): string => `${x},${y},${z}`;

/** The `"cx,cz"` chunk key holding a world column — matches WorldView's chunk keying. */
export function chunkKeyOf(x: number, z: number): string {
  return `${Math.floor(x / 16)},${Math.floor(z / 16)}`;
}

/** A flat-render air entry (composited air renders as a hole, like any air in the palette). */
const AIR_ENTRY: PaletteEntry = { name: AIR, models: [], color: [0, 0, 0], air: true };

/** Palette index of `key` in `palette`, or -1. Uses each entry's own name+properties. */
function paletteIndexOf(palette: PaletteEntry[], key: string): number {
  for (let i = 0; i < palette.length; i++) {
    if (stateKeyOf(palette[i].name, palette[i].properties) === key) return i;
  }
  return -1;
}

/**
 * Overlay pending edits onto a chunk payload.
 *
 * @param payload  The cached payload from main (NEVER mutated).
 * @param edits    The pending edits that fall inside THIS chunk (caller filters by chunk).
 * @param resolved Renderable entries per state key. An edit whose state isn't resolved yet is
 *   skipped (it composites on the next re-mesh, after resolution lands).
 * @returns A new payload with the edits applied — or the ORIGINAL payload (same reference) when
 *   nothing applied, so the mesher can skip texture-list rebuilding.
 */
export function compositePayload(
  payload: ChunkRenderPayload,
  edits: PendingWorldEdit[],
  resolved: Record<string, ResolvedWorldBlock>,
): ChunkRenderPayload {
  if (!edits.length) return payload;

  const palette = [...payload.palette];
  const textureKeys = new Set(payload.textureKeys);
  const sections = new Map<number, ChunkSectionPayload>();
  for (const s of payload.sections) sections.set(s.sectionY, s);
  const touched = new Map<number, ChunkSectionPayload>();
  let applied = false;

  /** Palette index for a state key, appending the resolved entry (and its textures) on a miss. */
  const indexFor = (key: string, name: string): number => {
    if (name === AIR) {
      const existing = palette.findIndex((p) => p.air);
      if (existing >= 0) return existing;
      palette.push(AIR_ENTRY);
      return palette.length - 1;
    }
    const existing = paletteIndexOf(palette, key);
    if (existing >= 0) return existing;
    const res = resolved[key];
    if (!res) return -1; // not resolved yet — skip this edit for now
    palette.push(res.entry);
    for (const t of res.textures) textureKeys.add(t);
    return palette.length - 1;
  };

  for (const e of edits) {
    const sy = Math.floor(e.y / 16);
    const idx = indexFor(stateKeyOf(e.name, e.properties), e.name);
    if (idx < 0) continue;

    let section = touched.get(sy);
    if (!section) {
      const original = sections.get(sy);
      // Expand to a writable 4096-cell grid: a uniform section's fill, an absent section's air.
      const blocks = new Uint16Array(4096);
      if (original?.blocks) blocks.set(original.blocks);
      else if (original?.uniform) blocks.fill(original.fill);
      else {
        const air = indexFor(AIR, AIR);
        if (air !== 0) blocks.fill(air);
      }
      section = { sectionY: sy, blocks, uniform: false, fill: 0 };
      touched.set(sy, section);
      sections.set(sy, section);
    }
    const lx = ((e.x % 16) + 16) % 16;
    const ly = ((e.y % 16) + 16) % 16;
    const lz = ((e.z % 16) + 16) % 16;
    section.blocks![ly * 256 + lz * 16 + lx] = idx;
    applied = true;
  }

  if (!applied) return payload;
  return {
    ...payload,
    palette,
    textureKeys: [...textureKeys],
    sections: [...sections.values()].sort((a, b) => a.sectionY - b.sectionY),
    empty: false,
  };
}
