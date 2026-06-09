// Auth + per-provider configuration for AI structure generation.
//
// Blockwright can drive several backends (see shared/ai.ts). Each carries its own
// credential: a subscription/CLI login or token (Claude Code, Codex) or a paid
// API key (Anthropic, OpenAI, Gemini). Secrets are stored together in one blob,
// encrypted at rest via the OS keychain (Electron `safeStorage`), and only ever
// leave the main process as the right env var / client option handed to the
// provider. Environment variables, when present, win and lock the field in-app.
//
// Non-secret preferences (the active provider, and the chosen model per provider)
// live in a separate plaintext JSON so they survive even when encryption is
// unavailable.
import { app, safeStorage } from 'electron';
import fs from 'node:fs';
import path from 'node:path';
import {
  AI_PROVIDERS,
  DEFAULT_GENERATION_SETTINGS,
  DEFAULT_PROVIDER,
  GENERATION_LIMITS,
  providerMeta,
  type AiConfig,
  type AiProviderId,
  type AiProviderMeta,
  type AiProviderState,
  type GenerationSettings,
} from '@/shared/ai';

// --- on-disk locations -------------------------------------------------------

function secretsFile(): string {
  return path.join(app.getPath('userData'), 'ai-credentials.bin');
}
function prefsFile(): string {
  return path.join(app.getPath('userData'), 'ai-config.json');
}
/** The pre-multi-provider single-credential file (Claude only). Migrated on first read. */
function legacyFile(): string {
  return path.join(app.getPath('userData'), 'claude-credential.bin');
}

// --- secrets (encrypted map) -------------------------------------------------

// undefined = not loaded from disk yet.
let secretsCache: Partial<Record<AiProviderId, string>> | undefined;

function readSecrets(): Partial<Record<AiProviderId, string>> {
  try {
    const buf = fs.readFileSync(secretsFile());
    if (!safeStorage.isEncryptionAvailable()) return {};
    const json = safeStorage.decryptString(buf);
    const parsed = JSON.parse(json) as Partial<Record<AiProviderId, string>>;
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return migrateLegacy();
  }
}

/** Migrate the old single Claude credential into the new map (best-effort). */
function migrateLegacy(): Partial<Record<AiProviderId, string>> {
  try {
    const buf = fs.readFileSync(legacyFile());
    if (!safeStorage.isEncryptionAvailable()) return {};
    const secret = safeStorage.decryptString(buf).trim();
    if (!secret) return {};
    // Both an `sk-ant-api…` key and an `sk-ant-oat…` token migrate to the Claude
    // subscription provider — `authEnv` applies whichever the secret is.
    const map: Partial<Record<AiProviderId, string>> = { 'claude-subscription': secret };
    writeSecrets(map);
    fs.rmSync(legacyFile(), { force: true });
    return map;
  } catch {
    return {};
  }
}

function writeSecrets(map: Partial<Record<AiProviderId, string>>): void {
  try {
    if (!safeStorage.isEncryptionAvailable()) return;
    fs.writeFileSync(secretsFile(), safeStorage.encryptString(JSON.stringify(map)));
  } catch {
    // Best-effort: a failed write just means it won't survive a restart.
  }
}

function secrets(): Partial<Record<AiProviderId, string>> {
  if (secretsCache === undefined) secretsCache = readSecrets();
  return secretsCache;
}

/** The credential saved in-app for a provider (not counting the environment). */
export function getStoredCredential(id: AiProviderId): string | null {
  return secrets()[id]?.trim() || null;
}

/** Persist (encrypted) or, given an empty string, clear a provider's credential. */
export function setCredential(id: AiProviderId, secret: string): void {
  const map = { ...secrets() };
  const trimmed = secret.trim();
  if (trimmed) map[id] = trimmed;
  else delete map[id];
  secretsCache = map;
  writeSecrets(map);
}

export function clearCredential(id: AiProviderId): void {
  setCredential(id, '');
}

// --- preferences (plaintext) -------------------------------------------------

interface Prefs {
  activeProvider: AiProviderId;
  models: Partial<Record<AiProviderId, string>>;
  /** The generation cost/quality knobs (see shared/ai.ts). Absent = the cheap default. */
  generation: GenerationSettings;
}
let prefsCache: Prefs | undefined;

