// The Settings panel: a modal overlay that edits the persisted settings store.
// It only mutates `settingsStore`; applying values to the viewer happens in one
// place (App's effect), so settings take effect whether or not this is open.
import { useEffect, useState } from 'react';
import { api } from '../api';
import { settingsStore } from '../state/settings';
import { store } from '../state/store';
import { useApp, useSettings } from '../hooks/useStores';
import type { ApiKeyInfo } from '@/shared/types';

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
          <ApiKeySection open={open} />
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

/** Anthropic API key entry. The key is stored (encrypted) in the main process;
 *  we only ever read back a "set?" flag and a masked hint, never the secret. */
function ApiKeySection({ open }: { open: boolean }) {
  const [info, setInfo] = useState<ApiKeyInfo | null>(null);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);

  // Refresh the status each time the panel opens (it may have changed elsewhere).
  useEffect(() => {
    if (!open) return;
    setDraft('');
    void api.aiKeyInfo().then(setInfo);
  }, [open]);

  const save = async () => {
    const key = draft.trim();
    if (!key || busy) return;
    setBusy(true);
    try {
      setInfo(await api.aiSetKey(key));
      setDraft('');
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (busy) return;
    setBusy(true);
    try {
      setInfo(await api.aiClearKey());
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="settings-group">
      <div className="settings-group-name">AI structure generation</div>
      {info?.fromEnv ? (
        <p className="setting-note">
          Using the credential from your environment (<code>CLAUDE_CODE_OAUTH_TOKEN</code> or{' '}
          <code>ANTHROPIC_API_KEY</code>). Unset it to manage the credential here instead.
        </p>
      ) : (
        <>
          <p className="setting-note">
            Generation runs on your Claude subscription through Claude Code. If you're{' '}
            <strong>already logged into Claude Code</strong> on this machine, there's nothing to set
            here — it just works.
          </p>
          <p className="setting-note">
            {info?.set ? (
              <>
                A credential is saved (<code>{info.hint}</code>), stored encrypted on this device.
                Enter a new one below to replace it.
              </>
            ) : (
              <>
                Otherwise, paste a token from <code>claude setup-token</code> (uses your Pro/Max plan)
                or an Anthropic API key. It's stored encrypted on this device and only handed to the
                Claude Code process.
              </>
            )}
          </p>
          <div className="setting-key-row">
            <input
              className="setting-key-input"
              type="password"
              placeholder="sk-ant-oat… or sk-ant-api…"
              autoComplete="off"
              spellCheck={false}
              value={draft}
              disabled={busy}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                e.stopPropagation();
                if (e.key === 'Enter') void save();
              }}
            />
            <button className="btn primary sm" onClick={() => void save()} disabled={busy || !draft.trim()}>
              Save
            </button>
            {info?.set && (
              <button className="btn sm" onClick={() => void remove()} disabled={busy}>
                Remove
              </button>
            )}
          </div>
        </>
      )}
    </section>
  );
}
