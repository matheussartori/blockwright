// Asks which Minecraft version a workspace targets, shown only when
// auto-detection failed. Picking one persists it (jigsaw previews then resolve);
// dismissing leaves jigsaw features off until a version is known. Built on the
// shared Modal so it matches Settings / the Block Catalog.
import { SELECTABLE_VERSIONS } from '@/shared/mc-version';
import { api } from '../api';
import { store } from '../state/store';
import { useApp, useT } from '../hooks/useStores';
import { Modal } from './ui/Modal';

export function VersionSelectModal() {
  const t = useT();
  const name = useApp((s) => s.versionPromptName);
  const close = () => store.getState().setVersionPromptName(null);
  const pick = (version: string) => {
    void api.setWorkspaceVersion(version);
    close();
  };

  return (
    <Modal open={!!name} onClose={close} title={t('version.title')} className="version-modal" bodyClassName="version-body">
      <p className="version-hint">
        {t('version.hintPre')}<strong>{name}</strong>{t('version.hintPost')}
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
