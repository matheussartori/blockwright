// The cross: turn a `template` op (a structure-type name + a box + loose params) into
// ordinary volumetric ops by resolving a TYPE and a DECORATION and letting the type
// build its massing against a decoration-backed role palette. The op stays `template`
// in the authoring schema.
//
// Resolution order for a role's block: per-op override (a param keyed by the role
// name) > decoration.blocks[role] > type.defaults[role] > BASE_BLOCKS[role]. The
// decoration also supplies decay weathering and the default decay level.
import type { AuthoringOp } from '../authoring/types';
import {
  DEFAULT_DECORATION,
  getDecoration,
  decorationIds,
  type Decoration,
} from './decorations';
import { getBasement } from './basements';
import { getGeometryModule } from './categories';
import type { GeometryModule } from './geometry-module';
import { resolveParams, type ParamValues } from './params';
import { basementCeilingLayer, basementDepth, sanitizeBasementHeights, sanitizeFloorHeights } from '@/shared/domain/storeys';
import { sanitizeSurroundSizing } from '@/shared/domain/surroundings';
import { BASE_BLOCKS, isRole, type Role } from './roles';
import { seed3 } from './rng';
import {
  getStructureType,
  isStructureType,
  structureTypeIds,
  type RolePalette,
} from './structure-types';
import { basementBox, houseEnvelopeBox, insetHouseBox, yardFor } from './surroundings';
import { box, type BuildArgs } from './structure-types/types';

type Vec3 = [number, number, number];

/** Get-or-create a palette index for a block name (+ optional blockstate props) —
 *  supplied by the compiler so a composed build interns into the same palette. */
export type Intern = (name: string, props?: Record<string, string>) => number;

/** Is `name` a buildable structure type? */
export function isKnownStructure(name: string): boolean {
  return isStructureType(name);
}

/** Every name a `template` op may use (structure-type ids), for validation messages. */
export function knownStructureNames(): string[] {
  return structureTypeIds();
}

/** The block ids supplied as per-role overrides in a `template` op's params (keys
 *  that name a Role). These are the only block names a template contributes that the
 *  generator must validate against the content pack — decoration/type kits are curated. */
export function composeBlockNames(params: Record<string, unknown>): string[] {
  const out: string[] = [];
  for (const [k, v] of Object.entries(params ?? {})) {
    if (isRole(k) && typeof v === 'string' && v.includes(':')) out.push(v);
  }
  return out;
}

/** The decoration id a `template` op selects, accepting either `decoration` or the
 *  legacy `theme` param key; falls back to the default decoration. */
function decorationId(params: Record<string, unknown>): string {
  if (typeof params.decoration === 'string' && params.decoration) return params.decoration;
  if (typeof params.theme === 'string' && params.theme) return params.theme;
  return DEFAULT_DECORATION;
}

/**
 * Build the role→palette-index resolver for a (defaults-kit, decoration, overrides)
 * triple. Resolution order per role: per-op override > decoration > defaults > BASE_BLOCKS.
 *
 * @param defaults - The module's own block kit (a structure type's, or a roof/basement
 *   module's), consulted after the decoration and before BASE_BLOCKS.
 * @param deco - The active decoration (maps roles→blocks + the weathering function).
 * @param raw - The op's raw params; a key naming a Role is a per-op block override.
 * @param intern - The compiler's get-or-create palette intern.
 * @param preferDefaults - When true, the module's own `defaults` win OVER the decoration's
 *   block map (the decoration still supplies weathering/decay). Used for a BASEMENT: a
 *   crypt/cellar is a self-contained stone vault, so a strong host decoration (e.g. the
 *   gothic manor's dark-oak walls) must NOT re-skin its stone into timber.
 * @returns A {@link RolePalette} that interns a role's resolved (or weathered) block.
 */
