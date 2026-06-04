// Parameterized structure templates: the "preset" building blocks the AI can
// drop in with one op instead of hand-authoring every wall. A template op
// (`{ op: 'template', name, from, to, params }`) is expanded HERE, in the
// compiler, into ordinary volumetric ops — so the model emits ~5 lines and the
// app produces correct geometry (cheaper to emit, more reliable than inventing
// massing from scratch every time).
//
// Each template is a pure function (box + params) → AuthoringOp[], referencing
// palette indices it interns by block name via the supplied `intern` helper.
// All geometry stays inside the [from..to] box (which the compiler has already
// bounds-checked), so a template can never write outside the structure.
//
// Add a new template: write its builder, register it in TEMPLATES, and list its
// block-name params in BLOCK_PARAM_KEYS so unknown-block validation can see them.
import type { AuthoringOp } from '../authoring/types';
import { isFootprintShape, makeFootprint } from './footprint';
import { mulberry32, seed3 } from './rng';

type Vec3 = [number, number, number];
type Props = Record<string, string>;
/** Get-or-create a palette index for a block name (+ optional blockstate props). */
export type Intern = (name: string, props?: Props) => number;

export const TEMPLATE_NAMES = ['abandoned_house', 'large_basement'] as const;
export type TemplateName = (typeof TEMPLATE_NAMES)[number];

export function isTemplateName(name: string): name is TemplateName {
  return (TEMPLATE_NAMES as readonly string[]).includes(name);
}

/** Which params of each template name a block ID, so the generator can validate
 *  them against the real content pack (a typo'd block in a param would otherwise
 *  slip past palette validation, since templates intern their own entries). */
const BLOCK_PARAM_KEYS: Record<TemplateName, string[]> = {
  abandoned_house: ['wall', 'corner', 'accent', 'floor', 'roof', 'window'],
  large_basement: ['wall', 'floor', 'ceiling', 'pillar', 'light'],
};

/** The block-name values supplied to a template op's params (for validation). */
export function templateBlockNames(name: string, params: Record<string, unknown>): string[] {
  if (!isTemplateName(name)) return [];
  const out: string[] = [];
  for (const key of BLOCK_PARAM_KEYS[name]) {
    const v = params[key];
    if (typeof v === 'string' && v.includes(':')) out.push(v);
  }
  return out;
}

// ── param coercion ───────────────────────────────────────────────────────────
function asStr(v: unknown, def: string): string {
  return typeof v === 'string' && v.trim() ? v.trim() : def;
}
function asInt(v: unknown, def: number, min: number, max: number): number {
  const n = typeof v === 'number' ? Math.trunc(v) : def;
  return Math.max(min, Math.min(max, Number.isFinite(n) ? n : def));
}
function as01(v: unknown, def: number): number {
  const n = typeof v === 'number' ? v : def;
  return Math.max(0, Math.min(1, Number.isFinite(n) ? n : def));
}

// ── small helpers ──────────────────────────────────────────────────────────
const bareId = (name: string): string => (name.includes(':') ? name.slice(name.indexOf(':') + 1) : name);

/** Vertical-axis blockstate for log-like blocks placed as posts. */
function logProps(name: string): Props | undefined {
  const id = bareId(name);
  return /(_log|_wood|_stem|_hyphae)$/.test(id) ? { axis: 'y' } : undefined;
}

/** A "weathered" variant of a wall block, for decay patches (else unchanged). */
function mossyVariant(name: string): string {
  const id = bareId(name);
  if (id === 'cobblestone') return 'minecraft:mossy_cobblestone';
  if (id === 'stone_bricks') return 'minecraft:mossy_stone_bricks';
  if (id === 'stone_brick_wall') return 'minecraft:mossy_stone_brick_wall';
  if (id === 'cobblestone_wall') return 'minecraft:mossy_cobblestone_wall';
  return name;
}

interface Box {
  x0: number; y0: number; z0: number;
  x1: number; y1: number; z1: number;
}
function box(from: Vec3, to: Vec3): Box {
  return {
    x0: Math.min(from[0], to[0]), x1: Math.max(from[0], to[0]),
    y0: Math.min(from[1], to[1]), y1: Math.max(from[1], to[1]),
    z0: Math.min(from[2], to[2]), z1: Math.max(from[2], to[2]),
  };
}