/** Coerce a stored (possibly partial/garbage) generation blob to valid, clamped
 *  settings — so a hand-edited file or a missing field can't break a run. */
function normalizeGeneration(g: Partial<GenerationSettings> | undefined): GenerationSettings {
  const d = DEFAULT_GENERATION_SETTINGS;
  const clamp = (v: unknown, lo: number, hi: number, def: number): number => {
    const n = typeof v === 'number' && Number.isFinite(v) ? Math.trunc(v) : def;
    return Math.max(lo, Math.min(hi, n));
  };
  return {
    // 0 = AUTO (volume-scaled); otherwise clamp to the explicit min..max round bounds.
    maxRounds: g?.maxRounds === 0 ? 0 : clamp(g?.maxRounds, GENERATION_LIMITS.minRounds, GENERATION_LIMITS.maxRounds, d.maxRounds),
    thinkingBudget: clamp(g?.thinkingBudget, GENERATION_LIMITS.minThinking, GENERATION_LIMITS.maxThinking, d.thinkingBudget),
    critic: typeof g?.critic === 'boolean' ? g.critic : d.critic,
  };
}

function readPrefs(): Prefs {
  try {
    const parsed = JSON.parse(fs.readFileSync(prefsFile(), 'utf8')) as Partial<Prefs>;
    return {
      activeProvider: parsed.activeProvider && providerMeta(parsed.activeProvider)
        ? parsed.activeProvider
        : DEFAULT_PROVIDER,
      models: parsed.models ?? {},
      generation: normalizeGeneration(parsed.generation),
    };
  } catch {
    return { activeProvider: DEFAULT_PROVIDER, models: {}, generation: normalizeGeneration(undefined) };
  }
}

function prefs(): Prefs {
  if (prefsCache === undefined) prefsCache = readPrefs();
  return prefsCache;
}

function writePrefs(next: Prefs): void {
  prefsCache = next;
  try {
    fs.writeFileSync(prefsFile(), JSON.stringify(next, null, 2));
  } catch {
    // Best-effort.
  }
}

export function setActiveProvider(id: AiProviderId): void {
  if (!providerMeta(id)) return;
  writePrefs({ ...prefs(), activeProvider: id });
}

export function setModel(id: AiProviderId, model: string): void {
  const meta = providerMeta(id);
  if (!meta) return;
  writePrefs({ ...prefs(), models: { ...prefs().models, [id]: model.trim() || meta.defaultModel } });
}

/** The persisted generation cost/quality settings (clamped to valid bounds). */
export function getGenerationSettings(): GenerationSettings {
  return prefs().generation;
}

/** Merge a partial generation update over the current settings (clamping), persist
 *  it, and return the resolved settings. */
export function setGenerationSettings(patch: Partial<GenerationSettings>): GenerationSettings {
  const next = normalizeGeneration({ ...prefs().generation, ...patch });
  writePrefs({ ...prefs(), generation: next });
  return next;
}

/** The model chosen for a provider, falling back to its default. */
export function modelFor(id: AiProviderId): string {
  const meta = providerMeta(id);
  const saved = prefs().models[id]?.trim();
  // Ignore a stored model that the provider no longer offers (e.g. a model id
  // that was deprecated upstream), so a stale pref can't keep sending a dead id.
  if (saved && meta?.models.some((m) => m.id === saved)) return saved;
  return meta?.defaultModel || '';
}

// --- environment-pinned credentials ------------------------------------------

/** First non-empty env var among a provider's recognised names, or null. */
function envCredential(meta: AiProviderMeta): string | null {
  for (const name of meta.envVars) {
    const v = process.env[name]?.trim();
    if (v) return v;
  }
  return null;
}

/** The effective credential for a provider: env wins, else the stored secret. */
function effectiveCredential(id: AiProviderId): { value: string | null; fromEnv: boolean } {
  const meta = providerMeta(id);
  if (!meta) return { value: null, fromEnv: false };
  const env = envCredential(meta);
  if (env) return { value: env, fromEnv: true };
  return { value: getStoredCredential(id), fromEnv: false };
}

// --- resolved config for the drivers + UI ------------------------------------

