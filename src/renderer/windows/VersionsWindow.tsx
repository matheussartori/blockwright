// The Versions panel: lists every compiled build (`vN.nbt`) the AI generator has
// emitted for the active tab's session, newest first, and lets the user click one
// to view it in the viewer. This is VISUALIZATION ONLY — previewing an earlier
// version doesn't change what the next edit builds on (that always continues from
// the latest). Rendered as a tab in the docked sidebar, or inside a FloatingWindow
// when torn off — the chrome lives in InspectorDock / FloatingPanels.
import { useActiveDoc } from '../hooks/useStores';
import { viewVersion } from '../state/generation';

export function VersionsContent() {
  const doc = useActiveDoc();
  if (!doc) return null;

  // "v0" (if present) is the untouched original of an edited file, not a build —
  // the panel only matters once there's at least one generated version.
  const generated = doc.versions.filter((v) => v.version >= 1);
  if (generated.length === 0) return null;

  const latest = generated[generated.length - 1].version;
  // The version currently in the viewer: an explicit preview, else the latest.
  const shown = doc.viewingVersion ?? latest;
  // Newest first — the most recent build is what you usually want; the original
  // baseline (v0) sorts to the bottom.
  const ordered = [...doc.versions].sort((a, b) => b.version - a.version);
  const label = (v: number) => (v === 0 ? 'Original' : `v${v}`);

  return (
    <>
      <div className="versions-head">
        <p className="versions-note">
          Preview an earlier build. Edits always continue from the latest version.
        </p>
      </div>
      <ul className="versions-list">
        {ordered.map((v) => {
          const isShown = v.version === shown;
          const isLatest = v.version === latest;
          const isOriginal = v.version === 0;
          return (
            <li key={v.version}>
              <button
                type="button"
                className={`version-row${isShown ? ' active' : ''}`}
                aria-current={isShown}
                title={
                  isShown
                    ? 'Showing in the viewer'
                    : isOriginal
                      ? 'View the original file (before any edits)'
                      : `View ${label(v.version)}`
                }
                onClick={() => void viewVersion(doc.id, v.version)}
              >
                <span className="version-label">{label(v.version)}</span>
                {isLatest && <span className="chip">latest</span>}
                {isOriginal && <span className="chip">source</span>}
                {isShown && <span className="version-shown">● viewing</span>}
              </button>
            </li>
          );
        })}
      </ul>
    </>
  );
}
