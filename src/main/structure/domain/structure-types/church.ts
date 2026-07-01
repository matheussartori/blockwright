// "Church" — a long-nave place of worship crowned by a prominent front BELL TOWER with a
// pointed spire and a cross. Like the keep/spire towers, the church OWNS its crown in code
// (the steep nave roof + the steeple ARE its identity, so there's no Roof slot): it builds
// a buttressed nave with tall arched windows, a steep gabled roof, and a square front tower
// that rises clear of the ridge to a stepped spire topped by a cross. The decoration only
// supplies materials — pair it with `chapel` for whitewashed plaster over stone (the
// default), or `castle` for an all-grey stone cathedral. Single tall nave by default; an
// extra gallery floor is possible. Links to every Basement (a crypt below), Surroundings
// (a graveyard or garden yard) and Room module via the `church` group.
import type { AuthoringOp } from '../../authoring/types';
import { planStoreys } from '@/shared/domain/storeys';
import { insetHouseBox, yardFor } from '../surroundings';
import { ceilingLanterns, cornerPosts, roofCap, roofFormFor, roofStair, seatDoor, storeySlabs, storeyEntries } from './shell-kit';
import { addStairCore } from './stair-core';
import { type Box, type BuildArgs, box as mkBox, logProps, type FloorPlanEntry, type StructureType } from './types';

// ── plan() — the single source of the nave's vertical lines, shared by build()+floors() ──

interface ChurchPlan {
  /** Floor-slab Ys of the nave storeys, bottom-up. */
  slabYs: number[];
  /** Eaves line of the nave walls (where the gable roof springs from). */
  naveWallTop: number;
  /** Ridge/clamp height of the nave gable roof (kept below the tower so it reads taller). */
  naveTopBudget: number;
  /** Top of the tower shaft (the spire springs from here up to the box top). */
  towerWallTop: number;
  /** The square front-tower footprint. */
  t: { x0: number; x1: number; z0: number; z1: number };
}

// Budgeted TOP-DOWN so the steeple always has room: the spire takes the top cells, the
// nave ridge sits a clear gap below the tower shaft, and the nave walls fill the rest with
// a roof reserve that the gable op decks/truncates if the box is short.
function plan(b: Box, floors: number, floorHeights?: number[]): ChurchPlan {
  const t = towerRect(b);
  const towerSide = t.x1 - t.x0 + 1;
  const spireH = Math.max(4, Math.floor(towerSide / 2) + 2);
  const towerWallTop = Math.max(b.y0 + 4, b.y1 - spireH);
  const naveTopBudget = Math.max(b.y0 + 4, towerWallTop - 2);
  const roofRise = Math.min(
    Math.max(2, Math.floor(Math.min(b.W, b.D) / 2) + 1),
    Math.max(2, Math.floor((naveTopBudget - b.y0) * 0.55)),
  );
  const naveCeil = Math.max(b.y0 + 5, naveTopBudget - roofRise);
  const { slabYs, wallTop } = planStoreys({ baseY: b.y0, idealTop: naveCeil, maxWallTop: naveCeil, floors, floorHeights });
  return { slabYs, naveWallTop: wallTop, naveTopBudget, towerWallTop, t };
}

/** The square front-tower footprint: centred on width, seated at the front (z0) wall,
 *  odd-sided so a central bay carries the door, and never so deep it eats the nave. */
function towerRect(b: Box): { x0: number; x1: number; z0: number; z1: number } {
  const cx = Math.floor((b.x0 + b.x1) / 2);
  let side = Math.min(9, b.W - 2, Math.max(5, Math.floor(b.D * 0.5)));
  side = Math.max(3, side);
  if (side % 2 === 0) side -= 1;
  const x0 = cx - Math.floor(side / 2);
  return { x0, x1: x0 + side - 1, z0: b.z0, z1: b.z0 + side - 1 };
}

// ── spire + cross ───────────────────────────────────────────────────────────────────────

/** A ring of roof-stairs around a rect at height y, each side facing OUTWARD so it sheds
 *  like an eave course (the building block of the stepped pyramidal spire). */
