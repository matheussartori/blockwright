// "classic" — the original house archetype (a member of the "house" group). A
// storeyed home whose MASSING (the part the model is bad at) is owned
// entirely by code: a real stack of levels (optional below-grade basement, N
// above-ground storeys, an optional in-roof attic), a SINGLE pitched roof, a
// connected switchback stair core linking every level, window bands, a seated front
// door, a stone plinth, a chimney, and an optional recessed (covered) balcony. The
// model never rebuilds walls/roofs/floors/stairs — it only furnishes the clean rooms
// this hands it. The `seed` varies the shell (windows, corners, roof, chimney side)
// run-to-run while every build keeps the same invariants.
//
// Everything is emitted in terms of semantic roles; the decoration supplies the
// concrete blocks. The type ships its own `defaults` kit so it reads right even
// under a sparse decoration.
import type { AuthoringOp } from '../../authoring/types';
import { DEFAULT_STOREY_H, planStoreys } from '@/shared/domain/storeys';
import { mulberry32 } from '../rng';
import type { ParamValues } from '../params';
import { insetHouseBox, yardFor } from '../surroundings';
import type { Box, FloorPlanEntry, StructureType } from './types';
import { logProps } from './types';
import { addStairCore } from './stair-core';
import { ceilingLanterns, cornerPosts, roofCap, roofFormFor, seatDoor, storeyEntries, storeySlabs } from './shell-kit';

/** The house's level plan for a box + params — ONE source shared by `build()` and
 *  `floors()` (the standard per-type pattern). The box is the whole envelope; levels
 *  stack inside it: an optional basement bottom storey, then the above-grade storeys
 *  (honouring explicit per-floor heights — the basement keeps the neutral +5 the
 *  composer's overhead budgets for it), then the roof reserve on top.
 *  `canPitch` mirrors whether the active roof block can pitch; `floors()` (which has no
 *  palette) uses the declared kit's default (stairs → true). */
function plan(b: Box, params: ParamValues, floorHeights?: number[], canPitch = true) {
  const { y0, y1, W, D } = b;
  const floors = params.floors as number;
  const hasBasement = (params.basement as string) !== 'none';
  const belowLevels = hasBasement ? 1 : 0;
  const storeyCount = belowLevels + floors;
  const isFlat = (params.roof as string) === 'flat';
  const wantsPitched = !isFlat && canPitch;
  const roofRings = Math.max(1, Math.floor(Math.min(W, D) / 2));
  // Reserve headroom at the top for the roof: a pitch needs the gable rings; anything
  // else caps with the flat module's deck + parapet (2).
  const roofReserve = wantsPitched ? roofRings : 2;
  const ladder = planStoreys({
    baseY: y0,
    idealTop: y1 - roofReserve,
    maxWallTop: y1 - 2,
    floors: storeyCount,
    floorHeights: floorHeights && hasBasement ? [DEFAULT_STOREY_H, ...floorHeights] : floorHeights,
  });
  const wallTop = Math.min(ladder.wallTop, y1);
  return { hasBasement, belowLevels, storeyCount, isFlat, slabYs: ladder.slabYs, wallTop };
}

