// Generation session lifecycle: the per-chat conversation state (provider session
// id + version counter + scratch dir), where generated files live on disk, and the
// AbortControllers that let the renderer cancel an in-flight run. Kept apart from the
// orchestration so generate.ts stays focused on a single run.
import { app } from 'electron';
import fs from 'node:fs';
import path from 'node:path';
import type { VersionInfo } from '@/shared/types';
import type { LibraryMirror } from './output-dir';

export interface Session {
  /** The provider conversation id to resume (Claude SDK / Codex thread); null until
   *  the first turn establishes it, or always null for stateless providers. */
  sdkSessionId: string | null;
  /** Highest compiled version written so far (`vN.nbt`). */
  version: number;
  /** Solid-block count of the last ACCEPTED version — the baseline for the emit
   *  COLLAPSE GATE (a non-patch emit that loses most of the build is rejected back
   *  to the model instead of becoming a gutted version). Unset until the first emit. */
  lastSolids?: number;
  /** Per-session scratch dir under the generated root. */
  dir: string;
  /** Library FOLDER this session mirrors its build into (`<slug>/` under the user's
   *  output dir — see output-dir.ts): the latest clean `<slug>.nbt` plus every kept
   *  `versions/vN.nbt`. Reserved once on the first emit. `undefined` until then; a
   *  `dir:null` mirror means the folder couldn't be created (don't retry). */
  library?: LibraryMirror;
}

const sessions = new Map<string, Session>();

// AbortControllers for in-flight runs, keyed by session id, so a run can be cancelled
// and a new run supersedes the previous one.
const activeRuns = new Map<string, AbortController>();

/** Hidden scratch root for the iteration churn (`<sessionId>/vN.nbt`) — lives in
 *  userData in dev and packaged alike (the user-facing copies go to the browsable
 *  library, see output-dir.ts). Override with `BW_GENERATED`. */
function generatedRoot(): string {
  if (process.env.BW_GENERATED) return process.env.BW_GENERATED;
  return path.join(app.getPath('userData'), 'generated');
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

/** Re-point a LIVE session's library mirror after the user renamed the project, so
 *  any further version this session mirrors lands in the renamed folder instead of
 *  reserving a fresh one. No-op if the session isn't in memory (a reopened project
 *  with no in-flight generation needs no relink — its files are already moved). */
export function relinkSessionLibrary(sessionId: string, mirror: LibraryMirror): void {
  const session = sessions.get(sessionId);
  if (session) session.library = mirror;
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
    if (!match) continue;
    const full = path.join(sessionDir(sessionId), name);
    // Stat for the created/modified dates shown in the Versions panel (best-effort:
    // a stat failure just omits them — birthtime is unreliable on some filesystems,
    // so fall back to mtime when it reads 0).
    let createdAt: number | undefined;
    let modifiedAt: number | undefined;
    try {
      const st = fs.statSync(full);
      modifiedAt = st.mtimeMs;
      createdAt = st.birthtimeMs || st.mtimeMs;
    } catch {
      /* keep the entry without dates */
    }
    out.push({ version: Number(match[1]), path: full, createdAt, modifiedAt });
  }
  return out.sort((a, b) => a.version - b.version);
}

/** Delete a compiled version's files: the scratch `vN.nbt` + `vN.json`, plus the
 *  library mirror copy when the session is live (best-effort). The renderer guards
 *  against deleting the Current version, so this never removes the live edit base.
 *  Returns true if any scratch file was removed. */
export function deleteVersion(sessionId: string, version: number): boolean {
  // Defensive (the delete IPC is a public surface): never remove the live HEAD version — it
  // backs the next run's seed + patch base (`buildSeed` reads `v{session.version}.json`). The
  // renderer also hides delete on the latest + Current, but don't rely on it here.
  const session = sessions.get(sessionId);
  if (session && version >= session.version) return false;
  const dir = sessionDir(sessionId);
  let removed = false;
  for (const ext of ['nbt', 'json']) {
    try {
      fs.unlinkSync(path.join(dir, `v${version}.${ext}`));
      removed = true;
    } catch {
      /* not present — nothing to remove */
    }
  }
  const libDir = sessions.get(sessionId)?.library?.dir;
  if (libDir) {
    try {
      fs.unlinkSync(path.join(libDir, 'versions', `v${version}.nbt`));
    } catch {
      /* library copy already gone */
    }
  }
  return removed;
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
