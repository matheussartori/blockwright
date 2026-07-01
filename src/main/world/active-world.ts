// The currently-open world, held in main (mirrors `content-pack.ts`'s active-workspace singleton).
// Chunk requests over IPC reference this rather than re-passing + re-opening the world every call.
import { WorldSource } from './world-source';

let active: WorldSource | null = null;

/** Open a world folder and make it active (disposing any previous one). Returns its source. */
export async function openActiveWorld(root: string): Promise<WorldSource> {
  active?.dispose();
  active = await WorldSource.open(root);
  return active;
}

/** The active world source, or null when none is open. */
export function getActiveWorld(): WorldSource | null {
  return active;
}

/** Close + drop the active world. */
export function closeActiveWorld(): void {
  active?.dispose();
  active = null;
}
