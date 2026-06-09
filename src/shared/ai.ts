// Provider registry + config contracts for AI structure generation, shared by
// both Vite bundles. This file is PURE DATA + types (no Node/electron imports)
// so the renderer can render the AI settings UI — provider labels, model lists —
// without an extra round-trip, while the main process resolves credentials and
// drives the actual model.
//
// Blockwright drives generation through one of two *subscription* backends (an
// existing CLI login — no API credits): the Claude Agent SDK (Claude Code /
// Pro·Max), the supported default, and Codex (ChatGPT Plus·Pro), a best-effort
// beta. The user configures both and picks which is active.

/** Stable identifier for each backend. */
export type AiProviderId =
  | 'claude-subscription'
  | 'codex';

/** How a provider authenticates. Both backends use a CLI/subscription login; the
 *  `api-key` kind is kept on the contract because a subscription provider can also
 *  accept a pasted token (e.g. Claude via `claude setup-token`). */
export type AiAuthKind = 'subscription' | 'api-key';

/** One selectable model for a provider. */
export interface AiModelOption {
  id: string;
  label: string;
}

/** Maturity of a backend in Blockwright: `stable` is the supported path we test and
 *  tune the self-review/critic loop against; `beta` works but is less exercised.
 *  Drives the Stable/Beta badge + grouping in Settings ▸ AI. */
export type AiStability = 'stable' | 'beta';

/** Static, non-secret description of a provider (safe to read in the renderer). */
export interface AiProviderMeta {
  id: AiProviderId;
  label: string;
  authKind: AiAuthKind;
  /** Maturity tier — `stable` (Claude subscription) vs `beta` (everything else). */
  stability: AiStability;
  /** One-line description for the settings UI. */
  blurb: string;
  /** Env var(s) that pin this provider's credential (and lock it in-app). */
  envVars: string[];
  /** Placeholder for the credential input (api-key providers only). */
  keyPlaceholder?: string;
  /** Curated model choices; the user may also override via BW_AI_MODEL. */
  models: AiModelOption[];
  /** Default model id when the user hasn't chosen one. */
  defaultModel: string;
}

/** The provider registry. Order here is the order shown in Settings. */
export const AI_PROVIDERS: AiProviderMeta[] = [
  {
    id: 'claude-subscription',
    label: 'Claude (subscription)',
    authKind: 'subscription',
    stability: 'stable',
    blurb:
      'Runs on your Claude Pro/Max plan via Claude Code — no API credits. Uses your existing Claude Code login, or a token from `claude setup-token`.',
    envVars: ['CLAUDE_CODE_OAUTH_TOKEN'],
    keyPlaceholder: 'sk-ant-oat… (optional)',
    models: [
      { id: 'claude-opus-4-8', label: 'Opus 4.8' },
      { id: 'claude-sonnet-4-6', label: 'Sonnet 4.6' },
      { id: 'claude-haiku-4-5', label: 'Haiku 4.5' },
    ],
    defaultModel: 'claude-opus-4-8',
  },
  {
    id: 'codex',
    label: 'Codex (ChatGPT)',
    authKind: 'subscription',
    stability: 'beta',
    blurb:
      'Runs on your ChatGPT Plus/Pro plan via the Codex CLI — no API credits. Sign in first with `codex login`. Vision review is best-effort.',
    envVars: ['CODEX_API_KEY'],
    keyPlaceholder: 'sk-… (optional API key)',
    models: [
      { id: 'gpt-5.5', label: 'GPT-5.5' },
      { id: 'gpt-5.4', label: 'GPT-5.4' },
      { id: 'gpt-5.4-mini', label: 'GPT-5.4 mini' },
    ],
    defaultModel: 'gpt-5.5',
  },
];

/** Look up a provider's static metadata (undefined for an unknown id). */
export function providerMeta(id: AiProviderId): AiProviderMeta | undefined {
  return AI_PROVIDERS.find((p) => p.id === id);
}

/** The default active provider when nothing is configured. */
export const DEFAULT_PROVIDER: AiProviderId = 'claude-subscription';

/** Per-provider runtime status surfaced to the renderer (no secrets cross the
 *  bridge). */