// ── templates ────────────────────────────────────────────────────────────────

/** A storeyed house with a pitched stair roof, framed corners, carved door and
 *  windows, and optional decay (holes + moss). Params (all optional): wall,
 *  corner/accent, floor, roof (a *_stairs block), window, floors (1-4), decay. */
function abandonedHouse(from: Vec3, to: Vec3, params: Record<string, unknown>): (intern: Intern) => AuthoringOp[] {
  return (intern) => {
    const { x0, y0, z0, x1, y1, z1 } = box(from, to);
    const W = x1 - x0 + 1, D = z1 - z0 + 1, H = y1 - y0 + 1;
    const ops: AuthoringOp[] = [];

    const wallName = asStr(params.wall, 'minecraft:cobblestone');
    const cornerName = asStr(params.corner ?? params.accent, 'minecraft:spruce_log');
    const floorName = asStr(params.floor, 'minecraft:spruce_planks');
    const roofName = asStr(params.roof, 'minecraft:spruce_stairs');
    const windowName = asStr(params.window, 'minecraft:glass_pane');
    const floors = asInt(params.floors, 1, 1, 4);
    const decay = as01(params.decay, 0.2);

    const air = intern('minecraft:air');
    const wall = intern(wallName);
    const corner = intern(cornerName, logProps(cornerName));
    const floorIdx = intern(floorName);
    const win = intern(windowName);
    const mossy = intern(mossyVariant(wallName));

    // Reserve the top of the box for the roof (it climbs ~1 ring per step), but
    // keep walls at least 3 tall; fall back to a flat top for very short boxes.
    const roofRings = Math.max(1, Math.floor(Math.min(W, D) / 2));
    let wallTop = y1 - roofRings;
    const doRoof = roofName.endsWith('_stairs') && H >= 5 && wallTop >= y0 + 3;
    if (!doRoof) wallTop = y1;

    ops.push({ op: 'fill', from: [x0, y0, z0], to: [x1, y0, z1], state: wall }); // foundation slab
    ops.push({ op: 'walls', from: [x0, y0, z0], to: [x1, wallTop, z1], state: wall }); // shell (4 sides)
    for (const [cx, cz] of [[x0, z0], [x0, z1], [x1, z0], [x1, z1]] as [number, number][]) {
      ops.push({ op: 'fill', from: [cx, y0, cz], to: [cx, wallTop, cz], state: corner }); // framed corner posts
    }

    // Upper-storey floor slabs, spread evenly up the wall.
    const storeyH = Math.max(3, Math.floor((wallTop - y0) / floors));
    for (let f = 1; f < floors; f++) {
      const fy = y0 + f * storeyH;
      if (fy < wallTop - 1) ops.push({ op: 'fill', from: [x0 + 1, fy, z0 + 1], to: [x1 - 1, fy, z1 - 1], state: floorIdx });
    }

    // Door: a 1-wide, 2-tall opening centred on the front (z0) wall.
    const doorX = Math.floor((x0 + x1) / 2);
    ops.push({ op: 'fill', from: [doorX, y0 + 1, z0], to: [doorX, y0 + 2, z0], state: air });

    // Windows: one band per storey on every wall, skipping the door column.
    for (let f = 0; f < floors; f++) {
      const wy = y0 + f * storeyH + 2;
      if (wy >= wallTop) break;
      for (let x = x0 + 2; x <= x1 - 2; x += 3) {
        if (x === doorX && f === 0) continue;
        ops.push({ op: 'block', pos: [x, wy, z0], state: win });
        ops.push({ op: 'block', pos: [x, wy, z1], state: win });
      }
      for (let z = z0 + 2; z <= z1 - 2; z += 3) {
        ops.push({ op: 'block', pos: [x0, wy, z], state: win });
        ops.push({ op: 'block', pos: [x1, wy, z], state: win });
      }
    }

    if (doRoof) ops.push({ op: 'roof', from: [x0, wallTop + 1, z0], to: [x1, y1, z1], state: intern(roofName), style: 'gable', fill: wall });

    // Decay: punch holes and weather the walls (corners + foundation spared so
    // the frame and roof stay supported). Deterministic per box.
    if (decay > 0) {
      const rnd = mulberry32(seed3(x0, y0, z0));
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
  };
}

/** A sunken cellar carved to a varied footprint (rect/L/T/U/plus, seeded — so it
 *  isn't always a square box): a SEALED stone shell with a distinct floor/ceiling
 *  and a grid of support pillars (lit on top). No built-in access — the ceiling is
 *  solid so terrain can't reveal the interior; the caller carves the connection to
 *  the house above. Params (all optional): wall, floor, ceiling, pillar, light, decay, shape, seed.
 *  The box should already sit at the depth you want (y grows up, so place it low). */
function largeBasement(from: Vec3, to: Vec3, params: Record<string, unknown>): (intern: Intern) => AuthoringOp[] {
  return (intern) => {
    const { x0, y0, z0, x1, y1, z1 } = box(from, to);
    const ops: AuthoringOp[] = [];

    const wallName = asStr(params.wall, 'minecraft:cobblestone');
    const floorName = asStr(params.floor, 'minecraft:stone_bricks');
    const ceilName = asStr(params.ceiling, wallName);
    const pillarName = asStr(params.pillar, 'minecraft:stone_bricks');
    const lightName = asStr(params.light, 'minecraft:lantern');
    const decay = as01(params.decay, 0.25);
    const shapeParam = asStr(params.shape, 'auto');
    const shape = isFootprintShape(shapeParam) ? shapeParam : 'auto';
    const seed = asInt(params.seed, seed3(x0, y0, z0), 0, 0x7fffffff);

    const wall = intern(wallName);
    const floorIdx = intern(floorName);
    const ceil = intern(ceilName);
    const pillar = intern(pillarName, logProps(pillarName));
    const light = intern(lightName);
    const mossy = intern(mossyVariant(wallName));

    const fp = makeFootprint({ x0, z0, x1, z1 }, shape, seed);

    // Floor + ceiling on every footprint column; perimeter columns also get a
    // full-height wall (interior columns stay hollow → cleared to air on compile).
    for (const [x, z] of fp.columns()) {
      ops.push({ op: 'block', pos: [x, y0, z], state: floorIdx });
      ops.push({ op: 'block', pos: [x, y1, z], state: ceil });
      if (fp.isEdge(x, z)) ops.push({ op: 'fill', from: [x, y0 + 1, z], to: [x, y1 - 1, z], state: wall });
    }

    // Support pillars on a 4-block grid, but only on interior footprint cells; each
    // capped with a light just under the ceiling so the cellar reads as lit.
    for (let x = x0 + 3; x <= x1 - 3; x += 4) {
      for (let z = z0 + 3; z <= z1 - 3; z += 4) {
        if (!fp.has(x, z) || fp.isEdge(x, z)) continue;
        ops.push({ op: 'fill', from: [x, y0 + 1, z], to: [x, y1 - 1, z], state: pillar });
        ops.push({ op: 'block', pos: [x, y1 - 1, z], state: light });
      }
    }

    // No vertical access here on purpose: the cellar is a SEALED box (solid ceiling,
    // no hole, no ladder) so terrain can never reveal its interior when the structure
    // is placed on uneven ground. The model connects it to the house above
    // deliberately in the circulation pass, carving the stairwell where they meet.

    // Decay: weather some perimeter wall cells with moss.
    if (decay > 0) {
      const rnd = mulberry32(seed ^ 0x9e3779b9);
      for (const [x, z] of fp.columns()) {
        if (!fp.isEdge(x, z)) continue;
        for (let y = y0 + 1; y < y1; y++) {
          if (rnd() < decay * 0.3) ops.push({ op: 'block', pos: [x, y, z], state: mossy });
        }
      }
    }
    return ops;
  };
}

const TEMPLATES: Record<TemplateName, (from: Vec3, to: Vec3, params: Record<string, unknown>) => (intern: Intern) => AuthoringOp[]> = {
  abandoned_house: abandonedHouse,
  large_basement: largeBasement,
};

/** Expand a template op into ordinary ops. Throws on an unknown template name so
 *  validation/compile surfaces an actionable error to the generator. */
export function expandTemplate(
  name: string,
  from: Vec3,
  to: Vec3,
  params: Record<string, unknown>,
  intern: Intern,
): AuthoringOp[] {
  if (!isTemplateName(name)) {
    throw new Error(`unknown template "${name}" — available: ${TEMPLATE_NAMES.join(', ')}`);
  }
  return TEMPLATES[name](from, to, params)(intern);
}
