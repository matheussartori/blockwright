// Settings ▸ Library: where finished structures live on disk. The "Saved structures
// folder" is a file/storage concern (not an AI-provider one), so it lives here on its
// own. Reads/writes the folder through main (it owns the file writes); offers a native
// picker and a "Reveal in Finder/Explorer" shortcut.
import { useEffect, useState } from 'react';
import { api } from '../../api';

export function LibraryTab() {
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
      <span className="settings-group-name">Saved structures folder</span>
      <p className="setting-note">
        Finished builds are saved here as clean, named files (e.g. <code>cozy-cottage.nbt</code>) so you can browse them
        outside the app — each generation also keeps its full version history internally.
      </p>
      <div className="setting-key-row">
        <input className="input setting-key-input" readOnly value={dir ?? ''} spellCheck={false} />
        <button className="btn sm no-drag" onClick={() => void choose()}>
          Change…
        </button>
        <button className="btn sm no-drag" onClick={() => dir && void api.revealPath(dir)} disabled={!dir}>
          Reveal
        </button>
      </div>
    </section>
  );
}
