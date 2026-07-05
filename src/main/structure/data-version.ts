// Resolve the DataVersion the CURRENT context targets: the active mod workspace's
// detected/chosen Minecraft version, else the content pack's, else the default.
// Split from mc-data-version.ts so that module stays pure (no workspace state) —
// export/convert paths call this; the AI pipeline stays on DEFAULT_DATA_VERSION
// by design (its knowledge base targets 1.21.1 and newer games upgrade on load).
import { contentPackVersion, getActiveWorkspace } from './assets/content-pack';
import { dataVersionFor } from './mc-data-version';

/** The target Minecraft version string of the active context (workspace first,
 *  content pack second), or null when neither declares one. */
export function activeTargetVersion(): string | null {
  return getActiveWorkspace()?.minecraftVersion ?? contentPackVersion();
}

/** The DataVersion to stamp on files written for the active context. */
export function activeDataVersion(): number {
  return dataVersionFor(activeTargetVersion());
}
