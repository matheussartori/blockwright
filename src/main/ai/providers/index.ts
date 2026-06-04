// Maps a provider id to its driver, loaded lazily so a provider's SDK is only
// imported when actually used (and the heavy ones stay out of the cold path).
import type { AiProviderId } from '@/shared/ai';
import type { Critic, Driver } from './types';

/** Providers that keep a resumable server-side/CLI conversation, so a follow-up
 *  turn continues it via a stored session id. The rest are stateless per call:
 *  the orchestrator re-seeds them with the latest build so edits stay coherent. */
export const RESUMABLE_PROVIDERS = new Set<AiProviderId>(['claude-subscription', 'codex']);

export async function getDriver(id: AiProviderId): Promise<Driver> {
  switch (id) {
    case 'claude-subscription':
      return (await import('./claude-sdk')).claudeSdkDriver;
    case 'claude-api':
      return (await import('./anthropic')).anthropicDriver;
    case 'openai':
      return (await import('./openai')).openaiDriver;
    case 'gemini':
      return (await import('./gemini')).geminiDriver;
    case 'codex':
      return (await import('./codex')).codexDriver;
    default:
      throw new Error(`Unknown AI provider: ${id}`);
  }
}

/** The independent critic for a provider, or null when it has none (→ the
 *  orchestrator falls back to the model's self-reported audit). Only the Claude
 *  paths implement a fresh-context critic call. */
export async function getCritic(id: AiProviderId): Promise<Critic | null> {
  switch (id) {
    case 'claude-subscription':
      return (await import('./claude-sdk')).claudeSdkCritique;
    case 'claude-api':
      return (await import('./anthropic')).anthropicCritique;
    default:
      return null;
  }
}
