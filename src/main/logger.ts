// Captures the main process's console output so the in-app Console dock can show
// the same logs the dev terminal does — crucial for packaged builds where there
// is no terminal. We patch the console methods once (still calling through to the
// originals so the terminal/devtools keep working), keep a bounded ring buffer of
// recent lines (flushed to the renderer on mount via IPC_CHANNELS.logBacklog), and
// tail each new line live over IPC_EVENTS.logEntry.
import util from 'node:util';
import { IPC_EVENTS } from '@/shared/ipc';
import type { LogEntry, LogLevel, LogTag } from '@/shared/types';
import { getMainWindow } from './window';

/** How many lines to retain for the backlog the renderer fetches on mount. */
const MAX_BUFFER = 1000;

const buffer: LogEntry[] = [];
/** Guards against a forward call re-entering the patched console (infinite loop). */
let forwarding = false;
let installed = false;

/** The console methods we mirror, mapped to their LogEntry level. */
const METHODS: Record<string, LogLevel> = {
  log: 'log',
  info: 'info',
  warn: 'warn',
  error: 'error',
  debug: 'debug',
};

/** The pre-patch console methods, kept so `logTagged` can echo to the terminal
 *  WITHOUT re-entering the patch (which would record an untagged duplicate). */
const originals: Partial<Record<LogLevel, (...args: unknown[]) => void>> = {};

function record(level: LogLevel, args: unknown[], tag?: LogTag): void {
  const entry: LogEntry = {
    ts: Date.now(),
    level,
    source: 'main',
    // util.format mirrors how console itself stringifies its args (%s/%o, objects…).
    text: util.format(...args),
    ...(tag ? { tag } : {}),
  };
  buffer.push(entry);
  if (buffer.length > MAX_BUFFER) buffer.shift();

  // Tail to the renderer if it's up. Wrapped so a failure here never throws out of
  // a console call, and flagged so the send path can't recurse into the patch.
  if (forwarding) return;
  forwarding = true;
  try {
    const win = getMainWindow();
    if (win && !win.isDestroyed()) win.webContents.send(IPC_EVENTS.logEntry, entry);
  } catch {
    /* window gone / not ready — the line still lives in the backlog buffer */
  } finally {
    forwarding = false;
  }
}

/** Patch the main-process console once so every line is mirrored into the buffer
 *  and tailed to the renderer. Idempotent. Call as early as possible in startup. */
export function installMainLogger(): void {
  if (installed) return;
  installed = true;
  const c = console as unknown as Record<string, (...args: unknown[]) => void>;
  for (const [method, level] of Object.entries(METHODS)) {
    const original = c[method].bind(console);
    originals[level] = original;
    c[method] = (...args: unknown[]) => {
      original(...args);
      record(level, args);
    };
  }
}

/** Emit a single tagged log line: echoed to the terminal AND recorded/forwarded
 *  with a `tag` so the Console dock colour-codes it (AI step vs code fix-up). Use
 *  this instead of `console.log` for the AI-generation play-by-play. */
export function logTagged(tag: LogTag, text: string, level: LogLevel = 'info'): void {
  (originals[level] ?? console[level === 'log' ? 'log' : level].bind(console))(`[${tag}] ${text}`);
  record(level, [text], tag);
}

/** The buffered backlog (oldest first) for the renderer's initial Console fill. */
export function getLogBacklog(): LogEntry[] {
  return buffer.slice();
}
