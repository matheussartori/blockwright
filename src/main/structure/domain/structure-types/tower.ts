// "tower" — a tall, vertically-emphasised structure with a three-part silhouette:
// a wider battered BASE, an inset SHAFT, and a distinct CROWN (battlemented parapet,
// pitched spire, or flat cap). It deliberately carries EXTERIOR detailing the house
// does not — corner quoins, per-storey string-course rings, projecting machicolations,
// merlons, and bracket lanterns — so a tower reads as a tower, not a stretched house.
//
// All projections live in a 1-block margin reserved between the box edge and the
// inset shaft, so the overhang never leaves the build bounds. Everything is emitted
// in terms of roles; the decoration supplies the concrete blocks.
import type { AuthoringOp } from '../../authoring/types';
import { mulberry32 } from '../rng';
import type { StructureType } from './types';
import { logProps } from './types';

export const tower: StructureType = {
  id: 'tower',
  label: 'Tower',
  category: 'structure',
  description:
    'A tall, vertically-emphasised tower built as base → shaft → crown: a wider battered base, ' +
    'an inset shaft with corner quoins, string-course rings and window slits per storey, and a ' +
    'crown that is a battlemented parapet, a pitched spire, or a flat cap. Rich exterior ' +
    'detailing (machicolations, merlons, bracket lanterns) gives it a proper silhouette.',
  knowledge: 'nbt/modules/structure/tower.md',
  keywords: /\b(tower|spire|turret|belfry|minaret|steeple|torre|campan|farol)\w*/i,
  preview: { size: [9, 18, 9], params: { crown: 'parapet' } },
  params: {
    crown: {
      kind: 'enum', default: 'parapet', values: ['parapet', 'spire', 'flat'], label: 'Crown',
      labels: { parapet: 'Parapet', spire: 'Spire', flat: 'Flat cap' },
    },
    decay: { kind: 'unit', default: 0 },
  },
  // A stone tower kit, so it reads right even under a sparse decoration. The
  // decoration overrides these (cozy makes it a warm timber tower).
  defaults: {
    wall: 'minecraft:stone_bricks',
    foundation: 'minecraft:cobblestone',
    corner: 'minecraft:stone_brick_wall',
    floor: 'minecraft:spruce_planks',
    trim: 'minecraft:stone_brick_slab',
    roof: 'minecraft:spruce_stairs',
    window: 'minecraft:glass_pane',
    light: 'minecraft:lantern',
  },
  build({ box, params, palette, seed }) {
    const { x0, y0, z0, x1, y1, z1, W, D, H } = box;
    const crown = params.crown as string;
    const decay = params.decay as number;
    const rnd = mulberry32(seed);

    const air = palette.air();
    const wall = palette.get('wall');
    const found = palette.get('foundation');
    const corner = palette.get('corner', logProps(palette.idOf('corner')));
    const floorIdx = palette.get('floor');
    const trim = palette.get('trim');
    const win = palette.get('window');
    const light = palette.get('light');
    const mossy = palette.weather('wall');

    const ops: AuthoringOp[] = [];
    const mid = (a: number, b: number) => Math.floor((a + b) / 2);

    // A 1-block margin (when the footprint is ≥5) holds the inset shaft so the base
    // and crown can overhang into it. Narrow towers skip the inset and projections.
    const hasMargin = W >= 5 && D >= 5;
    const sx0 = hasMargin ? x0 + 1 : x0;
    const sx1 = hasMargin ? x1 - 1 : x1;
    const sz0 = hasMargin ? z0 + 1 : z0;
    const sz1 = hasMargin ? z1 - 1 : z1;
    const shaftCorners: [number, number][] = [[sx0, sz0], [sx0, sz1], [sx1, sz0], [sx1, sz1]];

    // --- Base: a short, wider plinth in the foundation material (the batter). ---
    const baseTop = y0 + Math.min(2, Math.max(1, Math.floor(H / 8)));
    ops.push({ op: 'fill', from: [x0, y0, z0], to: [x1, y0, z1], state: found }); // floor slab
    ops.push({ op: 'walls', from: [x0, y0, z0], to: [x1, baseTop, z1], state: found });

    // --- Crown reservation: decide the wall top so the crown fits at the box top. ---
    const roofId = palette.idOf('roof');
    const minS = Math.min(sx1 - sx0 + 1, sz1 - sz0 + 1);
    const wantSpire = crown === 'spire' && roofId.endsWith('_stairs') && minS >= 3 && H >= 9;
    const spireRings = wantSpire ? Math.floor(minS / 2) + 1 : 0;
    const wantParapet = !wantSpire && crown !== 'flat' && hasMargin && H >= 8;
    const crownH = wantSpire ? spireRings : wantParapet ? 3 : 1;
    let wallTop = y1 - crownH;
    let simpleCrown = false;
    if (wallTop < baseTop + 3) {
      wallTop = y1; // too short for a real crown → plain capped column
      simpleCrown = true;
    }

    // --- Shaft: inset walls + a transition course capping the base. ---
    if (hasMargin) ops.push({ op: 'walls', from: [x0, baseTop, z0], to: [x1, baseTop, z1], state: trim });
    ops.push({ op: 'walls', from: [sx0, baseTop + 1, sz0], to: [sx1, wallTop, sz1], state: wall });

    // --- Corner quoins: full-height posts at the shaft corners. ---
    for (const [cx, cz] of shaftCorners) {
      ops.push({ op: 'fill', from: [cx, y0, cz], to: [cx, wallTop, cz], state: corner });
    }

    // --- Door: a 1-wide, 2-tall opening centred on the front (z0) base wall. ---
    const doorX = mid(x0, x1);
    ops.push({ op: 'fill', from: [doorX, y0 + 1, z0], to: [doorX, y0 + 2, z0], state: air });

    // --- Storeys: interior floor slabs + exterior string-course rings + window slits. ---
    const storeyH = 4;
    for (let fy = baseTop + storeyH; fy < wallTop - 1; fy += storeyH) {
      ops.push({ op: 'fill', from: [sx0 + 1, fy, sz0 + 1], to: [sx1 - 1, fy, sz1 - 1], state: floorIdx }); // floor
      ops.push({ op: 'walls', from: [sx0, fy, sz0], to: [sx1, fy, sz1], state: trim }); // string course (exterior)
    }
    // Vertical window slits: one 2-tall slit per face per storey, centred (skip the
    // ground front, where the door is).
    for (let fy = baseTop + 2; fy < wallTop - 1; fy += storeyH) {
      const cx = mid(sx0, sx1);
      const cz = mid(sz0, sz1);
      const top = Math.min(fy + 1, wallTop - 1);
      if (fy > baseTop + 2 || cx !== doorX) ops.push({ op: 'fill', from: [cx, fy, sz0], to: [cx, top, sz0], state: win });
      ops.push({ op: 'fill', from: [cx, fy, sz1], to: [cx, top, sz1], state: win });
      ops.push({ op: 'fill', from: [sx0, fy, cz], to: [sx0, top, cz], state: win });
      ops.push({ op: 'fill', from: [sx1, fy, cz], to: [sx1, top, cz], state: win });
    }

    // --- Bracket lanterns: lights projecting into the margin on the upper shaft. ---
    if (hasMargin && wallTop - baseTop >= 6) {
      const ly = wallTop - 2;
      const cx = mid(x0, x1);
      const cz = mid(z0, z1);
      ops.push({ op: 'block', pos: [cx, ly, z0], state: light });
      ops.push({ op: 'block', pos: [cx, ly, z1], state: light });
      ops.push({ op: 'block', pos: [x0, ly, cz], state: light });
      ops.push({ op: 'block', pos: [x1, ly, cz], state: light });
    }

    // --- Crown ---
    if (!simpleCrown && wantSpire) {
      ops.push({ op: 'fill', from: [sx0 + 1, wallTop, sz0 + 1], to: [sx1 - 1, wallTop, sz1 - 1], state: floorIdx }); // top floor
      ops.push({ op: 'roof', from: [sx0, wallTop + 1, sz0], to: [sx1, y1, sz1], state: palette.get('roof'), style: 'hip', fill: wall });
    } else if (!simpleCrown && wantParapet) {
      // Machicolation corbel ring (overhangs to the base width), the parapet wall on
      // top of it, then merlons in every other cell — the battlement.
      const py0 = wallTop + 1;
      ops.push({ op: 'walls', from: [x0, py0, z0], to: [x1, py0, z1], state: wall }); // corbel ring
      ops.push({ op: 'walls', from: [x0, py0 + 1, z0], to: [x1, py0 + 1, z1], state: wall }); // parapet wall
      // Merlons: raise alternate perimeter cells one higher.
      const my = py0 + 2;
      for (let x = x0; x <= x1; x++) {
        if ((x - x0) % 2 === 0) {
          ops.push({ op: 'block', pos: [x, my, z0], state: wall });
          ops.push({ op: 'block', pos: [x, my, z1], state: wall });
        }
      }
      for (let z = z0; z <= z1; z++) {
        if ((z - z0) % 2 === 0) {
          ops.push({ op: 'block', pos: [x0, my, z], state: wall });
          ops.push({ op: 'block', pos: [x1, my, z], state: wall });
        }
      }
    } else {
      // Flat / fallback cap: a trim ring at the top so the silhouette is finished.
      ops.push({ op: 'walls', from: [sx0, wallTop, sz0], to: [sx1, wallTop, sz1], state: trim });
    }

    // --- Decay (kept for future ruined decorations; cozy leaves this at 0). ---
    if (decay > 0) {
      for (let y = baseTop + 1; y <= wallTop; y++) {
        for (const [x, z] of edgeCells(sx0, sz0, sx1, sz1)) {
          if (shaftCorners.some(([cx, cz]) => cx === x && cz === z)) continue; // keep quoins
          const r = rnd();
          if (r < decay * 0.1) ops.push({ op: 'block', pos: [x, y, z], state: air });
          else if (r < decay * 0.1 + decay * 0.22) ops.push({ op: 'block', pos: [x, y, z], state: mossy });
        }
      }
    }
    return ops;
  },
};

/** The perimeter cells (x,z) of an inclusive rectangle, each once. */
function edgeCells(x0: number, z0: number, x1: number, z1: number): [number, number][] {
  const out: [number, number][] = [];
  for (let x = x0; x <= x1; x++) {
    out.push([x, z0]);
    if (z1 !== z0) out.push([x, z1]);
  }
  for (let z = z0 + 1; z < z1; z++) {
    out.push([x0, z]);
    if (x1 !== x0) out.push([x1, z]);
  }
  return out;
}