function makePalette(
  defaults: Partial<Record<Role, string>>,
  deco: Decoration,
  raw: Record<string, unknown>,
  intern: Intern,
  preferDefaults = false,
): RolePalette {
  // The mod-block override map (`params.modBlocks`, role→mod block id) wins over EVERYTHING
  // — it's how a "prefer mod blocks" build comes out in the mod's materials. It rides as its
  // own object (not role-keyed params) so it can't collide with the `roof` param (which is
  // the roof-MODULE enum gable/hip/flat, not a material). Sparse: a role it omits falls
  // through to the per-op override / decoration / defaults as usual.
  const modBlocks = (raw.modBlocks ?? null) as Record<string, string> | null;
  const idOf = (role: Role): string => {
    const mod = modBlocks?.[role];
    if (typeof mod === 'string' && mod.includes(':')) return mod;
    const override = raw[role];
    if (typeof override === 'string' && override.includes(':')) return override;
    return preferDefaults
      ? defaults[role] ?? deco.blocks[role] ?? BASE_BLOCKS[role]
      : deco.blocks[role] ?? defaults[role] ?? BASE_BLOCKS[role];
  };
  const weather = deco.weather ?? ((b: string) => b);
  return {
    idOf,
    get: (role, props) => intern(idOf(role), props),
    weather: (role, props) => intern(weather(idOf(role)), props),
    air: () => intern('minecraft:air'),
  };
}

/** Apply the decoration's default decay level to resolved params — unless the build
 *  declares a `decay` param at all, OR an explicit `decay` was passed in any raw source
 *  (op params, delegate extras). One place so the structure/module/delegate paths can't
 *  drift on how the "cozy = 0, op param wins" rule works. */
function applyDecorationDecay(values: ParamValues, deco: Decoration, ...raws: Record<string, unknown>[]): void {
  if (deco.decay === undefined || !('decay' in values)) return;
  if (raws.some((r) => r.decay !== undefined)) return;
  values.decay = deco.decay;
}

/** Resolve the decoration a `template`/module op selects, throwing an actionable error
 *  if it names an unknown one. */
function resolveDecoration(params: Record<string, unknown>): Decoration {
  const decoId = decorationId(params);
  const deco = getDecoration(decoId);
  if (!deco) {
    throw new Error(`unknown decoration "${decoId}" — available: ${decorationIds().join(', ')}`);
  }
  return deco;
}

/** Per-build seed: explicit `seed` param, else derived from the box origin. */
function seedFor(params: Record<string, unknown>, b: ReturnType<typeof box>): number {
  return typeof params.seed === 'number' && Number.isFinite(params.seed)
    ? Math.trunc(params.seed)
    : seed3(b.x0, b.y0, b.z0);
}

/** The selected basement MODULE id from raw params (the Details "Basement" slot rides
 *  in as `params.basement` = a module id), or undefined when none/unknown — an unknown
 *  id is reported through `warn` instead of vanishing silently. A structure type that
 *  declares its OWN `basement` param (classic) handles burial itself, so the central
 *  path is skipped for it (the caller checks `'basement' in type.params`). */
export function selectedBasement(params: Record<string, unknown>, warn?: (message: string) => void): string | undefined {
  const id = params.basement;
  if (typeof id !== 'string' || id === '' || id === 'none') return undefined;
  if (!getBasement(id)) {
    warn?.(`Unknown basement module "${id}" — the basement was skipped. Use one of the known basement ids.`);
    return undefined;
  }
  return id;
}

/** Below-grade height reserved at the BOTTOM of the box for a centrally-composed
 *  basement when the user supplied no explicit per-level heights: ~1/5 of the box,
 *  clamped so the vault has headroom but the above-ground storeys keep theirs. */
export function basementHeight(H: number): number {
  return Math.min(6, Math.max(4, Math.round(H * 0.2)));
}

/**
 * Compose a centrally-managed basement STACK below the ground floor: one sealed module
 * vault per level (top-down `levelHeights`, the deepest at the box bottom) laid at the
 * basement FOOTPRINT (which may be wider than the house — excavated beyond its walls),
 * plus ONE continuous descent ladder linking the deepest level up to the ground floor,
 * landing inside the HOUSE box (so the climb ends in the house, not out under the lawn) with
 * a step-off + 2-block headroom at EVERY level so each level is reachable.
 *
 * The ladder hangs on a thin solid spine so it attaches even when the house corner sits
 * away from a basement wall (an enlarged, centred undercroft). When `groundY` is one above
 * the vault stack's top (an enlarged basement reserves its OWN ceiling deck below the yard),
 * the ladder climbs the extra cell so it still reaches the house floor. Emitted by the caller
 * after the type's foundation slab so the stairwell carve survives; below-grade gaps are
 * excluded from `rebuildStairwells`, so this descent is the authoritative one (not rebuilt).
 *
 * @param composeModule - The build's module delegate (lays each vault, records the pick).
 * @param id - The basement-module id (cellar/crypt/cult-temple).
 * @param foot - The basement footprint box (X/Z; its Y range is replaced per level).
 * @param baseY - The deepest basement floor Y (the box bottom).
 * @param levelHeights - Per-level slab-to-slab heights, top-down (index 0 = under ground).
 * @param groundY - The ground-floor slab Y the descent climbs out to (≥ the vault top).
 * @param interior - The host's ground-floor INTERIOR rect (walkable area); the ladder lands in
 *   its back-left corner, so the climb surfaces in the usable room, never inside a thick wall.
 * @param palette - The HOST palette (supplies the ladder + the spine backing).
 * @returns The vault + descent ops.
 */