/** A provider's credential resolved for use by its driver. */
export interface ResolvedCredential {
  id: AiProviderId;
  authKind: AiProviderMeta['authKind'];
  /** The secret (token/API key), or null — subscription providers may still work
   *  via an existing CLI login when null. */
  value: string | null;
  fromEnv: boolean;
  model: string;
}

/** Resolve everything a driver needs for the active provider. */
export function activeCredential(): ResolvedCredential {
  const id = prefs().activeProvider;
  const meta = providerMeta(id) ?? AI_PROVIDERS[0];
  const { value, fromEnv } = effectiveCredential(id);
  // BW_AI_MODEL overrides the chosen model for whichever provider is active.
  const model = process.env.BW_AI_MODEL?.trim() || modelFor(id);
  return { id: meta.id, authKind: meta.authKind, value, fromEnv, model };
}

/** Whether the *active* provider is usable right now (drives the panel's hint).
 *  Subscription providers are optimistic (a CLI login may exist); api-key
 *  providers need a key. */
export function aiAvailable(): boolean {
  const id = prefs().activeProvider;
  const meta = providerMeta(id);
  if (!meta) return false;
  if (meta.authKind === 'subscription') return true;
  return !!effectiveCredential(id).value;
}

/** Mask a secret down to a short tail like `…1a2b`. */
function mask(secret: string): string {
  return `…${secret.slice(-4)}`;
}

/** The full, non-secret AI config for the Settings panel. */
export function getConfig(): AiConfig {
  const providers: AiProviderState[] = AI_PROVIDERS.map((meta) => {
    const { value, fromEnv } = effectiveCredential(meta.id);
    return {
      id: meta.id,
      configured: !!value,
      fromEnv,
      hint: value ? mask(value) : null,
      model: modelFor(meta.id),
    };
  });
  return { providers, activeProvider: prefs().activeProvider, generation: prefs().generation };
}

// --- subprocess env for the SDK-based providers ------------------------------

/** The environment the Claude Agent SDK / Codex CLI subprocess should run with.
 *  The SDK replaces the subprocess environment, so we pass the full `process.env`
 *  through (for PATH/HOME) and layer the right credential var on top when one is
 *  configured in-app and the environment doesn't already pin it. `id` selects
 *  which provider's credential to apply. */
export function authEnv(id: AiProviderId): Record<string, string | undefined> {
  const env: Record<string, string | undefined> = { ...process.env };
  env.CLAUDE_AGENT_SDK_CLIENT_APP = 'blockwright';
  const meta = providerMeta(id);
  if (!meta) return env;
  const { value, fromEnv } = effectiveCredential(id);
  if (value && !fromEnv) {
    if (id === 'claude-subscription') {
      if (value.startsWith('sk-ant-api')) env.ANTHROPIC_API_KEY = value;
      else env.CLAUDE_CODE_OAUTH_TOKEN = value;
    } else if (id === 'codex') {
      env.CODEX_API_KEY = value;
      env.OPENAI_API_KEY = value;
    }
  }
  return env;
}

/** Path to the Agent SDK's bundled `claude` native binary, or `undefined` to let the
 *  SDK resolve it itself. In dev the SDK finds it in node_modules; when packaged it's
 *  the platform package unpacked from the asar (see forge.config.ts). Checks the
 *  candidate locations and returns the one that exists, warning (with the paths tried)
 *  if none do — so a packaging regression is diagnosable instead of a cryptic spawn
 *  failure. Override with `BW_CLAUDE_BIN`. */
export function claudeExecutablePath(): string | undefined {
  if (process.env.BW_CLAUDE_BIN) return process.env.BW_CLAUDE_BIN;
  if (!app.isPackaged) return undefined;
  const pkg = `@anthropic-ai/claude-agent-sdk-${process.platform}-${process.arch}`;
  const bin = process.platform === 'win32' ? 'claude.exe' : 'claude';
  const candidates = [
    path.join(process.resourcesPath, 'app.asar.unpacked', 'node_modules', pkg, bin),
    path.join(process.resourcesPath, 'app', 'node_modules', pkg, bin),
  ];
  const found = candidates.find((p) => fs.existsSync(p));
  if (found) return found;
  console.warn(`[ai] Claude Agent SDK binary not found; tried:\n  ${candidates.join('\n  ')}`);
  return undefined;
}
