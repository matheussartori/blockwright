// Surgical chunk-NBT patching — the heart of the safe write path. Works on the TAG-TYPED tree
// (see `nbt-tree.ts`): only the tags we own are replaced (`sections[].block_states`,
// `block_entities`, the light/heightmap staleness flags); everything else — biomes, ticks,
// `structures`, mod tags — rides through untouched. Never rebuild a chunk from the render
// model: that's the lossy-projection trap the reference tools fell into.
//
// Game-side contracts honoured here (each counters a documented corruption class):
//   • BlockLight/SkyLight are STRIPPED from edited sections and `isLightOn` is zeroed — the
//     game relights on load. We never compute light (impossible for mod blocks).
//   • `Heightmaps` is DELETED on edited chunks — vanilla re-primes missing maps on load.
//   • Only `Status: full` chunks with a KNOWN DataVersion are editable; the DataVersion is
//     preserved per chunk, never bumped.
import type { RawPaletteEntry } from '../../structure/io/raw';
import { AIR } from '../../structure/io/raw';
import { bitsForBlockStates, pairsToBig, unpackNonSpanning } from '../../structure/io/long-bits';
import { DATA_VERSIONS } from '../../structure/mc-data-version';
import { inferCompound } from '../../structure/authoring/nbt-encode';
import {
  byteTag,
  cloneTag,
  compoundItems,
  compoundListTag,
  compoundOf,
  compoundTag,
  intTag,
  longArrayPairs,
  longArrayTag,
  numberOf,
  stringOf,
  stringTag,
  type Compound,
  type Tag,
} from './nbt-tree';
import { packSectionCells, SECTION_VOLUME } from './section-pack';

/** One block placement/removal at an ABSOLUTE world position. Air is an edit like any other
 *  (an explicit `minecraft:air` cell). */
export interface WorldBlockEdit {
  x: number;
  y: number;
  z: number;
  state: RawPaletteEntry;
  /** Block-entity NBT for the new block (must carry `id`; x/y/z are stamped from the edit
   *  position). `null`/omitted ⇒ any existing block entity at the cell is removed — a changed
   *  block never keeps a stale chest/spawner record. */
  blockEntity?: Record<string, unknown> | null;
}

/** First DataVersion the editor accepts: 1.18 (2860) — root `sections`, non-spanning packing.
 *  Older chunks VIEW fine but are refused for writing. */
export const MIN_EDIT_DATA_VERSION = 2860;

/** Newest DataVersion we know (from the release registry). A chunk NEWER than this is refused —
 *  we can't guarantee its format hasn't moved under us. */
export const MAX_KNOWN_DATA_VERSION = Math.max(...Object.values(DATA_VERSIONS));

/**
 * The edit gate: why this chunk can't be edited, or null when it can.
 * Proto chunks (`Status` ≠ full) and unknown DataVersions are refused per chunk — the view
 * stays fine, the write path just won't touch them.
 */
export function chunkEditGate(root: Tag): string | null {
  const value = compoundOf(root);
  if (!value) return 'chunk NBT root is not a compound';
  const dv = numberOf(value.DataVersion);
  if (dv === null) return 'chunk has no DataVersion';
  if (dv < MIN_EDIT_DATA_VERSION) return `DataVersion ${dv} predates 1.18 — editing needs the modern chunk format`;
  if (dv > MAX_KNOWN_DATA_VERSION) return `DataVersion ${dv} is newer than this Blockwright knows — refusing to write`;
  const status = stringOf(value.Status);
  const bare = status?.replace(/^minecraft:/, '');
  if (bare !== 'full') return `chunk is not fully generated (Status: ${status ?? 'missing'})`;
  if (compoundItems(value.sections).length === 0) return 'chunk has no sections';
  return null;
}

/** Mark a chunk's light stale WITHOUT touching its blocks — applied to the 8 neighbors of every
 *  edited chunk (border light would otherwise stay stale; the game relights on load). */
export function markLightStale(root: Tag): void {
  const value = compoundOf(root);
  if (value) value.isLightOn = byteTag(0);
}

