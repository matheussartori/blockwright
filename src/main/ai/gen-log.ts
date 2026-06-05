// The AI-generation play-by-play, surfaced in the in-app Console dock (and the dev
// terminal). Two colour-coded voices so it's clear who did what at each step:
//   aiLog  — the MODEL's own steps: planning, emitting geometry, rendering for
//            review, the critic's verdict. Tagged 'ai' (accent/blue in the dock).
//   fixLog — the CODE's fine-tuning: the post-processing passes that repair the
//            model's build (stairwells, connections, chimney…). Tagged 'fix'
//            (green in the dock), so corrections read distinctly from the AI's work.
import { logTagged } from '../logger';

/** Log a step taken by the AI model itself. */
export function aiLog(message: string): void {
  logTagged('ai', message);
}

/** Log a code-side fine-tuning step (a post-processing pass repairing the build). */
export function fixLog(message: string): void {
  logTagged('fix', message);
}
