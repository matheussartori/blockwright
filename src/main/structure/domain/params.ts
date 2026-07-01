// Single-declaration parameter specs for structure types. A type declares each of
// its SHAPE/BEHAVIOUR params once (kind + default + range); `resolveParams` coerces
// the loose `template` op params to typed values against that spec. Block-id params
// are NOT declared here — any op param whose key is a Role (see roles.ts) is treated
// as a per-role block override and resolved by the palette instead.
import type { ModuleCategory, ModuleParam } from './modules';

/** One parameter's shape, default, and bounds. `label` (+ enum `labels`) are
 *  optional UI metadata so the composer can render a control generically. `module`
 *  marks a param that is now SURFACED as a separate module-category select in the UI
 *  (e.g. the house's `roof`/`basement`): it stays in the spec so `build()` keeps
 *  resolving it, but `paramFields` omits it from the structure's Details controls so
 *  it isn't shown twice. */
export type ParamDef =
  | { kind: 'int'; default: number; min: number; max: number; label?: string; module?: ModuleCategory }
  | { kind: 'unit'; default: number; label?: string; module?: ModuleCategory } // a 0..1 fraction (e.g. decay)
  | { kind: 'enum'; default: string; values: readonly string[]; labels?: Record<string, string>; label?: string; module?: ModuleCategory };

/** A type's full parameter spec, keyed by param name. */
export type ParamSpec = Record<string, ParamDef>;

/** A param value after coercion: a clamped number (int/unit) or a valid enum string. */
export type ParamValues = Record<string, number | string>;

function asInt(v: unknown, def: number, min: number, max: number): number {
  const n = typeof v === 'number' ? Math.trunc(v) : def;
  return Math.max(min, Math.min(max, Number.isFinite(n) ? n : def));
}

function asUnit(v: unknown, def: number): number {
  const n = typeof v === 'number' ? v : def;
  return Math.max(0, Math.min(1, Number.isFinite(n) ? n : def));
}

/** Coerce the raw `template` op params to typed values per `spec`, applying each
 *  param's default + bounds. Params not in the spec (the theme id, role overrides)
 *  are ignored here and handled elsewhere. */
export function resolveParams(spec: ParamSpec, raw: Record<string, unknown>): ParamValues {
  const out: ParamValues = {};
  for (const [key, def] of Object.entries(spec)) {
    const v = raw[key];
    if (def.kind === 'int') out[key] = asInt(v, def.default, def.min, def.max);
    else if (def.kind === 'unit') out[key] = asUnit(v, def.default);
    else out[key] = typeof v === 'string' && def.values.includes(v) ? v : def.default;
  }
  return out;
}

/** Coerce a loose `{ w, d }` (or `[w, d]`) raw param into a sane footprint, or undefined —
 *  generic W×D coercion for the sizing params that ride in as raw `template` op params
 *  (the basement area, the house shell size). */
export function sanitizeWH(v: unknown): { w: number; d: number } | undefined {
  const pair = Array.isArray(v) ? { w: v[0], d: v[1] } : (v as { w?: unknown; d?: unknown } | null);
  const w = Number(pair?.w);
  const d = Number(pair?.d);
  if (!Number.isFinite(w) || !Number.isFinite(d) || w < 1 || d < 1) return undefined;
  return { w: Math.trunc(w), d: Math.trunc(d) };
}

/** Project a param spec into renderer-facing fields for the composer's Details —
 *  one control per param. `unit` params (e.g. decay) are omitted (they belong to the
 *  decoration, not the structural picker), as are `module`-marked params (surfaced as
 *  their own module-category select, e.g. roof/basement). */
export function paramFields(spec: ParamSpec): ModuleParam[] {
  const out: ModuleParam[] = [];
  for (const [name, def] of Object.entries(spec)) {
    if (def.module) continue; // surfaced as a separate module-category select (e.g. roof/basement)
    if (def.kind === 'int') {
      out.push({ name, kind: 'int', label: def.label ?? name, default: def.default, min: def.min, max: def.max });
    } else if (def.kind === 'enum') {
      out.push({
        name,
        kind: 'enum',
        label: def.label ?? name,
        default: def.default,
        options: def.values.map((value) => ({ value, label: def.labels?.[value] ?? value })),
      });
    }
  }
  return out;
}
