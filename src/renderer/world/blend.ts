// TERRAIN BLEND (v2.3 §1.2) — the pure planner behind "place structure into world"
// blending, the 15-year gap no other tool fills: pasting a build on a slope either leaves
// floating footprint columns or walls of exposed dirt. Three composable passes, all
// emitted as ordinary pending world edits (ghost-previewed, undoable, saved through the
// safe write path — the pipeline is untouched):
//
//  - FOUNDATION ("beard"): every grounded footprint column is pillared down to the
//    terrain with the column's own sub-surface material — the vanilla beardifier's job,
//    but deterministic and visible before anything is written.
//  - FEATHER: a ring (radius N) around the footprint where the terrain is raised/cut
//    toward the structure's base level, interpolated over the ring with a hash-dithered
//    percentage mask (the manual WorldEdit brush technique, first-class). Raised columns
//    are re-capped with the column's surface block; cut columns re-cap the new top.
//  - EXCAVATE: inside the footprint, terrain that pokes through cells the structure
//    leaves UNDEFINED (omitted / structure_void) is cleared — the semi-buried/basement
//    case. Opt-in: void-preserving structures may want that terrain kept.
//
// Pure: terrain is read through an injected `TerrainSampler` (the WorldView provides the
// real one from resident chunk payloads), so the whole plan is unit-tested in
// __tests__/blend.test.ts. Deterministic: the dither mask hashes the column coords.
import { cellHash01 } from '../editor/pattern';
import { AIR, cellKeyOf, type PendingWorldEdit } from './edit-overlay';

/** An NBT-shaped block state (what pending edits carry). */
export interface BlockState {
  name: string;
  properties?: Record<string, string>;
}

/** One column's terrain read: the surface block's Y + its state, and the sub-surface
 *  filler the column continues with (dirt under grass, sand under sand…). */
export interface SurfaceSample {
  y: number;
  surface: BlockState;
  filler: BlockState;
}

/** How the planner reads the world (implemented over resident chunk payloads). */
export interface TerrainSampler {
  /** The terrain surface at a column (foliage/fluids skipped), or null when unknown
   *  (chunk not streamed in / no ground in range). */
  surfaceAt(x: number, z: number): SurfaceSample | null;
  /** The block id at a cell (`minecraft:air` for empty), or null when unknown. */
  blockAt(x: number, y: number, z: number): string | null;
}

export interface BlendOptions {
  /** Pillar grounded footprint columns down to the terrain. */
  foundation: boolean;
  /** Feather-ring radius around the footprint (0 = off). */
  feather: number;
  /** Clear terrain inside the footprint where the structure leaves cells undefined. */
  excavate: boolean;
}

/** Widest feather ring offered (the UI clamp). */
export const BLEND_MAX_FEATHER = 8;

/** Deepest a foundation column may descend before giving up (a bottomless ravine
 *  shouldn't turn one paste into a 300-block pillar farm). */
const MAX_FOUNDATION_DEPTH = 48;

/** How far above a cut/raised column soft foliage is cleared (tall grass, flowers). */
const SOFT_CLEAR_MARGIN = 8;

/** Names that never count as ground when scanning for the terrain surface: foliage,
 *  plants, fluids, snow layers — the things a heightmap "surface" lies about. */
const NON_GROUND_EXACT = new Set([
  'minecraft:air',
  'minecraft:cave_air',
  'minecraft:void_air',
  'minecraft:water',
  'minecraft:lava',
  'minecraft:snow',
  'minecraft:grass',
  'minecraft:short_grass',
  'minecraft:tall_grass',
  'minecraft:fern',
  'minecraft:large_fern',
  'minecraft:dead_bush',
  'minecraft:sugar_cane',
  'minecraft:bamboo',
  'minecraft:cactus',
  'minecraft:vine',
  'minecraft:lily_pad',
  'minecraft:sweet_berry_bush',
  'minecraft:brown_mushroom',
  'minecraft:red_mushroom',
  'minecraft:pumpkin',
  'minecraft:melon',
  'minecraft:cocoa',
  'minecraft:seagrass',
  'minecraft:tall_seagrass',
  'minecraft:kelp',
  'minecraft:kelp_plant',
]);
const NON_GROUND_PARTS = ['leaves', 'log', 'sapling', 'flower', 'tulip', 'orchid', 'daisy', 'dandelion', 'poppy', 'lilac', 'peony', 'rose_bush', 'azalea', 'propagule', 'roots', 'fungus', 'sprouts', 'petals', 'wart_block', 'mushroom_block', 'mushroom_stem', 'coral', 'pickle', 'moss_carpet', 'carpet'];

/** Whether a block reads as terrain GROUND (what a foundation may rest on / a feather
 *  cut exposes) rather than foliage, fluid or air. */
export function isGroundBlock(name: string): boolean {
  if (NON_GROUND_EXACT.has(name)) return false;
  const bare = name.replace(/^[^:]+:/, '');
  return !NON_GROUND_PARTS.some((p) => bare.includes(p));
}

/** Soft plant cover cleared above a re-levelled column (never logs/leaves — felling
 *  trees is out of scope; the game decays orphaned leaves on its own). */
function isClearableSoft(name: string): boolean {
  if (name === AIR || isGroundBlock(name)) return false;
  const bare = name.replace(/^[^:]+:/, '');
  return !bare.includes('log') && !bare.includes('leaves') && !bare.includes('water') && !bare.includes('lava');
}

/** The placement geometry the blend plans around. */
export interface BlendPlanInput {
  /** The placement's own edits — blend never overwrites these cells. */
  edits: readonly PendingWorldEdit[];
  /** Min corner of the ROTATED bounding box (world cells). */
  anchor: [number, number, number];
  /** The rotated box size. */
  size: [number, number, number];
}