function ringStairs(
  ops: AuthoringOp[],
  palette: BuildArgs['palette'],
  x0: number, x1: number, z0: number, z1: number, y: number,
): void {
  const s = (facing: string): number => roofStair(palette, facing);
  ops.push({ op: 'fill', from: [x0, y, z0], to: [x1, y, z0], state: s('north') }); // front edge, sheds -z
  ops.push({ op: 'fill', from: [x0, y, z1], to: [x1, y, z1], state: s('south') }); // back edge, sheds +z
  ops.push({ op: 'fill', from: [x0, y, z0], to: [x0, y, z1], state: s('west') });  // left edge, sheds -x
  ops.push({ op: 'fill', from: [x1, y, z0], to: [x1, y, z1], state: s('east') });  // right edge, sheds +x
}

/** A small upright cross (a vertical post + side arms), placed at the spire tip and clamped
 *  under the box top so it never overflows. */
function addCross(ops: AuthoringOp[], palette: BuildArgs['palette'], cx: number, cz: number, y: number, yMax: number): void {
  const accent = palette.get('accent');
  ops.push({ op: 'block', pos: [cx, y, cz], state: accent });
  const armY = Math.min(yMax, y + 1);
  ops.push({ op: 'block', pos: [cx - 1, armY, cz], state: accent });
  ops.push({ op: 'block', pos: [cx + 1, armY, cz], state: accent });
  ops.push({ op: 'block', pos: [cx, armY, cz], state: accent });
  if (armY + 1 <= yMax) ops.push({ op: 'block', pos: [cx, armY + 1, cz], state: accent });
}

/** The stepped pyramidal spire over the tower: an outward-shedding eave ring at the base
 *  (covers every tower column overhead), inward-stepping rings climbing to a finial, capped
 *  by a cross. */
function addSpire(
  ops: AuthoringOp[],
  palette: BuildArgs['palette'],
  t: { x0: number; x1: number; z0: number; z1: number },
  base: number,
  yMax: number,
): void {
  let { x0, x1, z0, z1 } = t;
  let y = base;
  ringStairs(ops, palette, x0, x1, z0, z1, y);
  while (x1 - x0 >= 2 && z1 - z0 >= 2 && y + 1 < yMax) {
    y += 1;
    x0 += 1; x1 -= 1; z0 += 1; z1 -= 1;
    ringStairs(ops, palette, x0, x1, z0, z1, y);
  }
  const cx = Math.floor((t.x0 + t.x1) / 2);
  const cz = Math.floor((t.z0 + t.z1) / 2);
  const tip = Math.min(yMax, y + 1);
  ops.push({ op: 'fill', from: [cx, base, cz], to: [cx, tip, cz], state: palette.get('beam') }); // central mast
  if (tip + 1 <= yMax) addCross(ops, palette, cx, cz, tip + 1, yMax);
}

// ── the type ─────────────────────────────────────────────────────────────────────────────

const SURROUND_LABELS = { none: 'None', garden: 'Garden', graveyard: 'Graveyard' };

