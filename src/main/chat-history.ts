// Persistent per-NBT AI chat history, stored as JSON in the app's userData dir.
// Each record is keyed by the document's identity: its file path for a saved
// `.nbt`, or its AI session id for an Untitled (generate-only) build. Reopening
// a file restores its conversation, and the stored SDK session id + version let
// the next prompt resume the same Claude conversation (see generate.ts
// primeSession). Mirrors recents.ts (in-memory cache + best-effort write).
import { app } from 'electron';
import fs from 'node:fs';
import path from 'node:path';
import type { ChatRecord } from '@/shared/types';

/** Cap the number of stored conversations so the file can't grow unbounded;
 *  oldest-by-updatedAt are evicted first. */
const MAX_ENTRIES = 100;

type Store = Record<string, ChatRecord>;
let cache: Store | null = null;

function storeFile(): string {
  return path.join(app.getPath('userData'), 'chat-history.json');
}

function read(): Store {
  if (cache) return cache;
  try {
    const data = JSON.parse(fs.readFileSync(storeFile(), 'utf8'));
    cache = data && typeof data === 'object' ? (data as Store) : {};
  } catch {
    cache = {};
  }
  return cache;
}

function persist(store: Store): void {
  cache = store;
  try {
    fs.writeFileSync(storeFile(), JSON.stringify(store, null, 2));
  } catch {
    // Best-effort: a failed write just means history won't survive a restart.
  }
}

export function getChat(key: string): ChatRecord | null {
  return read()[key] ?? null;
}

export function saveChat(key: string, record: ChatRecord): void {
  const store = { ...read(), [key]: { ...record, updatedAt: Date.now() } };
  const keys = Object.keys(store);
  if (keys.length > MAX_ENTRIES) {
    // Drop the oldest entries beyond the cap.
    const sorted = keys.sort((a, b) => (store[a].updatedAt ?? 0) - (store[b].updatedAt ?? 0));
    for (const stale of sorted.slice(0, keys.length - MAX_ENTRIES)) delete store[stale];
  }
  persist(store);
}