function composeBasementStack(
  composeModule: BuildArgs['composeModule'],
  id: string,
  foot: ReturnType<typeof box>,
  baseY: number,
  levelHeights: number[],
  groundY: number,
  interior: { x0: number; z0: number; x1: number; z1: number },
  palette: RolePalette,
): { vault: AuthoringOp[]; descent: AuthoringOp[] } {
  const vault: AuthoringOp[] = [];
  // Each level as a sealed rect vault, stacked downward from the vault top. Adjacent decks
  // coincide (one level's ceiling is the next's floor) — harmless overwrite. The top ceiling
  // sits at `vaultTop`; an enlarged basement reserves `groundY > vaultTop` so this ceiling
  // is a DEDICATED deck below the yard ground (re-blockable without touching the yard).
  const vaultTop = baseY + basementDepth(levelHeights);
  let top = vaultTop;
  // The Y of every level's FLOOR (a slab-to-slab deck), bottom-up — each gets a step-off.
  const levelFloors: number[] = [baseY];
  for (const h of levelHeights) {
    const bottom = top - h;
    vault.push(...composeModule('basement', id, [foot.x0, bottom, foot.z0], [foot.x1, top, foot.z1], { shape: 'rect' }));
    if (bottom > baseY) levelFloors.push(bottom);
    top = bottom;
  }
  // Descent ladder in the ground floor's back-left INTERIOR corner (the type's real usable
  // area, NOT the raw box edge — a battered/inset shaft like the haunted tower's flared plinth
  // sits one cell in, so box+1 is solid wall and a ladder placed there is BURIED, the "escada
  // dentro da parede" defect). Backed by a solid spine so it attaches through every level (the
  // spine coincides with the rear wall when the interior reaches the basement footprint). Rungs
  // run the deepest floor → the ground slab; a step-off + 2-block headroom at the ground AND at
  // every intermediate level, so each level is reachable. Clamped into the vault footprint so a
  // smaller/offset basement never lands the column in a vault wall. The descent is emitted by
  // the caller AFTER the type's foundation slab so its shaft carve through the floor survives.
  const descent: AuthoringOp[] = [];
  const lx = Math.min(Math.max(interior.x0, foot.x0 + 1), foot.x1 - 1);
  const lz = Math.min(Math.max(interior.z1, foot.z0 + 1), foot.z1 - 1);
  const ladder = palette.get('ladder', { facing: 'north' }); // back against the +z spine
  const spine = palette.get('foundation');
  const air = palette.air();
  for (let y = baseY + 1; y <= groundY; y++) {
    descent.push({ op: 'block', pos: [lx, y, lz + 1], state: spine }); // backing
    descent.push({ op: 'block', pos: [lx, y, lz], state: ladder });
  }
  descent.push({ op: 'block', pos: [lx, groundY + 1, lz], state: air }); // headroom over the top exit
  // Step-off in FRONT of the ladder at every floor's WALK level (slab+1) + head clearance
  // (slab+2), so you can leave the ladder onto the ground floor AND onto every below-grade
  // level. The slab itself (you stand on it) is never carved.
  for (const fy of [...levelFloors, groundY]) {
    descent.push({ op: 'block', pos: [lx, fy + 1, lz - 1], state: air }); // standing cell (on the slab)
    descent.push({ op: 'block', pos: [lx, fy + 2, lz - 1], state: air }); // head clearance
  }
  return { vault, descent };
}