export interface PatchOutcome {
  /** Section Y indices whose blocks changed (drives the POI invalidation). */
  editedSectionYs: number[];
}

/**
 * Apply block edits to one chunk's tag-typed NBT tree, IN PLACE.
 *
 * Callers must run `chunkEditGate` first; this throws (never partially writes concepts to disk —
 * the throw refuses the whole chunk) on out-of-bounds edits or a malformed section.
 *
 * @param root  The parsed chunk root tag (mutated).
 * @param edits Edits whose positions all fall inside this chunk column.
 * @returns The section Ys that were repacked.
 */
export function patchChunkNbt(root: Tag, edits: WorldBlockEdit[]): PatchOutcome {
  const value = compoundOf(root);
  if (!value) throw new Error('chunk NBT root is not a compound');
  const cx = numberOf(value.xPos) ?? 0;
  const cz = numberOf(value.zPos) ?? 0;

  const sections = compoundItems(value.sections);
  const byY = new Map<number, Compound>();
  let maxSectionY = -Infinity;
  for (const s of sections) {
    const y = numberOf(s.Y);
    if (y === null) continue;
    byY.set(y, s);
    maxSectionY = Math.max(maxSectionY, y);
  }
  const minSectionY = numberOf(value.yPos) ?? Math.min(...byY.keys());
  const minY = minSectionY * 16;
  const maxY = maxSectionY * 16 + 15;

  // Group the edits per section, validating every position against this chunk + build height.
  const perSection = new Map<number, WorldBlockEdit[]>();
  for (const e of edits) {
    if (Math.floor(e.x / 16) !== cx || Math.floor(e.z / 16) !== cz) {
      throw new Error(`edit at ${e.x},${e.y},${e.z} is outside chunk ${cx},${cz}`);
    }
    if (e.y < minY || e.y > maxY) {
      throw new Error(`edit at y=${e.y} is outside the world's build range (${minY}..${maxY})`);
    }
    const sy = Math.floor(e.y / 16);
    let list = perSection.get(sy);
    if (!list) perSection.set(sy, (list = []));
    list.push(e);
  }

  for (const [sy, sectionEdits] of perSection) {
    let record = byY.get(sy);
    if (!record) {
      record = createSection(sy, sections);
      byY.set(sy, record);
      insertSectionSorted(value, sections, record, sy);
    }
    repackSection(record, sectionEdits);
  }

  patchBlockEntities(value, edits);

  // Light + heightmaps: stale, let the game recompute on load.
  value.isLightOn = byteTag(0);
  delete value.Heightmaps;

  return { editedSectionYs: [...perSection.keys()].sort((a, b) => a - b) };
}

// ── sections ─────────────────────────────────────────────────────────────────────────

/** A fresh all-air section record. Its biome palette is CLONED from the nearest existing
 *  section that has one (a new section must carry biomes or the chunk fails to load). */
function createSection(sy: number, sections: Compound[]): Compound {
  const record: Compound = {
    Y: byteTag(sy),
    block_states: compoundTag({
      palette: compoundListTag([{ Name: stringTag(AIR) }]),
    }),
  };
  let best: { dist: number; biomes: Tag } | null = null;
  for (const s of sections) {
    const y = numberOf(s.Y);
    if (y === null || !s.biomes) continue;
    const dist = Math.abs(y - sy);
    if (!best || dist < best.dist) best = { dist, biomes: s.biomes };
  }
  if (best) record.biomes = cloneTag(best.biomes);
  return record;
}

/** Insert a new section record keeping the list ascending by Y (vanilla's write order). */
function insertSectionSorted(value: Compound, sections: Compound[], record: Compound, sy: number): void {
  let at = sections.length;
  for (let i = 0; i < sections.length; i++) {
    const y = numberOf(sections[i].Y);
    if (y !== null && y > sy) {
      at = i;
      break;
    }
  }
  sections.splice(at, 0, record);
  value.sections = compoundListTag(sections);
}

/** Decode a section's 4096 cells, apply its edits, and write back the repacked palette/data.
 *  Also strips the section's stored light (the game recomputes). */
