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
  if (!doc || doc.versions.length === 0) return null;

  const latest = doc.version || Math.max(...doc.versions.map((v) => v.version));
  // The version currently in the viewer: an explicit preview, else the latest.
  const shown = doc.viewingVersion ?? latest;
  // Newest first — the most recent build is what you usually want.
  const ordered = [...doc.versions].sort((a, b) => b.version - a.version);

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
          return (
            <li key={v.version}>
              <button
                type="button"
                className={`version-row${isShown ? ' active' : ''}`}
                aria-current={isShown}
                title={isShown ? 'Showing in the viewer' : `View v${v.version}`}
                onClick={() => void viewVersion(doc.id, v.version)}
              >
                <span className="version-label">v{v.version}</span>
                {isLatest && <span className="chip">latest</span>}
                {isShown && <span className="version-shown">● viewing</span>}
              </button>
            </li>
          );
        })}
      </ul>
    </>
  );
}
