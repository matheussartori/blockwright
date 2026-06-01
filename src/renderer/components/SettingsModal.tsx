// The Settings panel: a modal overlay that edits the persisted settings store.
// It only mutates `settingsStore`; applying values to the viewer happens in one
// place (App's effect), so settings take effect whether or not this is open.
import { useEffect } from 'react';
import { settingsStore } from '../state/settings';
import { store } from '../state/store';
import { useApp, useSettings } from '../hooks/useStores';

export function SettingsModal() {
  const open = useApp((s) => s.settingsOpen);
  const settings = useSettings((s) => s);
  const set = settingsStore.getState().set;

  const close = () => store.getState().setSettingsOpen(false);

  // While open, swallow keys so viewer shortcuts (F to fly, WASD) stay inert and
  // Escape closes the panel.
  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        close();
        return;
      }
      if (!(e.target as Element)?.closest?.('.settings-modal')) e.stopPropagation();
    };
    window.addEventListener('keydown', onKeyDown, true);
    return () => window.removeEventListener('keydown', onKeyDown, true);
  }, [open]);

  if (!open) return null;

  return (
    <div className="settings-overlay" onMouseDown={(e) => e.target === e.currentTarget && close()}>
      <div className="settings-modal" role="dialog" aria-modal="true" aria-label="Settings">
        <header className="settings-head">
          <h2>Settings</h2>
          <button className="settings-close" title="Close" aria-label="Close" onClick={close}>
            ✕
          </button>
        </header>
        <div className="settings-body">
          <section className="settings-group">
            <div className="settings-group-name">Fly mode</div>
            <label className="setting-row">
              <span className="setting-label">Mouse sensitivity</span>
              <input
                type="range"
                min={0.2}
                max={3}
                step={0.05}
                value={settings.lookSensitivity}
                onChange={(e) => set('lookSensitivity', Number(e.target.value))}
              />
              <span className="setting-value">{settings.lookSensitivity.toFixed(2)}×</span>
            </label>
            <label className="setting-row">
              <span className="setting-label">Invert Y axis</span>
              <input
                type="checkbox"
                checked={settings.invertY}
                onChange={(e) => set('invertY', e.target.checked)}
              />
            </label>
          </section>
          <section className="settings-group">
            <div className="settings-group-name">Viewer</div>
            <label className="setting-row">
              <span className="setting-label">Show grid</span>
              <input
                type="checkbox"
                checked={settings.showGrid}
                onChange={(e) => set('showGrid', e.target.checked)}
              />
            </label>
          </section>
        </div>
        <footer className="settings-foot">
          <button className="link" onClick={() => settingsStore.getState().reset()}>
            Reset to defaults
          </button>
        </footer>
      </div>
    </div>
  );
}