function repackSection(record: Compound, edits: WorldBlockEdit[]): void {
  const states = compoundOf(record.block_states);
  const paletteTags = states ? compoundItems(states.palette) : [];
  const palette: RawPaletteEntry[] = paletteTags.length ? paletteTags.map(paletteEntryOf) : [{ Name: AIR }];

  let cells: RawPaletteEntry[];
  if (palette.length === 1) {
    cells = new Array<RawPaletteEntry>(SECTION_VOLUME).fill(palette[0]);
  } else {
    const bits = bitsForBlockStates(palette.length);
    const longs = pairsToBig(states ? longArrayPairs(states.data) : []);
    const indices = unpackNonSpanning(longs, bits, SECTION_VOLUME);
    cells = new Array<RawPaletteEntry>(SECTION_VOLUME);
    for (let i = 0; i < SECTION_VOLUME; i++) {
      const entry = palette[indices[i]];
      if (!entry) throw new Error('section data indexes past its palette — refusing to edit a malformed section');
      cells[i] = entry;
    }
  }

  for (const e of edits) {
    const lx = e.x & 15;
    const ly = ((e.y % 16) + 16) % 16;
    const lz = e.z & 15;
    cells[ly * 256 + lz * 16 + lx] = e.state;
  }

  const packed = packSectionCells(cells);
  const nextStates: Compound = {
    palette: compoundListTag(packed.palette.map(paletteEntryTag)),
  };
  if (packed.data) nextStates.data = longArrayTag(packed.data);
  record.block_states = compoundTag(nextStates);
  delete record.BlockLight;
  delete record.SkyLight;
}

function paletteEntryOf(tag: Compound): RawPaletteEntry {
  const name = stringOf(tag.Name) ?? AIR;
  const propsTags = compoundOf(tag.Properties);
  if (!propsTags) return { Name: name };
  const props: Record<string, string> = {};
  for (const [k, v] of Object.entries(propsTags)) props[k] = stringOf(v) ?? String(v.value);
  return { Name: name, Properties: props };
}

function paletteEntryTag(entry: RawPaletteEntry): Compound {
  const out: Compound = { Name: stringTag(entry.Name) };
  const props = entry.Properties;
  if (props && Object.keys(props).length) {
    const value: Compound = {};
    // Blockstate property values are ALWAYS strings in NBT, even "true"/"8".
    for (const [k, v] of Object.entries(props)) value[k] = stringTag(String(v));
    out.Properties = compoundTag(value);
  }
  return out;
}

// ── block entities ───────────────────────────────────────────────────────────────────

/** Remove block-entity records at every edited cell, then append the minimal records for edits
 *  that place a BE-capable block. Coordinates are ABSOLUTE in chunk storage (unlike `.nbt`
 *  structures) — the classic paste-corruption class this stamps out. */
function patchBlockEntities(value: Compound, edits: WorldBlockEdit[]): void {
  const editedCells = new Set(edits.map((e) => `${e.x},${e.y},${e.z}`));
  const existing = compoundItems(value.block_entities);
  const kept = existing.filter((be) => {
    const key = `${numberOf(be.x)},${numberOf(be.y)},${numberOf(be.z)}`;
    return !editedCells.has(key);
  });

  for (const e of edits) {
    const be = e.blockEntity;
    if (!be) continue;
    const id = typeof be.id === 'string' ? be.id : null;
    if (!id) throw new Error(`block entity at ${e.x},${e.y},${e.z} has no id`);
    const record: Compound = {
      ...inferCompoundValue(be),
      id: stringTag(id),
      x: intTag(e.x),
      y: intTag(e.y),
      z: intTag(e.z),
      keepPacked: byteTag(0),
    };
    kept.push(record);
  }

  if (kept.length || value.block_entities) value.block_entities = compoundListTag(kept);
}

/** Free-form JSON → compound VALUE via the authoring encoder's inference (same tag shapes). */
function inferCompoundValue(obj: Record<string, unknown>): Compound {
  const rest = Object.fromEntries(Object.entries(obj).filter(([k]) => !['id', 'x', 'y', 'z'].includes(k)));
  return inferCompound(rest).value as Compound;
}
