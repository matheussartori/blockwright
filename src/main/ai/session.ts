// Generation session lifecycle: the per-chat conversation state (provider session
// id + version counter + scratch dir), where generated files live on disk, and the
// AbortControllers that let the renderer cancel an in-flight run. Kept apart from the
// orchestration so generate.ts stays focused on a single run.
import { app } from 'electron';
import fs from 'node:fs';
import path from 'node:path';
import type { VersionInfo } from '@/shared/types';

export interface Session {
  /** The provider conversation id to resume (Claude SDK / Codex thread); null until
   *  the first turn establishes it, or always null for stateless providers. */
  sdkSessionId: string | null;
  /** Highest compiled version written so far (`vN.nbt`). */
  version: number;
  /** Per-session scratch dir under the generated root. */
  dir: string;
}

const sessions = new Map<string, Session>();

// AbortControllers for in-flight runs, keyed by session id, so a run can be cancelled
// and a new run supersedes the previous one.
const activeRuns = new Map<string, AbortController>();

/** Temp root for generated structures: repo-local `.generated` in dev (gitignored),
 *  userData when packaged. Override with `BW_GENERATED`. */
function generatedRoot(): string {
  if (process.env.BW_GENERATED) return process.env.BW_GENERATED;
  return app.isPackaged ? path.join(app.getPath('userData'), 'generated') : path.join(app.getAppPath(), '.generated');
}

/** The scratch dir for a session (its id sanitised to a safe folder name). */
export function sessionDir(sessionId: string): string {
  const safe = sessionId.replace(/[^a-zA-Z0-9_-]/g, '');
  return path.join(generatedRoot(), safe || 'session');
}

/** Get (creating + `mkdir`-ing on first use) the live session for `sessionId`. */
export function getSession(sessionId: string): Session {
  const existing = sessions.get(sessionId);
  if (existing) return existing;
  const dir = sessionDir(sessionId);
  fs.mkdirSync(dir, { recursive: true });
  const created: Session = { sdkSessionId: null, version: 0, dir };
  sessions.set(sessionId, created);
  return created;
}

/** Forget a session's conversation + version counter (its files stay on disk). The
 *  next prompt starts a fresh provider session. */
export function resetSession(sessionId: string): void {
  sessions.delete(sessionId);
}

/** List the compiled `vN.nbt` versions on disk for a session, ascending. */
export function listVersions(sessionId: string): VersionInfo[] {
  let names: string[];
  try {
    names = fs.readdirSync(sessionDir(sessionId));
  } catch {
    return []; // no session dir yet
  }
  const out: VersionInfo[] = [];
  for (const name of names) {
    const match = /^v(\d+)\.nbt$/.exec(name);
    if (match) out.push({ version: Number(match[1]), path: path.join(sessionDir(sessionId), name) });
  }
  return out.sort((a, b) => a.version - b.version);
}

/** Restore a session's conversation id + version from persisted chat history so a
 *  follow-up prompt after an app restart resumes the same conversation. No-op once
 *  the session is live in memory (don't clobber a running one). */
export function primeSession(sessionId: string, sdkSessionId: string | null, version: number): void {
  if (sessions.has(sessionId)) return;
  const dir = sessionDir(sessionId);
  fs.mkdirSync(dir, { recursive: true });
  sessions.set(sessionId, { sdkSessionId, version, dir });
}

/** Start a run for `sessionId`: abort any previous run and register the new one's
 *  controller (returned to the caller to thread through the driver). */
export function beginRun(sessionId: string): AbortController {
  activeRuns.get(sessionId)?.abort();
  const ac = new AbortController();
  activeRuns.set(sessionId, ac);
  return ac;
}

/** Finish a run: drop its controller unless a newer run already replaced it. */
export function endRun(sessionId: string, ac: AbortController): void {
  if (activeRuns.get(sessionId) === ac) activeRuns.delete(sessionId);
}

/** Cancel the in-flight run for `sessionId`, if any. */
export function cancelGeneration(sessionId: string): void {
  activeRuns.get(sessionId)?.abort();
}
