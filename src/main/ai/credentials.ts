// Auth for AI structure generation. Generation runs through the Claude Agent
// SDK (see generate.ts), which authenticates the same way the Claude Code CLI
// does — so on a machine where the user is already logged into Claude Code, it
// uses that login (their Pro/Max subscription) with no extra setup.
//
// For machines without an interactive login, the user can paste a credential in
// Settings: either a long-lived token from `claude setup-token` (subscription)
// or a plain Anthropic API key. It's encrypted at rest via the OS keychain
// (Electron `safeStorage`) and only ever leaves the main process as an env var
// handed to the SDK subprocess. Environment variables, when present, win.
import { app, safeStorage } from 'electron';
import fs from 'node:fs';
import path from 'node:path';
import type { ApiKeyInfo } from '@/shared/types';

// undefined = not loaded from disk yet; null = loaded, nothing stored.
let cache: string | null | undefined;

function storeFile(): string {
  return path.join(app.getPath('userData'), 'claude-credential.bin');
}

/** OAuth tokens from `claude setup-token` start with `sk-ant-oat`; anything else
 *  (e.g. `sk-ant-api…`) is treated as a plain API key. */
function isOAuthToken(secret: string): boolean {
  return secret.startsWith('sk-ant-oat');
}

function readStored(): string | null {
  try {
    const buf = fs.readFileSync(storeFile());
    if (!safeStorage.isEncryptionAvailable()) return null;
    return safeStorage.decryptString(buf).trim() || null;
  } catch {
    return null;
  }
}

/** The credential saved in-app (not counting the environment). */
export function getStoredCredential(): string | null {
  if (cache === undefined) cache = readStored();
  return cache;
}

/** Persist (encrypted) or, given an empty string, clear the credential. */
export function setCredential(secret: string): void {
  const trimmed = secret.trim();
  if (!trimmed) {
    clearCredential();
    return;
  }
  cache = trimmed;
  try {
    if (safeStorage.isEncryptionAvailable()) {
      fs.writeFileSync(storeFile(), safeStorage.encryptString(trimmed));
    }
  } catch {
    // Best-effort: a failed write just means it won't survive a restart.
  }
}

export function clearCredential(): void {
  cache = null;
  try {
    fs.rmSync(storeFile(), { force: true });
  } catch {
    // Best-effort.
  }
}

function envToken(): string | null {
  return process.env.CLAUDE_CODE_OAUTH_TOKEN?.trim() || null;
}
function envApiKey(): string | null {
  return process.env.ANTHROPIC_API_KEY?.trim() || null;
}

/** The environment the Agent SDK subprocess should run with. The SDK *replaces*
 *  the subprocess environment, so we pass the full `process.env` through (for
 *  PATH/HOME) and layer the right credential var on top when one is configured
 *  in-app and the environment doesn't already pin one. */
export function authEnv(): Record<string, string | undefined> {
  const env: Record<string, string | undefined> = { ...process.env };
  env.CLAUDE_AGENT_SDK_CLIENT_APP = 'blockwright';
  if (!envToken() && !envApiKey()) {
    const stored = getStoredCredential();
    if (stored) {
      if (isOAuthToken(stored)) env.CLAUDE_CODE_OAUTH_TOKEN = stored;
      else env.ANTHROPIC_API_KEY = stored;
    }
  }
  return env;
}

/** Path to the SDK's bundled `claude` binary. In dev the SDK resolves it from
 *  node_modules itself; when packaged it's unpacked from the asar (see
 *  forge.config.ts) so the subprocess is spawnable. */
export function claudeExecutablePath(): string | undefined {
  if (process.env.BW_CLAUDE_BIN) return process.env.BW_CLAUDE_BIN;
  if (!app.isPackaged) return undefined;
  const pkg = `@anthropic-ai/claude-agent-sdk-${process.platform}-${process.arch}`;
  const bin = process.platform === 'win32' ? 'claude.exe' : 'claude';
  return path.join(process.resourcesPath, 'app.asar.unpacked', 'node_modules', pkg, bin);
}

/** Whether a credential is explicitly configured (env or in-app). Note this can
 *  be false while generation still works via an existing Claude Code login. */
export function hasConfiguredCredential(): boolean {
  return !!(envToken() || envApiKey() || getStoredCredential());
}

/** Non-secret status for the Settings panel. */
export function credentialInfo(): ApiKeyInfo {
  const active = envToken() || envApiKey() || getStoredCredential() || null;
  return {
    set: !!active,
    hint: active ? `…${active.slice(-4)}` : null,
    fromEnv: !!(envToken() || envApiKey()),
  };
}
