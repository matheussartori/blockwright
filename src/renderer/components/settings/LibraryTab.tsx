// Settings ▸ Library: where finished structures live on disk. The "Saved structures
// folder" is a file/storage concern (not an AI-provider one), so it lives here on its
// own. Reads/writes the folder through main (it owns the file writes); offers a native
// picker and a "Reveal in Finder/Explorer" shortcut.
import { useEffect, useState } from 'react';
import { api } from '../../api';
import { useT } from '../../hooks/useStores';

export function LibraryTab() {
  const t = useT();
  const [dir, setDir] = useState<string | null>(null);

  useEffect(() => {
    void api.aiGetOutputDir().then(setDir);
  }, []);

  const choose = async () => {
    const picked = await api.aiChooseOutputDir();
    if (picked) setDir(picked);
  };

  return (
    <section className="settings-group">
      <span className="settings-group-name">{t('library.folder')}</span>
      <p className="setting-note">
        {t('library.notePre')}<code>cozy-cottage.nbt</code>{t('library.notePost')}
      </p>
      <div className="setting-key-row">
        <input className="input setting-key-input" readOnly value={dir ?? ''} spellCheck={false} />
        <button className="btn sm no-drag" onClick={() => void choose()}>
          {t('library.change')}
        </button>
        <button className="btn sm no-drag" onClick={() => dir && void api.revealPath(dir)} disabled={!dir}>
          {t('library.reveal')}
        </button>
      </div>
    </section>
  );
}