export interface AiProviderState {
  id: AiProviderId;
  /** A usable credential is configured (env or stored). Note a subscription
   *  provider can still work via an existing CLI login while this is false. */
  configured: boolean;
  /** Pinned by an env var, so it can't be edited in-app. */
  fromEnv: boolean;
  /** Masked credential tail like `…1a2b`, or null when none is stored. */
  hint: string | null;
  /** The model id selected for this provider (defaults to its defaultModel). */
  model: string;
}

// --- generation cost settings ------------------------------------------------
//
// The dominant cost of a build is the emit→render→review LOOP re-sending the big
// knowledge-base system prompt every round (input tokens, cached), plus extended
// thinking (output) and the optional independent critic (an extra model call).
// These three knobs let the user trade quality for cost; the default (Balanced)
// is the original full-quality run, with Saver as the cheap draft fallback.
// Env vars (BW_AI_MAX_ROUNDS / BW_AI_THINKING_BUDGET) still override.

/** The user-tunable cost/quality knobs for generation. */
export interface GenerationSettings {
  /** Max emit→render→review rounds before the loop must stop. Each round
   *  re-renders + re-reviews the build, re-sending the system prompt — so this is
   *  the #1 cost lever. Fewer = cheaper + faster, but less polish. `0` = AUTO: the
   *  cap scales with the build's volume, floored to the full design-pass sequence. */
  maxRounds: number;
  /** Extended-thinking budget in tokens (0 = off). The model plans geometry in
   *  thinking; more = better massing/roofs but more output tokens. */
  thinkingBudget: number;
  /** Run the INDEPENDENT audit critic — a separate fresh-context model call on the
   *  final pass that judges the build. Catches more, but costs an extra call.
   *  Claude only (Codex has no critic; the flag is ignored there). */
  critic: boolean;
}

/** Bounds the UI + main clamp `maxRounds`/`thinkingBudget` to. */
export const GENERATION_LIMITS = {
  minRounds: 1,
  maxRounds: 10,
  minThinking: 0,
  maxThinking: 8000,
} as const;

/** A named cost preset (the simple one-click control) + its underlying settings. */
export interface GenerationPreset {
  id: 'saver' | 'balanced' | 'thorough';
  label: string;
  /** One-line description of the cost/quality tradeoff. */
  blurb: string;
  settings: GenerationSettings;
}

/** The presets. "Balanced" is the default — it restores the original always-on
 *  full design-pass + thinking + critic run (the quality baseline before the cost
 *  knobs were added). "Saver" is the cheap draft fallback, listed last. */
export const GENERATION_PRESETS: GenerationPreset[] = [
  {
    id: 'balanced',
    label: 'Balanced',
    blurb: 'The full design-pass sequence (rounds auto-scaled to build size), extended thinking, and the independent critic. The quality baseline for real builds.',
    settings: { maxRounds: 0, thinkingBudget: 5000, critic: true },
  },
  {
    id: 'thorough',
    label: 'Thorough',
    blurb: 'Most expensive — a high fixed round cap and the deepest thinking on top of the critic.',
    settings: { maxRounds: 10, thinkingBudget: 8000, critic: true },
  },
  {
    id: 'saver',
    label: 'Saver',
    blurb: 'Cheapest — a few quick passes, no extended thinking, no critic. Best for quick drafts.',
    settings: { maxRounds: 3, thinkingBudget: 0, critic: false },
  },
];

/** The default generation settings (the "Balanced" preset) — the original quality baseline. */
export const DEFAULT_GENERATION_SETTINGS: GenerationSettings =
  GENERATION_PRESETS.find((p) => p.id === 'balanced')!.settings;

/** The preset id whose settings exactly match `s`, or `'custom'` when none does
 *  (the user hand-tuned a value). Drives the Settings preset highlight. */
export function presetIdFor(s: GenerationSettings): GenerationPreset['id'] | 'custom' {
  const hit = GENERATION_PRESETS.find(
    (p) =>
      p.settings.maxRounds === s.maxRounds &&
      p.settings.thinkingBudget === s.thinkingBudget &&
      p.settings.critic === s.critic,
  );
  return hit?.id ?? 'custom';
}

/** The whole AI configuration the Settings panel renders + edits. */
export interface AiConfig {
  providers: AiProviderState[];
  /** The provider used for generation. */
  activeProvider: AiProviderId;
  /** The generation cost/quality settings (see {@link GenerationSettings}). */
  generation: GenerationSettings;
}
