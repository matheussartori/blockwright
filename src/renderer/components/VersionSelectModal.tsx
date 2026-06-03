// Asks which Minecraft version a workspace targets, shown only when
// auto-detection failed. Picking one persists it (jigsaw previews then resolve);
// dismissing leaves jigsaw features off until a version is known. Built on the
// shared Modal so it matches Settings / the Block Catalog.
import { SELECTABLE_VERSIONS } from '@/shared/mc-version';
import { api } from '../api';
import { store } from '../state/store';
import { useApp } from '../hooks/useStores';
import { Modal } from './ui/Modal';

export function VersionSelectModal() {
  const name = useApp((s) => s.versionPromptName);
  const close = () => store.getState().setVersionPromptName(null);
  const pick = (version: string) => {
    void api.setWorkspaceVersion(version);
    close();
  };

  return (
    <Modal open={!!name} onClose={close} title="Minecraft version" className="version-modal" bodyClassName="version-body">
      <p className="version-hint">
        Couldn&apos;t detect the Minecraft version for <strong>{name}</strong>. Pick it so jigsaw previews
        resolve correctly.
      </p>
      <div className="version-grid">
        {SELECTABLE_VERSIONS.map((v) => (
          <button key={v} className="btn version-option" onClick={() => pick(v)}>
            {v}
          </button>
        ))}
      </div>
    </Modal>
  );
}