export const classic: StructureType = {
  id: 'classic',
  label: 'Classic',
  category: 'structure',
  group: 'house',
  description:
    'A storeyed home with a pitched roof, framed corner posts, a centred doorway, and ' +
    'banded windows. Owns its full massing: an optional basement, 1–4 above-ground floors, ' +
    'an optional attic in the roof, a connected stair core, and an optional covered balcony. ' +
    'Decoration supplies the materials and (optionally) decay.',
  knowledge: 'nbt/modules/structure/classic.md',
  preview: { size: [11, 13, 9], params: { floors: 2, attic: 'storage' } },
  // A single complete chimney — the house-only finalizer.
  finalize: ['chimney'],
  // A roomy storeyed home: up to three interior rooms can share a floor.
  maxRoomsPerFloor: 3,
  params: {
    floors: { kind: 'int', default: 1, min: 1, max: 4, label: 'Floors' }, // above-ground storeys
    // Surfaced in Details as the separate "Basement" module select (category
    // 'basement'), so it's omitted from the house's own param controls — but kept here
    // so the legacy `template name:'classic'` build path still resolves it.
    basement: {
      kind: 'enum', default: 'none', values: ['none', 'full', 'half'], label: 'Basement',
      labels: { none: 'None', full: 'Full cellar', half: 'Half-buried' }, module: 'basement',
    },
    // Surfaced in Details as the separate "Attic" module select (category 'attic'), so it's
    // omitted from the house's own param controls — but kept here so the legacy
    // `template name:'classic'` build path still resolves it. The value is the attic-module
    // id (storage/bedroom); the house delegates the loft geometry to that module.
    attic: {
      kind: 'enum', default: 'none', values: ['none', 'storage', 'bedroom'], label: 'Attic',
      labels: { none: 'None', storage: 'Storage', bedroom: 'Bedroom' }, module: 'attic',
    },
    balcony: {
      kind: 'enum', default: 'none', values: ['none', 'front', 'side'], label: 'Balcony',
      labels: { none: 'None', front: 'Front', side: 'Side' },
    },
    // Surfaced in Details as the separate "Roof" module select (category 'roof'), so
    // it's omitted from the house's own param controls — but kept here so the legacy
    // `template name:'classic'` build path still resolves it.
    roof: {
      kind: 'enum', default: 'auto', values: ['auto', 'gable', 'hip', 'flat'], label: 'Roof',
      labels: { auto: 'Auto (varied)', gable: 'Gable', hip: 'Hip', flat: 'Flat' }, module: 'roof',
    },
    // Surfaced as the "Surroundings" module select (hidden from the type's own Details
    // controls like `roof`). A non-'none' pick INSETS the house by the shared ring
    // margins and delegates the yard geometry to that surroundings module.
    surroundings: {
      kind: 'enum', default: 'none', values: ['none', 'garden'], label: 'Surroundings',
      labels: { none: 'None', garden: 'Garden' }, module: 'surroundings',
    },
    decay: { kind: 'unit', default: 0.2 },
  },
  defaults: {
    wall: 'minecraft:cobblestone',
    corner: 'minecraft:spruce_log',
    accent: 'minecraft:spruce_log',
    floor: 'minecraft:spruce_planks',
    ceiling: 'minecraft:spruce_planks',
    foundation: 'minecraft:cobblestone',
    roof: 'minecraft:spruce_stairs',
    window: 'minecraft:glass_pane',
    door: 'minecraft:spruce_door',
    fence: 'minecraft:spruce_fence',
    light: 'minecraft:lantern',
  },
  build({ box: outer, params, palette, seed, floorHeights, composeModule }) {
    // A picked surroundings ring reserves the box's outer margins for the yard: the
    // HOUSE is laid in the inset box, and the ring module wraps it over the full box.
    const yard = yardFor(outer, params);
    const box = yard ? insetHouseBox(outer, yard) : outer;
    const { x0, y0, z0, x1, y1, z1, W, D, H } = box;
    const floors = params.floors as number;
    const basement = params.basement as string;
    const attic = params.attic as string;
    const balcony = params.balcony as string;
    const decay = params.decay as number;

    const air = palette.air();
    const wall = palette.get('wall');
    const floorIdx = palette.get('floor');
    const found = palette.get('foundation');
    const win = palette.get('window');
    const mossy = palette.weather('wall');
    const lantern = palette.get('light', { hanging: 'true' });

    // Seeded design variety, kept WITHIN the rules: each run's seed picks a window
    // rhythm, a corner treatment, a roof form, and the chimney side — so no two builds
    // share a shell, while every build still obeys the single-roof / separated-floors /
    // lit invariants.
    const rnd = mulberry32(seed);
    const winStyle = (['band', 'paired', 'tall'] as const)[Math.floor(rnd() * 3)];
    const cornerStyle = (['log', 'accent', 'flush'] as const)[Math.floor(rnd() * 3)];
    const squareish = Math.abs(W - D) <= 1;
    // Always draw the seeded roof (so windows/corners stay stable when the user pins
    // the roof). The `roof` param then overrides it: 'auto' keeps the seeded form,
    // 'gable'/'hip' force it. A forced gable runs its ridge along the long axis.
    const seededRoof = squareish ? (['gx', 'gz', 'hip'] as const)[Math.floor(rnd() * 3)] : 'glong';
    const roofShape = params.roof as string;
    const isFlat = roofShape === 'flat';
    const roofPick = roofShape === 'gable' ? (W <= D ? 'gz' : 'gx') : roofShape === 'hip' ? 'hip' : seededRoof;
    const chimX = rnd() < 0.5 ? x0 : x1; // which side wall carries the chimney

    const cornerRole = cornerStyle === 'accent' ? 'accent' : 'corner';
    const corner = palette.get(cornerRole, logProps(palette.idOf(cornerRole)));

    const ops: AuthoringOp[] = [];
    const cx = Math.floor((x0 + x1) / 2);
    const cz = Math.floor((z0 + z1) / 2);

    // The yard first (it never overlaps the inset house, so order is cosmetic — laying
    // it first means any future overlap resolves in the house's favour).
    if (yard) {
      ops.push(...composeModule('surroundings', yard, [outer.x0, outer.y0, outer.z0], [outer.x1, outer.y1, outer.z1]));
    }

    // --- Level plan (shared with floors() via plan()) ---------------------------
    const canPitch = palette.idOf('roof').endsWith('_stairs');
    const { hasBasement, storeyCount, belowLevels, slabYs, wallTop } = plan(box, params, floorHeights, canPitch);
    // The cap this build actually lays — the kit GUARANTEE: a pitched pick that can't
    // fit (or can't pitch) still caps FLAT (deck + parapet), never a roofless shell.
    const roofForm = roofFormFor(isFlat ? 'flat' : roofPick === 'hip' ? 'hip' : 'gable', y1 - wallTop, canPitch);
    const hasAttic = attic !== 'none' && (roofForm === 'gable' || roofForm === 'hip') && y1 - wallTop >= 3;

    // Floor-slab Y of each storey (bottom→top); index `groundIdx` is the ground floor.
    const groundIdx = belowLevels;
    const groundY = slabYs[groundIdx];

    // --- Shell -----------------------------------------------------------------
    ops.push({ op: 'fill', from: [x0, y0, z0], to: [x1, y0, z1], state: found }); // foundation slab
    ops.push({ op: 'walls', from: [x0, y0, z0], to: [x1, wallTop, z1], state: wall }); // 4-sided shell
    // Framed corner posts (skipped for the 'flush' treatment — the wall already turns
    // the corner; the variety is in whether a post reads against it).
    if (cornerStyle !== 'flush') {
      ops.push(...cornerPosts([[x0, z0], [x0, z1], [x1, z0], [x1, z1]], y0, wallTop, corner));
    }

    // Below-grade level: DELEGATE the cellar room to the basement module (the single
    // source of basement geometry — a self-contained stone undercroft with a distinct
    // floor/ceiling, perimeter walls and lit support pillars). The house owns placement
    // (it fills the building footprint, so force a rect footprint, the ceiling landing on
    // the ground slab) + burial depth; the 'half' clerestory below and the stair-core
    // descent stay the house's own concern. The module brings its own stone palette.
    if (hasBasement && groundY - 1 >= y0 + 1) {
      ops.push(...composeModule('basement', 'cellar', [x0, y0, z0], [x1, groundY, z1], { shape: 'rect' }));
    }

    // Stone plinth: a cobblestone water-table course at the ground-storey base, so the
    // house sits on stone instead of timber meeting the dirt — a calm, grounding detail.
    ops.push({ op: 'walls', from: [x0, groundY, z0], to: [x1, groundY, z1], state: found });

    // Floor slabs for every storey above the foundation (kit).
    ops.push(...storeySlabs(slabYs, { x0, z0, x1, z1 }, y1, floorIdx));
    // The attic loft (DELEGATED to the attic module — the single source of attic
    // geometry: it floors the void at the wall top + lights it). The box's y0 is the
    // wall top = the attic floor plane.
    if (hasAttic) ops.push(...composeModule('attic', attic, [x0, wallTop, z0], [x1, y1, z1]));

    // --- Roof (emitted ONCE — the model must never add another) ----------------
    // DELEGATED to the roof module via the kit: the house owns placement (the box over
    // the wall top) + which form the seed/param picked; the module emits the geometry
    // (against this build's palette) plus its host integration (gable-end vents). The
    // seed varies the form (gable either way, or a hip) for a square-ish footprint.
    const ridge = roofPick === 'gx' ? 'x' : roofPick === 'gz' ? 'z' : W <= D ? 'z' : 'x';
    ops.push(...roofCap(composeModule, roofForm, [x0, wallTop + 1, z0], [x1, y1, z1], ridge));
    // Degenerate box (walls already at the box top → no cell for any cap): a bare
    // ceiling fill, so even that never ships open to the sky.
    if (roofForm === 'none') ops.push({ op: 'fill', from: [x0, wallTop, z0], to: [x1, wallTop, z1], state: floorIdx });

    // --- Openings --------------------------------------------------------------
    // Front entrance: the actual door seated in the front wall + a hanging lantern
    // just inside, so the doorway reads finished (not a bare gap).
    ops.push(...seatDoor(palette, cx, groundY + 1, z0));
    const ceilGround = groundIdx + 1 < storeyCount ? slabYs[groundIdx + 1] : wallTop;
    if (ceilGround - 1 > groundY) ops.push({ op: 'block', pos: [cx, ceilGround - 1, z0 + 1], state: lantern });

    // Window bands: symmetric columns centred on each wall (always symmetric), with
    // the seed choosing the rhythm — single pane, a 2-wide pair, or a 2-tall slit.
    const winX = symmetricBand(x0 + 2, x1 - 2, cx);
    const winZ = symmetricBand(z0 + 2, z1 - 2, cz);
    const winCells = (col: number, wy: number, fixed: number, axis: 'x' | 'z'): [number, number, number][] => {
      const cell = (c: number, y: number): [number, number, number] => (axis === 'x' ? [c, y, fixed] : [fixed, y, c]);
      if (winStyle === 'tall') return [cell(col, wy), cell(col, wy - 1)];
      if (winStyle === 'paired') {
        const lim = (axis === 'x' ? x1 : z1) - 1;
        return col + 1 <= lim ? [cell(col, wy), cell(col + 1, wy)] : [cell(col, wy)];
      }
      return [cell(col, wy)];
    };
    for (let f = 0; f < floors; f++) {
      const wy = slabYs[groundIdx + f] + 2;
      if (wy >= wallTop) break;
      for (const x of winX) {
        if (x === cx && f === 0) continue; // the door column on the ground front
        for (const c of winCells(x, wy, z0, 'x')) ops.push({ op: 'block', pos: c, state: win });
        for (const c of winCells(x, wy, z1, 'x')) ops.push({ op: 'block', pos: c, state: win });
      }
      for (const z of winZ) {
        for (const c of winCells(z, wy, x0, 'z')) ops.push({ op: 'block', pos: c, state: win });
        for (const c of winCells(z, wy, x1, 'z')) ops.push({ op: 'block', pos: c, state: win });
      }
    }
    // A half-submerged basement gets a high clerestory band for daylight — barred
    // (iron bars, never glass: the below-grade opening rule applies to code shells too).
    if (hasBasement && basement === 'half' && groundY - 1 > y0 + 1) {
      const wy = groundY - 1;
      const bars = palette.get('bars');
      for (const x of winX) {
        ops.push({ op: 'block', pos: [x, wy, z0], state: bars });
        ops.push({ op: 'block', pos: [x, wy, z1], state: bars });
      }
    }

    // Chimney: a cobblestone stack centred on a seeded side wall, rising from the
    // ground hearth up through the roof. It sits on the wall's centre column (which
    // the window band also centres on), so it replaces that one pane and the facade
    // stays symmetric — a chimney flanked by windows.
    ops.push({ op: 'fill', from: [chimX, groundY, cz], to: [chimX, y1, cz], state: found });

    // --- Covered balcony (a recessed loggia, so it never leaves the bounds) -----
    if (balcony !== 'none' && floors >= 1) {
      const fence = palette.get('fence');
      const topBase = slabYs[groundIdx + floors - 1];
      const ceilY = wallTop; // attic floor / roof base overhangs it → "covered"
      if (ceilY - topBase >= 3) {
        if (balcony === 'front' && W >= 7 && D >= 5) {
          const bw = Math.min(W - 4, 5);
          const a = cx - Math.floor(bw / 2);
          const b = a + bw - 1;
          ops.push({ op: 'fill', from: [a, topBase + 1, z0], to: [b, ceilY - 1, z0], state: air }); // open the facade
          ops.push({ op: 'fill', from: [a, topBase + 1, z0 + 2], to: [b, ceilY - 1, z0 + 2], state: wall }); // inner wall
          ops.push({ op: 'fill', from: [cx, topBase + 1, z0 + 2], to: [cx, topBase + 2, z0 + 2], state: air }); // doorway to balcony
          ops.push({ op: 'line', from: [a, topBase + 1, z0], to: [b, topBase + 1, z0], state: fence }); // rail
        } else if (balcony === 'side' && D >= 7 && W >= 5) {
          const bd = Math.min(D - 4, 5);
          const a = cz - Math.floor(bd / 2);
          const b = a + bd - 1;
          ops.push({ op: 'fill', from: [x1, topBase + 1, a], to: [x1, ceilY - 1, b], state: air });
          ops.push({ op: 'fill', from: [x1 - 2, topBase + 1, a], to: [x1 - 2, ceilY - 1, b], state: wall });
          ops.push({ op: 'fill', from: [x1 - 2, topBase + 1, cz], to: [x1 - 2, topBase + 2, cz], state: air });
          ops.push({ op: 'line', from: [x1, topBase + 1, a], to: [x1, topBase + 1, b], state: fence });
        }
      }
    }

    // --- Guaranteed light: a hanging lantern under every level's ceiling (kit) --
    ops.push(...ceilingLanterns(slabYs, wallTop, cx, cz, lantern));
    // (The attic loft's own floor + light come from the delegated attic module above.)

    // --- Stair core: a 2-wide switchback in the back-right corner linking every
    // WALKABLE storey (basement→ground→upper floors). The attic is reached by a
    // ladder (inside addStairCore) so no flight ever pierces the roof. Emitted LAST so
    // each flight's `clear` carves the stairwell hole through the slab above. ---------
    addStairCore({
      ops,
      box: { x0, y0, z0, x1, y1, z1, W, D, H },
      slabYs,
      palette,
      atticWallTop: hasAttic ? wallTop : undefined,
    });

    // --- Decay (cozy keeps this at 0): punch holes + weather, sparing frame ------
    // Reuses the seeded `rnd` stream from the variety choices above (still per-seed
    // deterministic), so decay also shifts with the seed.
    if (decay > 0) {
      for (let y = y0 + 1; y <= wallTop; y++) {
        for (let x = x0; x <= x1; x++) {
          for (let z = z0; z <= z1; z++) {
            if (x !== x0 && x !== x1 && z !== z0 && z !== z1) continue; // walls only
            if ((x === x0 || x === x1) && (z === z0 || z === z1)) continue; // keep corners
            const r = rnd();
            if (r < decay * 0.12) ops.push({ op: 'block', pos: [x, y, z], state: air });
            else if (r < decay * 0.12 + decay * 0.25) ops.push({ op: 'block', pos: [x, y, z], state: mossy });
          }
        }
      }
    }
    return ops;
  },
  // Authoritative storeys, from the SAME plan() build() uses (basement → ground →
  // uppers) — so the viewer bands / sidecar / stairwell pass see the laid planes.
  floors(outer: Box, params, floorHeights): FloorPlanEntry[] {
    // The SAME house-box inset build() applies: a surroundings ring narrows the footprint.
    const yard = yardFor(outer, params);
    const b = yard ? insetHouseBox(outer, yard) : outer;
    const { hasBasement, slabYs, wallTop } = plan(b, params, floorHeights);
    const entries = storeyEntries(slabYs, wallTop);
    return hasBasement
      ? entries.map((e, i) => ({ ...e, role: i === 0 ? ('basement' as const) : i === 1 ? ('ground' as const) : ('upper' as const) }))
      : entries;
  },
};

/** Columns of a symmetric window band: positions `center ± 3k` clamped to
 *  `[lo, hi]`, so a wall's windows are always centred and evenly spaced. */
function symmetricBand(lo: number, hi: number, center: number): number[] {
  const out: number[] = [];
  for (let d = 0; center - d >= lo || center + d <= hi; d += 3) {
    if (d === 0) {
      if (center >= lo && center <= hi) out.push(center);
    } else {
      if (center - d >= lo) out.push(center - d);
      if (center + d <= hi) out.push(center + d);
    }
  }
  return out.sort((a, b) => a - b);
}
