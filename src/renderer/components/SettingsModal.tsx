// The Settings dialog: a tabbed panel (Appearance / Viewer / AI / About) built on
// the shared Modal + Segmented primitives, with a left nav like the OS settings
// apps. It only mutates `settingsStore`; applying values to the viewer/theme
// happens in one place (App's effect / state/theme.ts) so settings take effect
// whether or not this is open.
import { useEffect, useState } from 'react';
import { api } from '../api';
import { settingsStore } from '../state/settings';
import { store } from '../state/store';
import { useApp, useSettings } from '../hooks/useStores';
import type { ApiKeyInfo } from '@/shared/types';
import type { ThemePref } from '../state/settings';
import { Modal } from './ui/Modal';
import { Segmented } from './ui/Segmented';
import { Logo } from './ui/Logo';

type TabId = 'appearance' | 'viewer' | 'ai' | 'about';
const TABS: { id: TabId; label: string }[] = [
  { id: 'appearance', label: 'Appearance' },
  { id: 'viewer', label: 'Viewer' },
  { id: 'ai', label: 'AI' },
  { id: 'about', label: 'About' },
];

export function SettingsModal() {
  const open = useApp((s) => s.settingsOpen);
  const [tab, setTab] = useState<TabId>('appearance');
  const close = () => store.getState().setSettingsOpen(false);

  return (
    <Modal
      open={open}
      onClose={close}
      title="Settings"
      className="modal-lg settings"
      bodyClassName="settings-body"
      footer={
        <button className="link" onClick={() => settingsStore.getState().reset()}>
          Reset to defaults
        </button>
      }
    >
      <nav className="settings-nav" role="tablist" aria-label="Settings sections">
        {TABS.map((t) => (
          <button
            key={t.id}
            role="tab"
            aria-selected={tab === t.id}
            className={`settings-nav-item${tab === t.id ? ' active' : ''}`}
            onClick={() => setTab(t.id)}
          >
            {t.label}
          </button>
        ))}
      </nav>
      <div className="settings-pane">
        {tab === 'appearance' && <AppearanceTab />}
        {tab === 'viewer' && <ViewerTab />}
        {tab === 'ai' && <ApiKeySection />}
        {tab === 'about' && <AboutTab />}
      </div>
    </Modal>
  );
}

const THEME_OPTIONS: { value: ThemePref; label: string }[] = [
  { value: 'system', label: 'System' },
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
];

function AppearanceTab() {
  const theme = useSettings((s) => s.theme);
  const set = settingsStore.getState().set;
  return (
    <section className="settings-group">
      <div className="settings-group-name">Theme</div>
      <label className="setting-row">
        <span className="setting-label">Color theme</span>
        <Segmented<ThemePref> ariaLabel="Theme" value={theme} onChange={(v) => set('theme', v)} options={THEME_OPTIONS} />
      </label>
      <p className="setting-note">“System” follows your operating system’s light/dark appearance.</p>
    </section>
  );
}

function ViewerTab() {
  const settings = useSettings((s) => s);
  const set = settingsStore.getState().set;
  return (
    <>
      <section className="settings-group">
        <div className="settings-group-name">Scene</div>
        <label className="setting-row">
          <span className="setting-label">Show ground grid</span>
          <input type="checkbox" checked={settings.showGrid} onChange={(e) => set('showGrid', e.target.checked)} />
        </label>
      </section>
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
          <input type="checkbox" checked={settings.invertY} onChange={(e) => set('invertY', e.target.checked)} />
        </label>
      </section>
    </>
  );
}

function AboutTab() {
  const contentVersion = useApp((s) => s.contentVersion);
  return (
    <section className="settings-group about">
      <Logo size={64} className="about-logo" />
      <div className="about-name">Blockwright</div>
      <p className="about-tagline">Build, view, and AI-generate Minecraft structures in 3D.</p>
      <dl className="about-meta">
        <div>
          <dt>Target version</dt>
          <dd className="stat-num">{contentVersion ?? '—'}</dd>
        </div>
      </dl>
    </section>
  );
}

/** Anthropic API key entry. The key is stored (encrypted) in the main process;
 *  we only ever read back a "set?" flag and a masked hint, never the secret. */
function ApiKeySection() {
  const [info, setInfo] = useState<ApiKeyInfo | null>(null);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);

  // Refresh the status when the tab mounts (it may have changed elsewhere).
  useEffect(() => {
    setDraft('');
    void api.aiKeyInfo().then(setInfo);
  }, []);

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
            <strong>already logged into Claude Code</strong> on this machine, there's nothing to set here — it
            just works.
          </p>
          <p className="setting-note">
            {info?.set ? (
              <>
                A credential is saved (<code>{info.hint}</code>), stored encrypted on this device. Enter a new
                one below to replace it.
              </>
            ) : (
              <>
                Otherwise, paste a token from <code>claude setup-token</code> (uses your Pro/Max plan) or an
                Anthropic API key. It's stored encrypted on this device and only handed to the Claude Code
                process.
              </>
            )}
          </p>
          <div className="setting-key-row">
            <input
              className="input setting-key-input"
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