/** Run a module's generic `build()` then its host-specific integration (when `host`
 *  matches one) against pre-built args — the one place module geometry is assembled,
 *  shared by the top-level `composeModule` and the delegate a structure type calls. */
function runModuleGeometry(module: GeometryModule, host: string | undefined, args: BuildArgs): AuthoringOp[] {
  const ops: AuthoringOp[] = [];
  if (module.build) ops.push(...module.build(args)); // generic, any host
  const integration = host ? module.integrations?.[host] : undefined;
  if (integration) ops.push(...integration(args)); // host-specific extras
  return ops;
}

/** Build the `composeModule` delegate injected into a build's args. The delegate resolves
 *  a roof/basement module and runs its geometry with the caller as `host`, so its
 *  host-specific integration is included.
 *
 *  Palette strategy differs by category, by design:
 *  - **roof** + **attic** reuse the caller's `hostPalette` — both are part of the host's
 *    material story (the house's roof should match its trim; the attic floor should match
 *    the house, since it's reached from inside it).
 *  - **basement** + **surroundings** get their OWN palette from the module's `defaults`
 *    (over the decoration) — a cellar is a self-contained stone space and a yard is
 *    landscaping (a lawn stays a lawn), independent of the host's walls.
 *  `rawParams`/`deco`/`intern` let the module resolve its param spec + palette consistently. */
function makeModuleComposer(
  hostPalette: RolePalette,
  seed: number,
  deco: Decoration,
  rawParams: Record<string, unknown>,
  host: string | undefined,
  intern: Intern,
  onInvoke?: (category: 'roof' | 'basement' | 'attic' | 'surroundings', id: string) => void,
): BuildArgs['composeModule'] {
  // A const arrow that references itself, so a delegated module can delegate again.
  const delegate: BuildArgs['composeModule'] = (category, id, from, to, extra = {}) => {
    const module = getGeometryModule(category, id);
    if (!module) throw new Error(`unknown ${category} module "${id}"`);
    onInvoke?.(category, id); // record for the module-respect check (nested calls too)
    const subBox = box(from, to);
    const subParams = resolveParams(module.params ?? {}, { ...rawParams, ...extra });
    applyDecorationDecay(subParams, deco, extra, rawParams);
    // A basement/surroundings module owns its OWN materials (a crypt stays self-contained
    // stone, a yard stays a lawn — independent of the host decoration), so the host's
    // `modBlocks` override must NOT bleed into it; strip it from their palette. A roof/attic
    // reuses the host palette (it's part of the host's exterior story), so it keeps mod blocks.
    const palette = category === 'roof' || category === 'attic'
      ? hostPalette
      : makePalette(module.defaults ?? {}, deco, { ...rawParams, ...extra, modBlocks: undefined }, intern, true);
    // A surroundings module re-derives the house/yard split from the box, so it needs the
    // same per-axis yard scale the host inset with (passed in `extra` by the host).
    const surroundSizing = sanitizeSurroundSizing(extra.surroundSizing ?? rawParams.surroundSizing);
    return runModuleGeometry(module, host, { box: subBox, params: subParams, palette, seed, host, surroundSizing, composeModule: delegate });
  };
  return delegate;
}

/** The MODULE-RESPECT check: after a structure type builds, every module the params
 *  REQUESTED must actually have been delegated to — a silent skip (a too-short attic
 *  guard, a basement that didn't fit, a future type that simply forgot a slot) becomes a
 *  visible compile warning instead of a quietly ignored pick. Checks the categories a
 *  type delegates by contract: a PITCHED roof pick (a flat cap can be a type's own
 *  identity geometry — the modern villa's terraces — so 'flat' isn't gated here; the
 *  shell kit's `roofFormFor` guarantees flat caps), the type's own `attic`/`basement`/
 *  `surroundings` params. The centrally-composed basement path warns separately when it
 *  can't fit. */
