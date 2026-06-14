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
  [/_wall$/, 'wall'],
  [/(lantern|_lamp|torch|candle|glowstone|sea_light|shroomlight)/, 'light'],
  [/(leaves|sapling|_flower|fern|vine|moss|blossom|petal)/, 'plant'],
  [/(_planks|_log|_wood|_stem)$/, 'wall'],
  [/(brick|cobble|_tile|concrete|terracotta|deepslate|_stone|sandstone|marble|granite)/, 'wall'],
  [/(grass_block|_dirt|_path)/, 'ground'],
];

/** A heuristic semantic role for a block id, or null when nothing matches. */
export function guessRole(block: string): string | null {
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

/** The system-prompt "Mod blocks" section for a namespace: the non-ignored blocks (props +
 *  any authored role/description), steered by the scope. Returns '' when the scope is off or
 *  nothing is usable, so a vanilla run pays nothing. Annotated blocks sort first and the set
 *  is capped at {@link MAX_INJECTED}. Pure — the caller supplies the live entries. */
export function formatModBlockSection(namespace: string, scope: ModBlockScope, entries: GuideEntry[]): string {
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

  const steer =
    scope === 'prefer'
      ? `PREFER these mod blocks over vanilla equivalents for this build's main materials ` +
        `(walls, floors, roof, trim) wherever one fits the look — they are the whole point of this mod.`
      : `These mod blocks are available ALONGSIDE vanilla. Use them where they fit the build's ` +
        `theme; fall back to vanilla for anything they don't cover.`;
  const truncated = sorted.length > shown.length ? `\n\n(+${sorted.length - shown.length} more not shown.)` : '';

  return (
    `\n\n# Mod blocks — namespace \`${namespace}\`\n\n` +
    `${steer}\n\n` +
    `RULES: for the \`${namespace}\` namespace use ONLY ids from this list (others don't exist and ` +
    `will be rejected); set each block's blockstate properties from its listed \`props\` (e.g. \`facing\`, ` +
    `\`axis\`, \`half\`) exactly as you would the vanilla equivalent; a block with a role behaves like that ` +
    `role's vanilla block. Vanilla \`minecraft:\` blocks remain fully available.\n\n` +
    `${lines.join('\n')}${truncated}`
  );
}
