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
import { resolveParams } from './params';
import { getRoof } from './roofs';
import { BASE_BLOCKS, isRole, type Role } from './roles';
import { seed3 } from './rng';
import {
  getStructureType,
  isStructureType,
  structureTypeIds,
  type RolePalette,
} from './structure-types';
import { box, type BuildArgs } from './structure-types/types';

/** The geometry-bearing shape shared by roof + basement modules (a structural subset of
 *  RoofModule/BasementModule), so the run helper doesn't care which registry it came from. */
type GeometryModule = {
  build?: (args: BuildArgs) => AuthoringOp[];
  integrations?: Partial<Record<string, (args: BuildArgs) => AuthoringOp[]>>;
};

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
 * @returns A {@link RolePalette} that interns a role's resolved (or weathered) block.
 */
function makePalette(
  defaults: Partial<Record<Role, string>>,
  deco: Decoration,
  raw: Record<string, unknown>,
  intern: Intern,
): RolePalette {
  const idOf = (role: Role): string => {
    const override = raw[role];
    if (typeof override === 'string' && override.includes(':')) return override;
    return deco.blocks[role] ?? defaults[role] ?? BASE_BLOCKS[role];
  };
  const weather = deco.weather ?? ((b: string) => b);
  return {
    idOf,
    get: (role, props) => intern(idOf(role), props),
    weather: (role, props) => intern(weather(idOf(role)), props),
    air: () => intern('minecraft:air'),
  };
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
 *  - **roof** reuses the caller's `hostPalette` — a roof is part of the host's exterior
 *    material story (the house's roof should match its own trim, not the module's kit).
 *  - **basement** gets its OWN palette from the module's `defaults` (over the decoration) —
 *    a cellar is a self-contained stone space, independent of the host's (e.g. timber) walls.
 *  `rawParams`/`deco`/`intern` let the module resolve its param spec + palette consistently. */
function makeModuleComposer(
  hostPalette: RolePalette,
  seed: number,
  deco: Decoration,
  rawParams: Record<string, unknown>,
  host: string | undefined,
  intern: Intern,
): BuildArgs['composeModule'] {
  // A const arrow that references itself, so a delegated module can delegate again.
  const delegate: BuildArgs['composeModule'] = (category, id, from, to, extra = {}) => {
    const module = category === 'roof' ? getRoof(id) : getBasement(id);
    if (!module) throw new Error(`unknown ${category} module "${id}"`);
    const subBox = box(from, to);
    const subParams = resolveParams(module.params ?? {}, { ...rawParams, ...extra });
    if (deco.decay !== undefined && extra.decay === undefined && rawParams.decay === undefined && 'decay' in subParams) {
      subParams.decay = deco.decay;
    }
    const palette = category === 'roof'
      ? hostPalette
      : makePalette(module.defaults ?? {}, deco, { ...rawParams, ...extra }, intern);
    return runModuleGeometry(module, host, { box: subBox, params: subParams, palette, seed, host, composeModule: delegate });
  };
  return delegate;
}

/**
 * Expand a `template` op into ordinary ops — the cross of a structure TYPE and a
 * DECORATION resolved against a role palette.
 *
 * @param name - The structure-type id (e.g. 'house').
 * @param from - One corner of the build box [x, y, z].
 * @param to - The opposite corner of the build box [x, y, z].
 * @param params - The op's loose params: a `decoration`/`theme` key, role-name block
 *   overrides, a `seed`, and the type's own shape/behaviour knobs.
 * @param intern - The compiler's get-or-create palette intern, so the composed build
 *   interns into the same palette.
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
): AuthoringOp[] {
  const type = getStructureType(name);
  if (!type) {
    throw new Error(`unknown structure type "${name}" — available: ${knownStructureNames().join(', ')}`);
  }
  const deco = resolveDecoration(params);

  const b = box(from, to);
  const values = resolveParams(type.params, params);
  // The decoration can lower the decay default (e.g. "cozy" = 0); an explicit op param wins.
  if (deco.decay !== undefined && params.decay === undefined && 'decay' in values) {
    values.decay = deco.decay;
  }
  const seed = seedFor(params, b);
  const palette = makePalette(type.defaults, deco, params, intern);
  // The type owns placement; it DELEGATES roof/basement geometry to those modules via
  // this injected composer (the modules are the single source of that geometry).
  const composeModuleDelegate = makeModuleComposer(palette, seed, deco, params, name, intern);

  return type.build({ box: b, params: values, palette, seed, composeModule: composeModuleDelegate });
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
  const module = category === 'roof' ? getRoof(id) : getBasement(id);
  if (!module) {
    throw new Error(`unknown ${category} module "${id}"`);
  }
  if (!module.build && !(host && module.integrations?.[host])) return [];

  const deco = resolveDecoration(params);
  const b = box(from, to);
  const values = resolveParams(module.params ?? {}, params);
  if (deco.decay !== undefined && params.decay === undefined && 'decay' in values) {
    values.decay = deco.decay;
  }
  const seed = seedFor(params, b);
  const palette = makePalette(module.defaults ?? {}, deco, params, intern);
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
  const palette = makePalette(getRoof(id)?.defaults ?? {}, deco, params, intern);
  const wallTop = b.y0 + Math.max(2, Math.floor(b.H * 0.45));
  return [
    { op: 'fill', from: [b.x0, b.y0, b.z0], to: [b.x1, b.y0, b.z1], state: palette.get('floor') },
    { op: 'walls', from: [b.x0, b.y0, b.z0], to: [b.x1, wallTop, b.z1], state: palette.get('wall') },
    ...composeModule('roof', id, [b.x0, wallTop + 1, b.z0], [b.x1, b.y1, b.z1], params, intern),
  ];
}
