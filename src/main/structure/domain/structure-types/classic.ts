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
import { mulberry32 } from '../rng';
import type { StructureType } from './types';
import { logProps } from './types';
import { addStairCore } from './stair-core';

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
  // Multi-storey (stair cleanup) + a single complete chimney — the house-only finalizers.
  finalize: ['stairs', 'chimney'],
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
  build({ box, params, palette, seed, composeModule }) {
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

    // --- Level plan ------------------------------------------------------------
    // The box is the whole envelope; levels stack inside it. A basement is the
    // bottom storey (within bounds, not dug below y0), then `floors` above-grade
    // storeys, then the roof — with the attic living inside the roof void.
    const hasBasement = basement !== 'none';
    const belowLevels = hasBasement ? 1 : 0;
    const storeyCount = belowLevels + floors;

    const wantsPitched = !isFlat && palette.idOf('roof').endsWith('_stairs');
    const roofRings = Math.max(1, Math.floor(Math.min(W, D) / 2));
    // Reserve headroom at the top for the roof: a pitch needs the gable rings; a FLAT
    // roof just a deck + parapet (2); a bare ceiling needs 1. A flat roof keeps the walls
    // tall (no pitch void), which is also why it can't host an attic.
    const roofReserve = wantsPitched ? roofRings : isFlat ? 2 : 1;
    // Pick a storey height that fills the box, leaving room for the roof on top.
    let storeyH = Math.max(4, Math.floor((H - roofReserve) / storeyCount));
    let wallTop = y0 + storeyCount * storeyH;
    while (wallTop + 2 > y1 && storeyH > 3) {
      storeyH--;
      wallTop = y0 + storeyCount * storeyH;
    }
    if (wallTop > y1) wallTop = y1;
    const doRoof = wantsPitched && wallTop >= y0 + 3 && y1 - wallTop >= 3;
    const doFlat = isFlat && y1 - wallTop >= 1;
    const hasAttic = attic !== 'none' && doRoof && y1 - wallTop >= 3;

    // Floor-slab Y of each storey (bottom→top); index `groundIdx` is the ground floor.
    const slabYs: number[] = [];
    for (let i = 0; i < storeyCount; i++) slabYs.push(y0 + i * storeyH);
    const groundIdx = belowLevels;
    const groundY = slabYs[groundIdx];

    // --- Shell -----------------------------------------------------------------
    ops.push({ op: 'fill', from: [x0, y0, z0], to: [x1, y0, z1], state: found }); // foundation slab
    ops.push({ op: 'walls', from: [x0, y0, z0], to: [x1, wallTop, z1], state: wall }); // 4-sided shell
    // Framed corner posts (skipped for the 'flush' treatment — the wall already turns
    // the corner; the variety is in whether a post reads against it).
    if (cornerStyle !== 'flush') {
      for (const [px, pz] of [[x0, z0], [x0, z1], [x1, z0], [x1, z1]] as [number, number][]) {
        ops.push({ op: 'fill', from: [px, y0, pz], to: [px, wallTop, pz], state: corner });
      }
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

    // Floor slabs for every storey above the foundation.
    for (let i = 1; i < storeyCount; i++) {
      ops.push({ op: 'fill', from: [x0 + 1, slabYs[i], z0 + 1], to: [x1 - 1, slabYs[i], z1 - 1], state: floorIdx });
    }
    // Cap the top: the attic loft (DELEGATED to the attic module — the single source of
    // attic geometry: it floors the void at the wall top + lights it), or a flat ceiling
    // when there's no roof. The box's y0 is the wall top = the attic floor plane.
    if (hasAttic) ops.push(...composeModule('attic', attic, [x0, wallTop, z0], [x1, y1, z1]));
    else if (!doRoof && !doFlat) ops.push({ op: 'fill', from: [x0, wallTop, z0], to: [x1, wallTop, z1], state: floorIdx });

    // --- Roof (emitted ONCE — the model must never add another) ----------------
    // DELEGATED to the roof module (the single source of roof geometry): the house owns
    // placement (the box over the wall top) + which form the seed/param picked; the
    // module emits the pitched `roof` op (against this build's palette, so materials
    // match) plus its host integration (gable-end vents). The seed varies the form
    // (gable either way, or a hip) for a square-ish footprint.
    if (doRoof) {
      const roofBoxFrom: [number, number, number] = [x0, wallTop + 1, z0];
      const roofBoxTo: [number, number, number] = [x1, y1, z1];
      if (roofPick === 'hip') {
        ops.push(...composeModule('roof', 'hip', roofBoxFrom, roofBoxTo));
      } else {
        const ridge = roofPick === 'gx' ? 'x' : roofPick === 'gz' ? 'z' : W <= D ? 'z' : 'x';
        ops.push(...composeModule('roof', 'gable', roofBoxFrom, roofBoxTo, { ridge }));
      }
    } else if (doFlat) {
      // A flat cap (walkable deck + parapet lip) over the wall top — delegated to the
      // flat roof module. No roof void → the attic is suppressed (hasAttic is false).
      ops.push(...composeModule('roof', 'flat', [x0, wallTop + 1, z0], [x1, y1, z1]));
    }

    // --- Openings --------------------------------------------------------------
    // Front entrance: the actual door seated in the front wall + a hanging lantern
    // just inside, so the doorway reads finished (not a bare gap).
    ops.push({ op: 'block', pos: [cx, groundY + 1, z0], state: palette.get('door', { facing: 'north', half: 'lower', hinge: 'left', open: 'false', powered: 'false' }) });
    ops.push({ op: 'block', pos: [cx, groundY + 2, z0], state: palette.get('door', { facing: 'north', half: 'upper', hinge: 'left', open: 'false', powered: 'false' }) });
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
    // A half-submerged basement gets a high clerestory window band for daylight.
    if (hasBasement && basement === 'half' && groundY - 1 > y0 + 1) {
      const wy = groundY - 1;
      for (const x of winX) {
        ops.push({ op: 'block', pos: [x, wy, z0], state: win });
        ops.push({ op: 'block', pos: [x, wy, z1], state: win });
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

    // --- Guaranteed light: a hanging lantern under every level's ceiling --------
    for (let i = 0; i < storeyCount; i++) {
      const ceil = i + 1 < storeyCount ? slabYs[i + 1] : wallTop;
      if (ceil - 1 > slabYs[i]) ops.push({ op: 'block', pos: [cx, ceil - 1, cz], state: lantern });
    }
    // (The attic loft's own floor + light come from the delegated attic module above.)

    // --- Stair core: a 2-wide switchback in the back-right corner linking every
    // WALKABLE storey (basement→ground→upper floors). The attic is reached by a
    // ladder (inside addStairCore) so no flight ever pierces the roof. Emitted LAST so
    // each flight's `clear` carves the stairwell hole through the slab above. ---------
    addStairCore({
      ops,
      box: { x0, y0, z0, x1, y1, z1, W, D, H },
      slabYs,
      storeyH,
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