function verifyModuleRespect(
  type: { id: string; params: Record<string, unknown> },
  values: ParamValues,
  invoked: ReadonlySet<string>,
  warn?: (message: string) => void,
): void {
  const wanted: ['roof' | 'basement' | 'attic' | 'surroundings', string][] = [];
  if (values.roof === 'gable' || values.roof === 'hip') wanted.push(['roof', values.roof]);
  if ('attic' in type.params && typeof values.attic === 'string' && values.attic !== 'none') wanted.push(['attic', values.attic]);
  if ('basement' in type.params && typeof values.basement === 'string' && values.basement !== 'none') wanted.push(['basement', values.basement]);
  if ('surroundings' in type.params && typeof values.surroundings === 'string' && values.surroundings !== 'none') {
    wanted.push(['surroundings', values.surroundings]);
  }
  for (const [category, id] of wanted) {
    if (![...invoked].some((k) => k.startsWith(`${category}:`))) {
      warn?.(
        `The selected ${category} ("${id}") was NOT built: the "${type.id}" structure laid no ${category} ` +
          `module for this box/params (usually the box is too tight for it). The pick was silently ignored — ` +
          `raise the build box or change the selection.`,
      );
    }
  }
}

/**
 * Expand a `template` op into ordinary ops — the cross of a structure TYPE and a
 * DECORATION resolved against a role palette.
 *
 * @param name - The structure-type id (e.g. 'classic').
 * @param from - One corner of the build box [x, y, z].
 * @param to - The opposite corner of the build box [x, y, z].
 * @param params - The op's loose params: a `decoration`/`theme` key, role-name block
 *   overrides, a `seed`, and the type's own shape/behaviour knobs.
 * @param intern - The compiler's get-or-create palette intern, so the composed build
 *   interns into the same palette.
 * @param warn - Optional sink for non-fatal composition warnings (a skipped basement,
 *   an unknown basement id) — surfaced in the compile report so a silently-dropped
 *   pick is visible to the model/user.
 * @returns The volumetric ops the type's `build()` emits for the box.
 * @throws If `name` is not a known structure type or `params` names an unknown decoration
 *   (so validate/compile surfaces an actionable error to the generator).
 */
