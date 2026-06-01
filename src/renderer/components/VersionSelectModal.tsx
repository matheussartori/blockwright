// Asks which Minecraft version a workspace targets, shown only when
// auto-detection failed. Picking one persists it (jigsaw previews then resolve);
// dismissing leaves jigsaw features off until a version is known.
import { useEffect } from 'react';
import { SELECTABLE_VERSIONS } from '@/shared/mc-version';
import { api } from '../api';
import { store } from '../state/store';
import { useApp } from '../hooks/useStores';

export function VersionSelectModal() {
  const name = useApp((s) => s.versionPromptName);

  const close = () => store.getState().setVersionPromptName(null);
  const pick = (version: string) => {
    void api.setWorkspaceVersion(version);
    close();
  };

  useEffect(() => {
    if (!name) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        close();
      }
    };
    window.addEventListener('keydown', onKeyDown, true);
    return () => window.removeEventListener('keydown', onKeyDown, true);
  }, [name]);

  if (!name) return null;

  return (
    <div className="settings-overlay" onMouseDown={(e) => e.target === e.currentTarget && close()}>
      <div
        className="settings-modal version-modal"
        role="dialog"
        aria-modal="true"
        aria-label="Select Minecraft version"
      >
        <header className="settings-head">
          <h2>Minecraft version</h2>
          <button className="settings-close" title="Close" aria-label="Close" onClick={close}>
            ✕
          </button>
        </header>
        <div className="settings-body">
          <p className="version-hint">
            Couldn&apos;t detect the Minecraft version for <strong>{name}</strong>. Pick it so
            jigsaw previews resolve correctly.
          </p>
          <div className="version-grid">
            {SELECTABLE_VERSIONS.map((v) => (
              <button key={v} className="btn version-option" onClick={() => pick(v)}>
                {v}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
