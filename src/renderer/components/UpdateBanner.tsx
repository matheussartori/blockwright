// Bottom-centered prompt shown when a newer GitHub Release is detected (the
// startup auto-check or Help ▸ Check for Updates). On Windows the Squirrel
// updater self-installs, so this banner only appears on macOS/Linux, where the
// Download button sends the user to the release page (no in-place auto-install
// for an unsigned build — see main/updater.ts).
import { Download } from 'lucide-react';
import { api } from '../api';
import { store } from '../state/store';
import { useApp, useT } from '../hooks/useStores';

export function UpdateBanner() {
  const t = useT();
  const update = useApp((s) => s.update);
  if (!update) return null;
  return (
    <div className="update-banner" title={update.notes}>
      <span className="ws-dot" />
      <div className="suggest-text">
        <span className="suggest-label">{t('update.available')}</span>
        <span className="suggest-name">{t('update.versionLabel', { version: update.version })}</span>
      </div>
      <button className="btn sm primary suggest-load" onClick={() => void api.openExternal(update.url)}>
        <Download size={13} />
        {t('update.download')}
      </button>
      <button
        className="suggest-dismiss"
        title={t('common.dismiss')}
        onClick={() => store.getState().setUpdate(null)}
      >
        ✕
      </button>
    </div>
  );
}