export function composeStructure(
  name: string,
  from: Vec3,
  to: Vec3,
  params: Record<string, unknown>,
  intern: Intern,
  warn?: (message: string) => void,
): AuthoringOp[] {
  const type = getStructureType(name);
  if (!type) {
    throw new Error(`unknown structure type "${name}" — available: ${knownStructureNames().join(', ')}`);
  }
  const deco = resolveDecoration(params);

  const b = box(from, to);
  const values = resolveParams(type.params, params);
  applyDecorationDecay(values, deco, params); // "cozy = 0" default; an explicit op param wins
  const seed = seedFor(params, b);
  const palette = makePalette(type.defaults, deco, params, intern);
  // The user's explicit per-floor storey heights (the composer's "Per floor" mode),
  // riding in as a raw array param — threaded into the type's build so the shared
  // storey ladder honours them in every house type.
  const floorHeights = sanitizeFloorHeights(params.floorHeights);
  // The user's per-axis surroundings ring scale (the composer's yard-size control), riding
  // in as a raw param like floorHeights — threaded into the type's build so its house/yard
  // split and yard delegation honour the chosen yard size.
  const surroundSizing = sanitizeSurroundSizing(params.surroundSizing);
  // The user's basement SIZING (the composer's basement panel): per-level depths + an
  // optional enlarged footprint + the house shell size (so the house can be centred when the
  // basement grew the box wider). All ride in as raw params like the heights above.
  const basementHeights = sanitizeBasementHeights(params.basementHeights);
  const basementArea = sanitizeWH(params.basementArea);
  const shellSize = sanitizeWH(params.shellSize);
  // The type owns placement; it DELEGATES roof/basement geometry to those modules via
  // this injected composer (the modules are the single source of that geometry). Every
  // delegation is RECORDED so the module-respect check can verify the requested picks
  // were actually built (see verifyModuleRespect).
  const invoked = new Set<string>();
  const composeModuleDelegate = makeModuleComposer(
    palette, seed, deco, params, name, intern,
    (category, id) => invoked.add(`${category}:${id}`),
  );

  // Below-grade level: ALL structure types compose the selected basement CENTRALLY here —
  // reserve the bottom of the box for the chosen module's vault STACK (one or more levels),
  // raise the type's massing onto the ground above it, then ladder the two together. So
  // every type supports a multi-level, independently-sized basement with no per-type code.
  const basement = selectedBasement(params, warn);
  // Per-level depths: the user's explicit heights, else a single auto-sized level.
  const levelHeights = basementHeights ?? [basementHeight(b.H)];
  const depth = basementDepth(levelHeights);
  if (basement) {
    // The house occupies its shell-sized footprint CENTRED in the (possibly basement-widened)
    // envelope; the type still receives this as its "outer" box and insets the yard itself, so
    // its massing stays the user's W/D even when the basement grew the box.
    const houseEnv = houseEnvelopeBox(b, shellSize, typeof values.surroundings === 'string' ? values.surroundings : undefined, surroundSizing);
    const yard = yardFor(houseEnv, values, surroundSizing);
    const houseB = yard ? insetHouseBox(houseEnv, yard, surroundSizing) : houseEnv;
    // A basement that extends BEYOND the house (under the yard/terrain) reserves its OWN
    // ceiling deck (one extra Y) so re-blocking the vault top never destroys the yard ground
    // fused on top of it. The house footprint for the test is the un-grown shell when known.
    const houseW = shellSize?.w ?? houseB.W;
    const houseD = shellSize?.d ?? houseB.D;
    const ceilingLayer = basementCeilingLayer(basementArea, houseW, houseD);
    const reservedDepth = depth + ceilingLayer;
    if (b.H - reservedDepth >= 6) {
      const groundY = b.y0 + reservedDepth; // the house floor / yard ground (above the vault ceiling)
      const buildBox = box([houseEnv.x0, groundY, houseEnv.z0], [houseEnv.x1, b.y1, houseEnv.z1]);
      // The basement FOOTPRINT: the user's own W×D centred on the HOUSE (so the house always
      // sits over the vault, even when an asymmetric yard ring offsets it), it may extend
      // beyond the house walls — excavated underground; else the house footprint. Under the
      // lawn / beyond the house the below-grade band is the vault itself; the build is meant
      // for in-world placement with terrain_adaptation, which beards the ground in around it.
      const basementB = basementArea
        ? basementBox(b, houseB, basementArea.w, basementArea.d)
        : box([houseB.x0, b.y0, houseB.z0], [houseB.x1, b.y1, houseB.z1]);
      // The vault stack fills the basement footprint below grade; its top ceiling sits at
      // `b.y0 + depth` (= groundY-1 when an extra ceiling layer is reserved). The descent
      // climbs to `groundY` (the house floor) and is laid LAST so its shaft carve survives
      // the type's foundation slab.
      // The type's ground-floor INTERIOR rect (walkable area) so the descent ladder surfaces in
      // the usable room, not inside a thick/inset wall. A type reports its own (the haunted
      // tower's inset shaft); else the generic 1-thick-wall default (box inset by 1). The build
      // box at grade shares the house footprint's X/Z, so houseB is the right reference box.
      const interior = type.interiorRect
        ? type.interiorRect(houseB, values, floorHeights, surroundSizing)
        : { x0: houseB.x0 + 1, z0: houseB.z0 + 1, x1: houseB.x1 - 1, z1: houseB.z1 - 1 };
      const { vault, descent } = composeBasementStack(composeModuleDelegate, basement, basementB, b.y0, levelHeights, groundY, interior, palette);
      const ops: AuthoringOp[] = [
        ...vault,
        // The type builds its full massing onto the ground slab at `groundY` (its new floor).
        ...type.build({ box: buildBox, params: values, palette, seed, floorHeights, surroundSizing, composeModule: composeModuleDelegate }),
        ...descent,
      ];
      verifyModuleRespect(type, values, invoked, warn);
      return ops;
    }
    // The pick can't fit — say so instead of silently building without it (the user
    // chose a crypt and got none, with nothing explaining why).
    warn?.(
      `Skipped the selected "${basement}" basement: the ${b.H}-block-tall build box is too short to `
      + `bury a ${reservedDepth}-block vault and keep livable storeys above it (needs a height of at least ${reservedDepth + 6}). `
      + `Raise the build box or drop the basement.`,
    );
  }

  const ops = type.build({ box: b, params: values, palette, seed, floorHeights, surroundSizing, composeModule: composeModuleDelegate });
  verifyModuleRespect(type, values, invoked, warn);
  return ops;
}

/** Coerce a loose `{ w, d }` (or `[w, d]`) raw param into a sane footprint, or undefined —
 *  the basement-area / house-shell sizing rides in as a `template` op param like the
 *  heights above. */
