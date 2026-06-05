// Provider registry + config contracts for AI structure generation, shared by
// both Vite bundles. This file is PURE DATA + types (no Node/electron imports)
// so the renderer can render the AI settings UI — provider labels, model lists —
// without an extra round-trip, while the main process resolves credentials and
// drives the actual model.
//
// Blockwright supports several AI backends. Two authenticate via a *subscription*
// (an existing CLI login — no API credits): the Claude Agent SDK (Claude Code /
// Pro·Max) and Codex (ChatGPT Plus·Pro). The rest authenticate with a paid
// *API key*: the Anthropic, OpenAI, and Google Gemini APIs. The user can
// configure more than one and pick which is active.

/** Stable identifier for each backend. */
export type AiProviderId =
  | 'claude-subscription'
  | 'claude-api'
  | 'openai'
  | 'gemini'
  | 'codex';

/** How a provider authenticates: a CLI/subscription login, or a pasted API key. */
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
    id: 'claude-api',
    label: 'Claude API',
    authKind: 'api-key',
    stability: 'beta',
    blurb: 'Anthropic API key (pay-as-you-go credits). Same models, billed per token.',
    envVars: ['ANTHROPIC_API_KEY'],
    keyPlaceholder: 'sk-ant-api…',
    models: [
      { id: 'claude-opus-4-8', label: 'Opus 4.8' },
      { id: 'claude-sonnet-4-6', label: 'Sonnet 4.6' },
      { id: 'claude-haiku-4-5', label: 'Haiku 4.5' },
    ],
    defaultModel: 'claude-sonnet-4-6',
  },
  {
    id: 'openai',
    label: 'OpenAI (ChatGPT)',
    authKind: 'api-key',
    stability: 'beta',
    blurb: 'OpenAI API key (pay-as-you-go). GPT models with vision for the self-review loop.',
    envVars: ['OPENAI_API_KEY'],
    keyPlaceholder: 'sk-…',
    models: [
      { id: 'gpt-5', label: 'GPT-5' },
      { id: 'gpt-5-mini', label: 'GPT-5 mini' },
      { id: 'gpt-4.1', label: 'GPT-4.1' },
      { id: 'gpt-4o', label: 'GPT-4o' },
    ],
    defaultModel: 'gpt-4.1',
  },
  {
    id: 'gemini',
    label: 'Google Gemini',
    authKind: 'api-key',
    stability: 'beta',
    blurb: 'Google AI API key (generous free tier). Strong vision; great value.',
    envVars: ['GEMINI_API_KEY', 'GOOGLE_API_KEY'],
    keyPlaceholder: 'AIza…',
    models: [
      { id: 'gemini-2.5-pro', label: 'Gemini 2.5 Pro' },
      { id: 'gemini-2.5-flash', label: 'Gemini 2.5 Flash' },
      { id: 'gemini-2.0-flash', label: 'Gemini 2.0 Flash' },
    ],
    defaultModel: 'gemini-2.5-flash',
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

/** The whole AI configuration the Settings panel renders + edits. */
export interface AiConfig {
  providers: AiProviderState[];
  /** The provider used for generation. */
  activeProvider: AiProviderId;
}