/** An edit map keyed by cell, so later passes never double-write a cell. */
type EditMap = Map<string, PendingWorldEdit>;

const put = (map: EditMap, occupied: Set<string>, x: number, y: number, z: number, state: BlockState): void => {
  const key = cellKeyOf(x, y, z);
  if (occupied.has(key)) return;
  map.set(key, {
    x,
    y,
    z,
    name: state.name,
    ...(state.properties && Object.keys(state.properties).length ? { properties: state.properties } : {}),
  });
};

/**
 * Plan the terrain-blend edits for a placement.
 *
 * @param input   The placement's edits + rotated box (see {@link BlendPlanInput}).
 * @param sampler Terrain reads (see {@link TerrainSampler}); unknown columns are skipped.
 * @param opts    Which passes run (see {@link BlendOptions}).
 * @returns Additional pending edits — never overlapping the placement's own cells.
 */
export function planTerrainBlend(input: BlendPlanInput, sampler: TerrainSampler, opts: BlendOptions): PendingWorldEdit[] {
  const [ax, ay, az] = input.anchor;
  const [w, h, d] = input.size;
  const out: EditMap = new Map();
  const occupied = new Set<string>();
  /** Per footprint column: the lowest SOLID structure cell + every defined (written) Y. */
  const columns = new Map<string, { lowestSolid: number | null; defined: Set<number> }>();
  for (const e of input.edits) {
    occupied.add(cellKeyOf(e.x, e.y, e.z));
    const ck = `${e.x},${e.z}`;
    let col = columns.get(ck);
    if (!col) {
      col = { lowestSolid: null, defined: new Set() };
      columns.set(ck, col);
    }
    col.defined.add(e.y);
    if (e.name !== AIR && (col.lowestSolid === null || e.y < col.lowestSolid)) col.lowestSolid = e.y;
  }

  // ── Foundation ("beard") ─────────────────────────────────────────────────────
  if (opts.foundation) {
    for (const [ck, col] of columns) {
      // Grounded columns only: the column's structure starts at the box's bottom layers
      // (floor slabs, walls, posts). An awning whose solid starts higher must NOT grow a
      // dirt pillar under the porch.
      if (col.lowestSolid === null || col.lowestSolid > ay + 1) continue;
      const [x, z] = ck.split(',').map(Number);
      const s = sampler.surfaceAt(x, z);
      if (!s) continue;
      const top = col.lowestSolid - 1;
      const bottom = Math.max(s.y + 1, top - MAX_FOUNDATION_DEPTH);
      for (let y = top; y >= bottom; y--) put(out, occupied, x, y, z, s.filler);
    }
  }

  // ── Excavation (semi-buried structures) ──────────────────────────────────────
  if (opts.excavate) {
    for (let lx = 0; lx < w; lx++) {
      for (let lz = 0; lz < d; lz++) {
        const x = ax + lx;
        const z = az + lz;
        const s = sampler.surfaceAt(x, z);
        if (!s || s.y < ay) continue; // terrain below the box — nothing pokes in
        const col = columns.get(`${x},${z}`);
        const top = Math.min(s.y, ay + h - 1);
        for (let y = ay; y <= top; y++) {
          if (col?.defined.has(y)) continue; // the structure decides this cell
          const name = sampler.blockAt(x, y, z);
          if (name && name !== AIR) put(out, occupied, x, y, z, { name: AIR });
        }
      }
    }
  }

  // ── Feather ring ─────────────────────────────────────────────────────────────
  const feather = Math.max(0, Math.min(BLEND_MAX_FEATHER, Math.round(opts.feather)));
  if (feather > 0) {
    const edgeY = ay - 1; // terrain level flush with the structure's base
    for (let x = ax - feather; x < ax + w + feather; x++) {
      for (let z = az - feather; z < az + d + feather; z++) {
        // Chebyshev distance to the footprint rect; 0 = inside (handled by the passes above).
        const dx = x < ax ? ax - x : x >= ax + w ? x - (ax + w - 1) : 0;
        const dz = z < az ? az - z : z >= az + d ? z - (az + d - 1) : 0;
        const dist = Math.max(dx, dz);
        if (dist < 1 || dist > feather) continue;
        const s = sampler.surfaceAt(x, z);
        if (!s || s.y === edgeY) continue;
        // Interpolate the target level from the base (at the wall) back to the original
        // terrain (past the ring), dithered by the percentage mask so the edge is noise,
        // not a contour line.
        const t = dist / (feather + 1);
        const ideal = edgeY + (s.y - edgeY) * t;
        let target = Math.floor(ideal);
        if (cellHash01(x, 0, z) < ideal - target) target += 1;
        if (target > s.y) {
          // Raise: fill with the column's own material, cap with its surface block.
          // Soft plants just above the old surface are simply buried by the fill.
          for (let y = s.y + 1; y <= target; y++) put(out, occupied, x, y, z, y === target ? s.surface : s.filler);
        } else if (target < s.y) {
          // Cut down to the target, re-cap the new top with the surface block (only when
          // it's real ground — never paint grass over a cave pocket), and sweep the soft
          // plant cover now stranded above the removed column.
          for (let y = target + 1; y <= s.y; y++) put(out, occupied, x, y, z, { name: AIR });
          const cap = sampler.blockAt(x, target, z);
          if (cap && isGroundBlock(cap)) put(out, occupied, x, target, z, s.surface);
          for (let y = s.y + 1; y <= s.y + SOFT_CLEAR_MARGIN; y++) {
            const name = sampler.blockAt(x, y, z);
            if (!name || !isClearableSoft(name)) break;
            put(out, occupied, x, y, z, { name: AIR });
          }
        }
      }
    }
  }

  return [...out.values()];
}
