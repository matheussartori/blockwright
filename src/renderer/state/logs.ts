// The Console dock's data source. It unifies two log streams into one bounded,
// chronological list: the renderer's own `console.*` calls (patched in place,
// still calling through to the real console so devtools keep working) and the
// main-process lines forwarded over IPC. The main backlog buffered before the
// renderer mounted is pulled in once on init; new main lines tail in live.
import { createStore } from 'zustand/vanilla';
import type { LogEntry, LogLevel } from '@/shared/types';
import { api } from '../api';

/** A stored line: a LogEntry plus a stable, monotonic key for React lists. */
export interface LoggedEntry extends LogEntry {
  key: number;
}

/** Cap so a chatty session can't grow the array unbounded (matches main's buffer). */
const MAX_ENTRIES = 1000;

let seq = 0;
function withKey(entry: LogEntry): LoggedEntry {
  return { ...entry, key: seq++ };
}

/** Identity for deduping the backlog against live lines received in the gap
 *  between subscribing and the backlog resolving. */
function signature(e: LogEntry): string {
  return `${e.ts}|${e.source}|${e.text}`;
}

export interface LogsState {
  entries: LoggedEntry[];
  /** Append one line (live tail). */
  add: (entry: LogEntry) => void;
  /** Merge a batch (the main backlog), skipping any already present, kept in ts order. */
  merge: (batch: LogEntry[]) => void;
  clear: () => void;
}

function cap(entries: LoggedEntry[]): LoggedEntry[] {
  return entries.length > MAX_ENTRIES ? entries.slice(entries.length - MAX_ENTRIES) : entries;
}

export const logsStore = createStore<LogsState>((set) => ({
  entries: [],
  add: (entry) => set((s) => ({ entries: cap([...s.entries, withKey(entry)]) })),
  merge: (batch) =>
    set((s) => {
      const seen = new Set(s.entries.map(signature));
      const fresh = batch.filter((e) => !seen.has(signature(e))).map(withKey);
      if (fresh.length === 0) return s;
      const next = [...s.entries, ...fresh].sort((a, b) => a.ts - b.ts || a.key - b.key);
      return { entries: cap(next) };
    }),
  clear: () => set({ entries: [] }),
}));

/** Format one console argument into the string the dock shows. */
function formatArg(arg: unknown): string {
  if (typeof arg === 'string') return arg;
  if (arg instanceof Error) return arg.stack ?? `${arg.name}: ${arg.message}`;
  if (arg === undefined) return 'undefined';
  if (arg === null) return 'null';
  if (typeof arg === 'object') {
    try {
      return JSON.stringify(arg);
    } catch {
      return String(arg);
    }
  }
  return String(arg);
}

const METHODS: Record<string, LogLevel> = {
  log: 'log',
  info: 'info',
  warn: 'warn',
  error: 'error',
  debug: 'debug',
};

let recording = false; // guards against the patch re-entering itself
let initialized = false;

/** Patch the renderer console, fetch the main backlog, and start tailing live main
 *  lines into the store. Idempotent; call once before the app mounts. */
export function initLogs(): void {
  if (initialized) return;
  initialized = true;

  const c = console as unknown as Record<string, (...args: unknown[]) => void>;
  for (const [method, level] of Object.entries(METHODS)) {
    const original = c[method].bind(console);
    c[method] = (...args: unknown[]) => {
      original(...args);
      if (recording) return;
      recording = true;
      try {
        logsStore.getState().add({
          ts: Date.now(),
          level,
          source: 'renderer',
          text: args.map(formatArg).join(' '),
        });
      } finally {
        recording = false;
      }
    };
  }

  // Live tail of main-process lines, then merge whatever was buffered pre-mount.
  api.onLogEntry((entry) => logsStore.getState().add(entry));
  void api.getLogBacklog().then((backlog) => logsStore.getState().merge(backlog));
}