function sanitizeWH(v: unknown): { w: number; d: number } | undefined {
  const pair = Array.isArray(v) ? { w: v[0], d: v[1] } : (v as { w?: unknown; d?: unknown } | null);
  const w = Number(pair?.w);
  const d = Number(pair?.d);
  if (!Number.isFinite(w) || !Number.isFinite(d) || w < 1 || d < 1) return undefined;
  return { w: Math.trunc(w), d: Math.trunc(d) };
}

/**
 * Run a roof/basement MODULE's own geometry through the same palette/param machinery a
 * structure type uses — the execution path for a module's `build()` logic. A module can
 * carry GENERIC geometry (`build()`, any host) PLUS HOST-SPECIFIC extras
 * (`integrations[host]`, layered on top only for that structure).
 *
 * @param category - Which module registry to look `id` up in ('roof' or 'basement').
 * @param id - The module id (e.g. 'gable', 'cellar').
 * @param from - One corner of the box the module builds into [x, y, z].
 * @param to - The opposite corner of that box [x, y, z].
 * @param params - Loose params: a `decoration`/`theme` key, role overrides, `seed`, and
 *   the module's own knobs.
 * @param intern - The compiler's get-or-create palette intern.
 * @param host - The structure-type id the module is applied to (enables its
 *   `integrations[host]` extras); omit for a context-free render.
 * @returns The module's ordinary ops (generic `build()` then any host integration);
 *   empty if the module has no geometry yet.
 * @throws If the module id or the selected decoration is unknown.
 */
export function composeModule(
  category: 'roof' | 'basement',
  id: string,
  from: Vec3,
  to: Vec3,
  params: Record<string, unknown>,
  intern: Intern,
  host?: string,
): AuthoringOp[] {
  const module = getGeometryModule(category, id);
  if (!module) {
    throw new Error(`unknown ${category} module "${id}"`);
  }
  if (!module.build && !(host && module.integrations?.[host])) return [];

  const deco = resolveDecoration(params);
  const b = box(from, to);
  const values = resolveParams(module.params ?? {}, params);
  applyDecorationDecay(values, deco, params);
  const seed = seedFor(params, b);
  // A basement keeps its own stone kit over the decoration (see makePalette); a roof uses
  // the decoration as normal (it's part of the host's exterior material story).
  const palette = makePalette(module.defaults ?? {}, deco, params, intern, category === 'basement');
  const args: BuildArgs = {
    box: b, params: values, palette, seed, host,
    composeModule: makeModuleComposer(palette, seed, deco, params, host, intern),
  };
  return runModuleGeometry(module, host, args);
}

/**
 * Compose a roof/basement module for the gallery PREVIEW: render the module's own
 * geometry in context. A roof gets a low host shell (floor + walls) so the pitch reads;
 * a basement is shown as its own room. Uses the default decoration.
 *
 * @param category - Which module to preview ('roof' or 'basement').
 * @param id - The module id.
 * @param from - One corner of the preview box [x, y, z].
 * @param to - The opposite corner of the preview box [x, y, z].
 * @param intern - The compiler's get-or-create palette intern (the caller compiles the result).
 * @returns The ops for the previewed module (plus a host shell for a roof).
 */
export function composeModulePreview(
  category: 'roof' | 'basement',
  id: string,
  from: Vec3,
  to: Vec3,
  intern: Intern,
): AuthoringOp[] {
  const params = { decoration: DEFAULT_DECORATION };
  const b = box(from, to);
  if (category === 'basement') return composeModule('basement', id, from, to, params, intern);

  // Roof: a low wall box for it to sit on, then the roof over the remaining height.
  const deco = resolveDecoration(params);
  const palette = makePalette(getGeometryModule('roof', id)?.defaults ?? {}, deco, params, intern);
  const wallTop = b.y0 + Math.max(2, Math.floor(b.H * 0.45));
  return [
    { op: 'fill', from: [b.x0, b.y0, b.z0], to: [b.x1, b.y0, b.z1], state: palette.get('floor') },
    { op: 'walls', from: [b.x0, b.y0, b.z0], to: [b.x1, wallTop, b.z1], state: palette.get('wall') },
    ...composeModule('roof', id, [b.x0, wallTop + 1, b.z0], [b.x1, b.y1, b.z1], params, intern),
  ];
}