export const church: StructureType = {
  id: 'church',
  label: 'Church',
  category: 'structure',
  group: 'church',
  description:
    'A long-nave place of worship crowned by a prominent front bell tower: a buttressed ' +
    'hall of tall arched windows under a steep gabled roof, with a square steeple that rises ' +
    'clear of the ridge to a stepped spire topped by a cross. Owns its roof and steeple in ' +
    'code (no Roof slot). Pair it with the Chapel decoration for whitewashed plaster over ' +
    'stone, or Castle for an all-grey stone cathedral.',
  knowledge: 'nbt/modules/structure/church.md',
  preview: { size: [13, 22, 19], params: { decoration: 'chapel', floors: 1 } },
  maxRoomsPerFloor: 1,
  complex: true,
  seedShell: true,
  pairedDecoration: 'chapel',
  params: {
    floors: { kind: 'int', default: 1, min: 1, max: 3, label: 'Floors' },
    surroundings: { kind: 'enum', default: 'none', values: ['none', 'garden', 'graveyard'], labels: SURROUND_LABELS, label: 'Surroundings', module: 'surroundings' },
    decay: { kind: 'unit', default: 0, label: 'Decay' },
  },
  // Whitewashed plaster over a dressed-stone skeleton + a steep dark roof — reads as a church
  // even under a sparse decoration.
  defaults: {
    wall: 'minecraft:smooth_quartz',
    floor: 'minecraft:stone_bricks',
    ceiling: 'minecraft:smooth_quartz',
    foundation: 'minecraft:stone_bricks',
    corner: 'minecraft:stone_bricks',
    accent: 'minecraft:chiseled_stone_bricks',
    trim: 'minecraft:stone_brick_slab',
    beam: 'minecraft:polished_deepslate',
    pillar: 'minecraft:stone_bricks',
    roof: 'minecraft:deepslate_tile_stairs',
    window: 'minecraft:glass_pane',
    glass: 'minecraft:glass',
    door: 'minecraft:dark_oak_door',
    fence: 'minecraft:dark_oak_fence',
    light: 'minecraft:lantern',
  },

  build(args: BuildArgs): AuthoringOp[] {
    const { params, palette, surroundSizing, composeModule } = args;
    const outer = args.box;
    const floors = Math.max(1, Math.trunc(Number(params.floors) || 1));

    // Surroundings: the user's W×D is the building shell; a yard pick grows the box and is
    // laid OUTSIDE this inner box (the same inset floors() uses).
    const yard = yardFor(outer, params, surroundSizing);
    const b = yard ? insetHouseBox(outer, yard, surroundSizing) : outer;

    const ops: AuthoringOp[] = [];
    if (yard) {
      ops.push(...composeModule('surroundings', yard, [outer.x0, outer.y0, outer.z0], [outer.x1, outer.y1, outer.z1], { surroundSizing }));
    }

    const { x0, y0, z0, x1, y1, z1, W, D } = b;
    const cx = Math.floor((x0 + x1) / 2);
    const { slabYs, naveWallTop, naveTopBudget, towerWallTop, t } = plan(b, floors, args.floorHeights);

    const wall = palette.get('wall');
    const floor = palette.get('floor');
    const corner = palette.get('corner', logProps(palette.idOf('corner')));
    const accent = palette.get('accent');
    const glass = palette.get('glass');
    const lantern = palette.get('light', { hanging: 'true' });
    const air = palette.air();
    const longAxis: 'x' | 'z' = W >= D ? 'x' : 'z';

    // Foundation + nave floor slab.
    ops.push({ op: 'fill', from: [x0, y0, z0], to: [x1, y0, z1], state: palette.get('foundation') });
    ops.push({ op: 'fill', from: [x0, y0 + 1, z0], to: [x1, y0 + 1, z1], state: floor });
    ops.push(...storeySlabs(slabYs, { x0, z0, x1, z1 }, naveWallTop, floor));

    // Nave shell + dressed-stone quoins at the corners.
    ops.push({ op: 'walls', from: [x0, y0, z0], to: [x1, naveWallTop, z1], state: wall });
    ops.push(...cornerPosts([[x0, z0], [x1, z0], [x0, z1], [x1, z1]], y0, naveWallTop, corner));

    // Buttress pilasters: a stone strip every ~4 cells along the long eave walls.
    const buttress = palette.get('pillar');
    if (longAxis === 'x') {
      for (let x = x0 + 3; x <= x1 - 3; x += 4) {
        ops.push({ op: 'fill', from: [x, y0, z0], to: [x, naveWallTop - 1, z0], state: buttress });
        ops.push({ op: 'fill', from: [x, y0, z1], to: [x, naveWallTop - 1, z1], state: buttress });
      }
    } else {
      for (let z = z0 + 3; z <= z1 - 3; z += 4) {
        ops.push({ op: 'fill', from: [x0, y0, z], to: [x0, naveWallTop - 1, z], state: buttress });
        ops.push({ op: 'fill', from: [x1, y0, z], to: [x1, naveWallTop - 1, z], state: buttress });
      }
    }

    // Tall arched windows between the buttresses, on the long eave walls.
    const winBottom = y0 + 2;
    const winTop = naveWallTop - 2;
    const archWindow = (wx: number, wz: number): void => {
      if (winTop - winBottom < 2) return;
      ops.push({ op: 'fill', from: [wx, winBottom, wz], to: [wx, winTop - 1, wz], state: glass });
      ops.push({ op: 'block', pos: [wx, winTop, wz], state: accent }); // arched head
      ops.push({ op: 'block', pos: [wx, winBottom - 1, wz], state: palette.get('trim') }); // sill
    };
    if (longAxis === 'x') {
      for (let x = x0 + 2; x <= x1 - 2; x += 4) {
        archWindow(x, z1);
        if (x < t.x0 - 1 || x > t.x1 + 1) archWindow(x, z0); // skip the tower's front bay
      }
    } else {
      for (let z = Math.max(z0 + 2, t.z1 + 2); z <= z1 - 2; z += 4) {
        archWindow(x0, z);
        archWindow(x1, z);
      }
    }
    // A tall window high on the back gable.
    if (longAxis === 'z') ops.push({ op: 'fill', from: [cx, naveWallTop - 4, z1], to: [cx, naveWallTop - 1, z1], state: glass });

    // Nave gable roof over the WHOLE footprint (the tower punches up through it — refs show a
    // steeple rising from the ridge). roofFormFor guarantees a cap (flat fallback) so it's
    // never roofless.
    const canPitch = palette.idOf('roof').endsWith('_stairs');
    const form = roofFormFor('gable', naveTopBudget - naveWallTop, canPitch);
    ops.push(...roofCap(composeModule, form, [x0, naveWallTop + 1, z0], [x1, naveTopBudget, z1], longAxis));

    // ── Front bell tower (its shaft top + spire room are budgeted in plan()) ──
    ops.push({ op: 'walls', from: [t.x0, y0, t.z0], to: [t.x1, towerWallTop, t.z1], state: wall });
    ops.push(...cornerPosts([[t.x0, t.z0], [t.x1, t.z0], [t.x0, t.z1], [t.x1, t.z1]], y0, towerWallTop, corner));
    // Re-open the tower shaft (the nave roof intruded over its footprint) and link it to the
    // nave with a ground archway through the shared (tz1) wall.
    if (t.x1 - 1 >= t.x0 + 1 && towerWallTop > naveWallTop) {
      ops.push({ op: 'fill', from: [t.x0 + 1, naveWallTop + 1, t.z0 + 1], to: [t.x1 - 1, towerWallTop, t.z1 - 1], state: air });
    }
    ops.push({ op: 'fill', from: [cx - 1, y0 + 1, t.z1], to: [cx + 1, y0 + 3, t.z1], state: air }); // tower↔nave arch

    // Belfry: a louvered opening high on each tower face + a lantern (the bell light).
    const louver = palette.get('fence');
    const beY = towerWallTop - 1;
    if (beY > naveTopBudget) {
      ops.push({ op: 'block', pos: [cx, beY, t.z0], state: louver });
      ops.push({ op: 'block', pos: [cx, beY, t.z1], state: louver });
      ops.push({ op: 'block', pos: [t.x0, beY, Math.floor((t.z0 + t.z1) / 2)], state: louver });
      ops.push({ op: 'block', pos: [t.x1, beY, Math.floor((t.z0 + t.z1) / 2)], state: louver });
      ops.push({ op: 'block', pos: [cx, beY, Math.floor((t.z0 + t.z1) / 2)], state: palette.get('light', { hanging: 'true' }) });
    }

    // Spire + cross over the tower.
    addSpire(ops, palette, t, towerWallTop + 1, y1);

    // Entrance: a tall arched portal at the tower's front-centre bay.
    ops.push({ op: 'fill', from: [cx, y0 + 1, z0], to: [cx, y0 + 3, z0], state: air }); // door reveal
    ops.push(...seatDoor(palette, cx, y0 + 1, z0));
    ops.push({ op: 'block', pos: [cx - 1, y0 + 1, z0], state: accent }); // jambs
    ops.push({ op: 'block', pos: [cx + 1, y0 + 1, z0], state: accent });
    ops.push({ op: 'block', pos: [cx, y0 + 4, z0], state: accent }); // arch keystone
    ops.push({ op: 'block', pos: [cx, y0 + 1, z0 + 1], state: palette.get('trim') }); // threshold

    // Guaranteed interior light down the nave.
    ops.push(...ceilingLanterns(slabYs, naveWallTop, cx, Math.floor((z0 + z1) / 2), lantern));

    // Circulation: a stair core only when there's a gallery floor; the tower always gets a
    // ladder up to the belfry so the steeple is reachable.
    if (floors >= 2) {
      addStairCore({ ops, box: mkBox([x0, y0, z0], [x1, naveWallTop, z1]), slabYs, palette });
    }
    const ladder = palette.get('ladder', { facing: 'south' });
    for (let y = y0 + 1; y <= towerWallTop; y++) ops.push({ op: 'block', pos: [cx, y, t.z0 + 1], state: ladder });

    return ops;
  },

  floors(box: Box, params, floorHeights, surroundSizing): FloorPlanEntry[] {
    const yard = yardFor(box, params, surroundSizing);
    const b = yard ? insetHouseBox(box, yard, surroundSizing) : box;
    const floors = Math.max(1, Math.trunc(Number(params.floors) || 1));
    const { slabYs, naveWallTop } = plan(b, floors, floorHeights);
    return storeyEntries(slabYs, naveWallTop);
  },
};
