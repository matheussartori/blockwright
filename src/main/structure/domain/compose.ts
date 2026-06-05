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
import { box } from './structure-types/types';

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

/** Build the role→palette-index resolver for a (defaults-kit, decoration, overrides)
 *  triple. `defaults` is the module's own block kit (a structure type's, or a roof/
 *  basement module's), consulted after the decoration and before BASE_BLOCKS. */
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

/** Expand a `template` op into ordinary ops. Throws on an unknown type or decoration
 *  so validate/compile surfaces an actionable error to the generator. */
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

  return type.build({ box: b, params: values, palette: makePalette(type.defaults, deco, params, intern), seed });
}

/** Run a roof/basement MODULE's own geometry through the same palette/param machinery a
 *  structure type uses — the execution path for a module's `build()` logic. A module can
 *  carry GENERIC geometry (`build()`, any host) PLUS HOST-SPECIFIC extras
 *  (`integrations[host]`, layered on top only for that structure). `host` is the
 *  structure-type id the module is applied to (omit for a context-free render). Returns
 *  ordinary ops interned via `intern`; empty if the module has no geometry yet. Throws on
 *  an unknown module/decoration. */
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
  const args = { box: b, params: values, palette, seed, host };

  const ops: AuthoringOp[] = [];
  if (module.build) ops.push(...module.build(args)); // generic, any host
  const integration = host ? module.integrations?.[host] : undefined;
  if (integration) ops.push(...integration(args)); // host-specific extras
  return ops;
}

/** Compose a roof/basement module for the gallery PREVIEW: render the module's own
 *  geometry in context. A roof gets a low host shell (floor + walls) so the pitch reads;
 *  a basement is shown as its own room. Uses the default decoration. Pure — the caller
 *  supplies `intern` and compiles the result. */
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
