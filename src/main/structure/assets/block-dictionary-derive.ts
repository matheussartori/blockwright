// The PURE derivation behind the mod-block dictionary: humanizing/role-guessing a block
// id, parsing blockstate properties, and formatting the model-facing "Mod blocks" guide.
// Kept free of fs/electron (block-dictionary.ts owns the IO) so it's unit-testable.
import type { ModBlockScope } from '@/shared/types';

/** Cap the blocks injected into the system prompt so a huge mod can't blow the per-turn
 *  token budget. Annotated blocks sort first, so the cap drops the least-curated ones. */
export const MAX_INJECTED = 200;

/** Humanize a block id into a readable title ("ashen_brick" → "Ashen Brick"). Shown as the
 *  description placeholder — never injected (it tells the model nothing the id doesn't). */
export function humanize(block: string): string {
  return block.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

// Heuristic role guess from the id suffix/keywords — a STARTING point shown as the role
// placeholder (first match wins; ordered most-specific first).
const ROLE_HINTS: [RegExp, string][] = [
  [/_stairs$/, 'roof'],
  [/_slab$/, 'trim'],
  [/(_glass_pane|_pane)$/, 'window'],
  [/_glass$/, 'glass'],
  [/_door$/, 'door'],
  [/_fence$/, 'fence'],
  [/(lantern|_lamp|torch|candle|glowstone|sea_light|shroomlight)/, 'light'],
  [/(leaves|sapling|_flower|fern|vine|moss|blossom|petal)/, 'plant'],
  [/(_planks|_log|_wood|_stem)$/, 'wall'],
  [/(brick|cobble|_tile|concrete|terracotta|deepslate|_stone|sandstone|marble|granite)/, 'wall'],
  [/(grass_block|_dirt|_path)/, 'ground'],
];

/** A heuristic semantic role for a block id, or null when nothing matches. */
export function guessRole(block: string): string | null {
  // A connecting-WALL block (`*_wall`) is a thin decorative POST, not a full cube — exclude it
  // from the material rules below so its `brick`/`cobble`/`stone` substring can't claim the
  // solid `wall` role (which is placed as a `walls` op → see-through exteriors). No role fits a
  // wall post, so it gets none (the user can annotate one). This guard is now LOAD-BEARING:
  // `guessRole` feeds the shell's role→block overrides, not just the catalog's suggestion.
  if (/_wall$/.test(block)) return null;
  for (const [re, role] of ROLE_HINTS) if (re.test(block)) return role;
  return null;
}

/** A parsed blockstate JSON (only the bits we read). */
export interface BlockstateJson {
  variants?: Record<string, unknown>;
  multipart?: { when?: Record<string, unknown> }[];
}

/** Extract a block's property name → possible values from its blockstate JSON: variant
 *  keys like "facing=north,half=top" and multipart `when` clauses (incl. `OR` lists and
 *  `a|b` value alternates). So the guide can tell the model which props to set. */
export function propsFromState(state: BlockstateJson | null): Record<string, string[]> {
  if (!state) return {};
  const acc: Record<string, Set<string>> = {};
  const add = (k: string, v: string) => (acc[k] ??= new Set()).add(v);
  const fromKey = (key: string): void => {
    if (!key) return;
    for (const pair of key.split(',')) {
      const eq = pair.indexOf('=');
      if (eq > 0) add(pair.slice(0, eq).trim(), pair.slice(eq + 1).trim());
    }
  };
  if (state.variants) for (const key of Object.keys(state.variants)) fromKey(key);
  if (state.multipart) {
    for (const part of state.multipart) {
      const when = part.when;
      if (!when) continue;
      const orList = (when as { OR?: unknown }).OR;
      const clauses = Array.isArray(orList) ? (orList as Record<string, unknown>[]) : [when];
      for (const clause of clauses) {
        for (const [k, v] of Object.entries(clause)) {
          if (k === 'OR' || k === 'AND') continue;
          for (const val of String(v).split('|')) add(k, val.trim());
        }
      }
    }
  }
  const out: Record<string, string[]> = {};
  for (const [k, set] of Object.entries(acc)) out[k] = [...set];
  return out;
}

/** One block as the formatter sees it (already filtered to non-ignored). */
export interface GuideEntry {
  id: string;
  role?: string;
  description?: string;
  props: Record<string, string[]>;
}

/** A mod block as a candidate for a semantic role: its id, the user-ANNOTATED role (if
 *  any), and the heuristic role GUESS from its id. Feeds {@link buildRolePalette}. */
export interface RoleCandidate {
  id: string;
  /** The user's explicit role annotation (authoritative). */
  role?: string;
  /** The heuristic role guessed from the id (a weaker, fallback signal). */
  guessed?: string;
}

/**
 * Build the role→mod-block override map that makes a build come out IN the mod's blocks:
 * for each semantic role, the mod block to use as that role's material. A user-ANNOTATED
 * role always wins; under `prefer` the heuristic guess then fills roles the user didn't
 * annotate. Sparse by design — a role no mod block covers (e.g. `window`/`glass` a mod
 * lacks) is omitted, so the build falls back to the vanilla decoration there.
 *
 * @param candidates - The non-ignored mod blocks, each with its annotated/guessed role.
 *   Pass them in a STABLE order (sorted by id) so the pick is deterministic.
 * @param annotatedOnly - true for `mix` scope (only user-annotated roles ride into the
 *   shell); false for `prefer` (heuristic guesses fill the rest too).
 * @returns role name → mod block id (the first candidate wins per role).
 */
export function buildRolePalette(candidates: RoleCandidate[], annotatedOnly = false): Record<string, string> {
  const out: Record<string, string> = {};
  // Annotated roles first — the user's curation is authoritative.
  for (const c of candidates) if (c.role && !(c.role in out)) out[c.role] = c.id;
  // Heuristic fill (prefer scope) — never overrides an annotated pick.
  if (!annotatedOnly) for (const c of candidates) if (c.guessed && !(c.guessed in out)) out[c.guessed] = c.id;
  return out;
}

/** The system-prompt "Mod blocks" section for a namespace: the non-ignored blocks (props +
 *  any authored role/description), steered by the scope. Returns '' when the scope is off or
 *  nothing is usable, so a vanilla run pays nothing. Annotated blocks sort first and the set
 *  is capped at {@link MAX_INJECTED}. Pure — the caller supplies the live entries. */
export function formatModBlockSection(
  namespace: string,
  scope: ModBlockScope,
  entries: GuideEntry[],
  rolePalette: Record<string, string> = {},
  seeded = false,
): string {
  if (scope === 'off' || !entries.length) return '';
  const annotated = (e: GuideEntry) => (e.description || e.role ? 1 : 0);
  const sorted = [...entries].sort((a, b) => annotated(b) - annotated(a) || a.id.localeCompare(b.id));
  const shown = sorted.slice(0, MAX_INJECTED);

  const lines = shown.map((e) => {
    const role = e.role ? ` (role: ${e.role})` : '';
    const desc = e.description ? ` — ${e.description}` : '';
    const propKeys = Object.keys(e.props);
    const props = propKeys.length
      ? ` [props: ${propKeys.map((k) => `${k}=${e.props[k].join('|')}`).join('; ')}]`
      : '';
    return `- \`${e.id}\`${role}${desc}${props}`;
  });

  // The recommended role→block PALETTE: the concrete material to use for each part — the single
  // biggest lever for the model actually using mod blocks (a flat id list it ignores). Only for
  // `prefer` (the imperative "use these as the default for everything" contradicts the `mix`
  // steer). The "ALREADY built" clause is gated on a shell actually having been SEEDED this run
  // (not on scope) — it's a lie on a free-form / edit build, where no shell was compiled.
  const roleKeys = scope === 'prefer' ? Object.keys(rolePalette).sort() : [];
  const palette = roleKeys.length
    ? `\n\nPRIMARY PALETTE — use these as the default material for each part` +
      `${seeded ? ' (the starting shell is ALREADY built in them)' : ''}:\n` +
      roleKeys.map((r) => `- ${r}: \`${rolePalette[r]}\``).join('\n') +
      `\nKeep using this palette for new geometry (interior, furniture, detailing) so the whole ` +
      `build reads in the mod's materials; only drop to a vanilla block for a part the palette ` +
      `above doesn't cover (e.g. windows/glass the mod lacks).`
    : '';

  const steer =
    scope === 'prefer'
      ? `PREFER these mod blocks over vanilla equivalents for this build's main materials ` +
        `(walls, floors, roof, trim) wherever one fits the look — they are the whole point of this mod.`
      : `These mod blocks are available ALONGSIDE vanilla. Use them where they fit the build's ` +
        `theme; fall back to vanilla for anything they don't cover.`;
  const truncated = sorted.length > shown.length ? `\n\n(+${sorted.length - shown.length} more not shown.)` : '';

  return (
    `\n\n# Mod blocks — namespace \`${namespace}\`\n\n` +
    `${steer}${palette}\n\n` +
    `RULES: for the \`${namespace}\` namespace use ONLY ids from this list (others don't exist and ` +
    `will be rejected); set each block's blockstate properties from its listed \`props\` (e.g. \`facing\`, ` +
    `\`axis\`, \`half\`) exactly as you would the vanilla equivalent; a block with a role behaves like that ` +
    `role's vanilla block. Vanilla \`minecraft:\` blocks remain fully available.\n\n` +
    `${lines.join('\n')}${truncated}`
  );
}
