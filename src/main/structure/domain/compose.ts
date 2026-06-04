// The cross: turn a `template` op (a structure-type name + a box + loose params) into
// ordinary volumetric ops by resolving a TYPE and a THEME and letting the type build
// its massing against a theme-backed role palette. This replaces the old per-template
// `expandTemplate`; the op stays `template` in the authoring schema.
//
// Resolution order for a role's block: per-op override (a param keyed by the role
// name) > theme.blocks[role] > type.defaults[role] > BASE_BLOCKS[role]. The theme
// also supplies decay weathering and (via the default theme) the decay level.
import type { AuthoringOp } from '../authoring/types';
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
import { DEFAULT_THEME, getTheme, themeIds, type DecorationTheme } from './themes';

type Vec3 = [number, number, number];

/** Get-or-create a palette index for a block name (+ optional blockstate props) —
 *  supplied by the compiler so a composed build interns into the same palette. */
export type Intern = (name: string, props?: Record<string, string>) => number;

/** A composable name resolves to a structure type and (optionally) a default theme. */
interface Resolved { typeId: string; theme?: string }

/** Back-compat aliases for the old preset names: each maps to a type + the theme
 *  whose look it used to bake in. New code should use the bare type id + a `theme`
 *  param instead. */
const ALIASES: Record<string, Resolved> = {
  abandoned_house: { typeId: 'house', theme: 'abandoned' },
  large_basement: { typeId: 'basement', theme: 'abandoned' },
};

function resolveName(name: string): Resolved | null {
  if (name in ALIASES) return ALIASES[name];
  if (isStructureType(name)) return { typeId: name };
  return null;
}

/** Is `name` a buildable structure type (registered id or back-compat alias)? */
export function isKnownStructure(name: string): boolean {
  return resolveName(name) !== null;
}

/** Every name a `template` op may use (type ids + aliases), for validation messages. */
export function knownStructureNames(): string[] {
  return [...structureTypeIds(), ...Object.keys(ALIASES)];
}

/** The block ids supplied as per-role overrides in a `template` op's params (keys
 *  that name a Role). These are the only block names a template contributes that the
 *  generator must validate against the content pack — theme/type kits are curated. */
export function composeBlockNames(params: Record<string, unknown>): string[] {
  const out: string[] = [];
  for (const [k, v] of Object.entries(params ?? {})) {
    if (isRole(k) && typeof v === 'string' && v.includes(':')) out.push(v);
  }
  return out;
}

/** Build the role→palette-index resolver for a (type, theme, overrides) triple. */
function makePalette(
  type: StructureType,
  theme: DecorationTheme,
  raw: Record<string, unknown>,
  intern: Intern,
): RolePalette {
  const idOf = (role: Role): string => {
    const override = raw[role];
    if (typeof override === 'string' && override.includes(':')) return override;
    return theme.blocks[role] ?? type.defaults[role] ?? BASE_BLOCKS[role];
  };
  const weather = theme.weather ?? ((b: string) => b);
  return {
    idOf,
    get: (role, props) => intern(idOf(role), props),
    weather: (role, props) => intern(weather(idOf(role)), props),
    air: () => intern('minecraft:air'),
  };
}

/** Expand a `template` op into ordinary ops. Throws on an unknown type or theme so
 *  validate/compile surfaces an actionable error to the generator. */
export function composeStructure(
  name: string,
  from: Vec3,
  to: Vec3,
  params: Record<string, unknown>,
  intern: Intern,
): AuthoringOp[] {
  const resolved = resolveName(name);
  if (!resolved) {
    throw new Error(`unknown structure type "${name}" — available: ${knownStructureNames().join(', ')}`);
  }
  const type = getStructureType(resolved.typeId)!;
  const themeId = (typeof params.theme === 'string' && params.theme) || resolved.theme || DEFAULT_THEME;
  const theme = getTheme(themeId);
  if (!theme) {
    throw new Error(`unknown theme "${themeId}" — available: ${themeIds().join(', ')}`);
  }

  const b = box(from, to);
  const values = resolveParams(type.params, params);
  // The theme can lower the decay default (e.g. "plain" = 0); an explicit op param wins.
  if (theme.decay !== undefined && params.decay === undefined && 'decay' in values) {
    values.decay = theme.decay;
  }
  const seed =
    typeof params.seed === 'number' && Number.isFinite(params.seed)
      ? Math.trunc(params.seed)
      : seed3(b.x0, b.y0, b.z0);

  return type.build({ box: b, params: values, palette: makePalette(type, theme, params, intern), seed });
}
