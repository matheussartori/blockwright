// The AI-generation play-by-play, surfaced in the in-app Console dock (and the dev
// terminal). Two colour-coded voices so it's clear who did what at each step:
//   aiLog  — the MODEL's own steps: planning, emitting geometry, rendering for
//            review, the critic's verdict. Tagged 'ai' (accent/blue in the dock).
//   fixLog — the CODE's fine-tuning: the post-processing passes that repair the
//            model's build (stairwells, connections, chimney…). Tagged 'fix'
//            (green in the dock), so corrections read distinctly from the AI's work.
//
// A RunLog tees the SAME two voices into a `generation.log` file inside the build's
// library folder, so each saved build keeps a readable record of how it was made
// (the folder is reserved on the first emit, so earlier lines are buffered and
// flushed when it's attached). The bare aiLog/fixLog stay console-only for callers
// outside a run.
import fs from 'node:fs';
import path from 'node:path';
import { logTagged } from '../logger';

/** Log a step taken by the AI model itself. */
export function aiLog(message: string): void {
  logTagged('ai', message);
}

/** Log a code-side fine-tuning step (a post-processing pass repairing the build). */
export function fixLog(message: string): void {
  logTagged('fix', message);
}

/** Per-run logger: mirrors every line to the Console dock (via aiLog/fixLog) AND,
 *  once {@link attach}ed to the build's library folder, to its `generation.log`. */
export class RunLog {
  private buffer: string[] = [];
  private file: string | null = null;

  /** A model step: to the Console dock + the run's log file. */
  ai = (message: string): void => {
    aiLog(message);
    this.record('ai', message);
  };

  /** A code fine-tuning step: to the Console dock + the run's log file. */
  fix = (message: string): void => {
    fixLog(message);
    this.record('fix', message);
  };

  /** Point the log at a folder's `generation.log`, flushing everything buffered so
   *  far. No-op if already attached (the folder is reserved once per session). */
  attach(dir: string): void {
    if (this.file) return;
    this.file = path.join(dir, 'generation.log');
    try {
      fs.writeFileSync(this.file, this.buffer.join('\n') + (this.buffer.length ? '\n' : ''));
    } catch {
      this.file = null; // couldn't write — keep console-only
    }
  }

  private record(tag: 'ai' | 'fix', message: string): void {
    const line = `[${new Date().toISOString()}] [${tag}] ${message}`;
    this.buffer.push(line);
    if (this.file) {
      try {
        fs.appendFileSync(this.file, line + '\n');
      } catch {
        /* best-effort — the Console dock still has it */
      }
    }
  }
}
