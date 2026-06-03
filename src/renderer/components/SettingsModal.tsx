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
import { AI_PROVIDERS, type AiConfig, type AiProviderId, type AiProviderState } from '@/shared/ai';
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

const TAB_IDS = TABS.map((t) => t.id);

export function SettingsModal() {
  const open = useApp((s) => s.settingsOpen);
  const section = useApp((s) => s.settingsSection);
  const [tab, setTab] = useState<TabId>('appearance');
  const close = () => store.getState().setSettingsOpen(false);

  // When opened to a specific section (e.g. the native About menu), jump to that
  // tab and clear the request so a later open lands on the user's last tab.
  useEffect(() => {
    if (section && (TAB_IDS as string[]).includes(section)) {
      setTab(section as TabId);
      store.getState().setSettingsSection(null);
    }
  }, [section]);

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
        {tab === 'ai' && <AiTab />}
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
        <label className="setting-row">
          <span className="setting-label">Block textures in the Info list</span>
          <input
            type="checkbox"
            checked={settings.blockTextureIcons}
            onChange={(e) => set('blockTextureIcons', e.target.checked)}
          />
        </label>
        <p className="setting-note">Show each block’s texture instead of a flat color swatch.</p>
        <label className="setting-row">
          <span className="setting-label">Only highlight floors while editing</span>
          <input
            type="checkbox"
            checked={settings.floorsOnlyWhenEditing}
            onChange={(e) => set('floorsOnlyWhenEditing', e.target.checked)}
          />
        </label>
        <p className="setting-note">
          When off, a build’s floor-plan regions stay highlighted in the viewer; when on, they only
          show while the Generate ▸ Floors section is open.
        </p>
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
  const [appVersion, setAppVersion] = useState<string | null>(null);

  useEffect(() => {
    void api.getAppVersion().then(setAppVersion);
  }, []);

  return (
    <section className="settings-group about">
      <Logo size={72} className="about-logo" />
      <div className="about-name">Blockwright</div>
      {appVersion && <div className="about-version">Version {appVersion}</div>}
      <p className="about-tagline">Build, view, and AI-generate Minecraft structures in 3D.</p>

      <dl className="about-meta">
        <div>
          <dt>App version</dt>
          <dd className="stat-num">{appVersion ?? '—'}</dd>
        </div>
        <div>
          <dt>Target Minecraft</dt>
          <dd className="stat-num">{contentVersion ?? '—'}</dd>
        </div>
        <div>
          <dt>Renderer</dt>
          <dd className="stat-num">Three.js</dd>
        </div>
      </dl>

      <div className="about-credits">
        <p>
          Crafted by <strong>Matheus Sartori</strong>. AI generation runs on the provider you choose in
          Settings ▸ AI — your Claude or ChatGPT subscription, or an Anthropic, OpenAI, or Gemini API key.
        </p>
        <p className="about-built">
          Built with Electron, Vite, React &amp; Three.js. Structure parsing by prismarine-nbt.
        </p>
      </div>
    </section>
  );
}

/** AI provider configuration: pick the active backend, choose its model, and
 *  manage per-provider credentials. Secrets are stored (encrypted) in the main
 *  process; only a "configured?" flag, a masked hint, and the chosen model ever
 *  cross the bridge. */
function AiTab() {
  const [config, setConfig] = useState<AiConfig | null>(null);

  useEffect(() => {
    void api.aiGetConfig().then(setConfig);
  }, []);

  if (!config) return <section className="settings-group" />;

  const stateOf = (id: AiProviderId): AiProviderState =>
    config.providers.find((p) => p.id === id) ?? { id, configured: false, fromEnv: false, hint: null, model: '' };

  return (
    <>
      <section className="settings-group">
        <div className="settings-group-name">Active provider</div>
        <label className="setting-row">
          <span className="setting-label">Generate with</span>
          <select
            className="input setting-select"
            value={config.activeProvider}
            onChange={(e) => void api.aiSetActiveProvider(e.target.value as AiProviderId).then(setConfig)}
          >
            {AI_PROVIDERS.map((m) => (
              <option key={m.id} value={m.id}>
                {m.label}
                {stateOf(m.id).configured ? '' : m.authKind === 'api-key' ? ' — needs a key' : ''}
              </option>
            ))}
          </select>
        </label>
        <p className="setting-note">
          Choose which backend builds your structures. You can configure several below and switch any time.
        </p>
      </section>

      {AI_PROVIDERS.map((meta) => (
        <ProviderCard
          key={meta.id}
          meta={meta}
          state={stateOf(meta.id)}
          active={config.activeProvider === meta.id}
          onChange={setConfig}
        />
      ))}
    </>
  );
}

function ProviderCard({
  meta,
  state,
  active,
  onChange,
}: {
  meta: (typeof AI_PROVIDERS)[number];
  state: AiProviderState;
  active: boolean;
  onChange: (c: AiConfig) => void;
}) {
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);

  const save = async () => {
    const secret = draft.trim();
    if (!secret || busy) return;
    setBusy(true);
    try {
      onChange(await api.aiSetCredential(meta.id, secret));
      setDraft('');
    } finally {
      setBusy(false);
    }
  };
  const remove = async () => {
    if (busy) return;
    setBusy(true);
    try {
      onChange(await api.aiClearCredential(meta.id));
    } finally {
      setBusy(false);
    }
  };

  const status = state.fromEnv
    ? 'From environment'
    : state.configured
      ? `Configured (${state.hint})`
      : meta.authKind === 'subscription'
        ? 'CLI login'
        : 'Not set';

  return (
    <section className="settings-group ai-provider">
      <div className="ai-provider-head">
        <span className="settings-group-name">{meta.label}</span>
        {active && <span className="ai-pill ai-pill-active">Active</span>}
        <span className={`ai-pill${state.configured || state.fromEnv ? ' ai-pill-ok' : ''}`}>{status}</span>
      </div>
      <p className="setting-note">{meta.blurb}</p>

      <label className="setting-row">
        <span className="setting-label">Model</span>
        <select
          className="input setting-select"
          value={state.model}
          onChange={(e) => void api.aiSetModel(meta.id, e.target.value).then(onChange)}
        >
          {meta.models.map((m) => (
            <option key={m.id} value={m.id}>
              {m.label}
            </option>
          ))}
        </select>
      </label>

      {state.fromEnv ? (
        <p className="setting-note">
          Pinned by <code>{meta.envVars.join('</code> / <code>')}</code> in your environment. Unset it to manage the credential here.
        </p>
      ) : (
        <>
          {meta.authKind === 'subscription' && (
            <p className="setting-note">
              Sign in via the CLI (Claude Code / <code>codex login</code>) and it just works — a token below is
              optional, for machines without an interactive login.
            </p>
          )}
          <div className="setting-key-row">
            <input
              className="input setting-key-input"
              type="password"
              placeholder={meta.keyPlaceholder}
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
            {state.configured && (
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
