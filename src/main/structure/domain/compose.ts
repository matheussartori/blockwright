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
import { resolveParams } from './params';
import { BASE_BLOCKS, isRole, type Role } from './roles';
import { seed3 } from './rng';
import {
  getStructureType,
  isStructureType,
  structureTypeIds,
  type RolePalette,
  type StructureType,
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

/** Build the role→palette-index resolver for a (type, decoration, overrides) triple. */
function makePalette(
  type: StructureType,
  deco: Decoration,
  raw: Record<string, unknown>,
  intern: Intern,
): RolePalette {
  const idOf = (role: Role): string => {
    const override = raw[role];
    if (typeof override === 'string' && override.includes(':')) return override;
    return deco.blocks[role] ?? type.defaults[role] ?? BASE_BLOCKS[role];
  };
  const weather = deco.weather ?? ((b: string) => b);
  return {
    idOf,
    get: (role, props) => intern(idOf(role), props),
    weather: (role, props) => intern(weather(idOf(role)), props),
    air: () => intern('minecraft:air'),
  };
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
  const decoId = decorationId(params);
  const deco = getDecoration(decoId);
  if (!deco) {
    throw new Error(`unknown decoration "${decoId}" — available: ${decorationIds().join(', ')}`);
  }

  const b = box(from, to);
  const values = resolveParams(type.params, params);
  // The decoration can lower the decay default (e.g. "cozy" = 0); an explicit op param wins.
  if (deco.decay !== undefined && params.decay === undefined && 'decay' in values) {
    values.decay = deco.decay;
  }
  const seed =
    typeof params.seed === 'number' && Number.isFinite(params.seed)
      ? Math.trunc(params.seed)
      : seed3(b.x0, b.y0, b.z0);

  return type.build({ box: b, params: values, palette: makePalette(type, deco, params, intern), seed });
}
