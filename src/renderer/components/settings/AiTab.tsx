// Settings ▸ AI: pick the active provider backend, choose its model, and manage
// per-provider credentials. Secrets are stored (encrypted) in the main process;
// only a "configured?" flag, a masked hint, and the chosen model ever cross the
// bridge. Stable providers show first; beta ones (less-exercised backends) collapse
// behind a toggle.
import { useEffect, useState } from 'react';
import { api } from '../../api';
import {
  AI_PROVIDERS, providerMeta,
  type AiConfig, type AiProviderId, type AiProviderMeta, type AiProviderState, type AiStability,
} from '@/shared/ai';

/** A "Stable"/"Beta" maturity badge (reuses the `.ai-pill` chrome). */
function StabilityPill({ stability }: { stability: AiStability }) {
  return (
    <span className={`ai-pill ai-pill-${stability}`}>{stability === 'stable' ? 'Stable' : 'Beta'}</span>
  );
}

/** Human label for a provider's currently-selected model id. */
function modelLabel(meta: AiProviderMeta | undefined, modelId: string): string {
  return meta?.models.find((m) => m.id === modelId)?.label ?? modelId;
}

export function AiTab() {
  const [config, setConfig] = useState<AiConfig | null>(null);
  const [showBeta, setShowBeta] = useState(false);

  useEffect(() => {
    void api.aiGetConfig().then(setConfig);
  }, []);

  if (!config) return <section className="settings-group" />;

  const stateOf = (id: AiProviderId): AiProviderState =>
    config.providers.find((p) => p.id === id) ?? { id, configured: false, fromEnv: false, hint: null, model: '' };
  const activate = (id: AiProviderId): void => void api.aiSetActiveProvider(id).then(setConfig);

  const stable = AI_PROVIDERS.filter((m) => m.stability === 'stable');
  const beta = AI_PROVIDERS.filter((m) => m.stability === 'beta');
  const activeMeta = providerMeta(config.activeProvider);

  const card = (meta: AiProviderMeta) => (
    <ProviderCard
      key={meta.id}
      meta={meta}
      state={stateOf(meta.id)}
      active={config.activeProvider === meta.id}
      onChange={setConfig}
      onActivate={activate}
    />
  );

  return (
    <>
      <section className="settings-group ai-active-banner">
        <span className="ai-active-label">Generating with</span>
        <span className="ai-active-name">{activeMeta?.label ?? config.activeProvider}</span>
        {activeMeta && <StabilityPill stability={activeMeta.stability} />}
        <span className="ai-active-model">{modelLabel(activeMeta, stateOf(config.activeProvider).model)}</span>
      </section>

      {stable.map(card)}

      <section className="settings-group ai-beta-section">
        <button
          type="button"
          className="ai-beta-toggle no-drag"
          aria-expanded={showBeta}
          onClick={() => setShowBeta((v) => !v)}
        >
          <span className={`ai-beta-chevron${showBeta ? ' open' : ''}`} aria-hidden>›</span>
          <span className="settings-group-name">Beta providers</span>
          <span className="ai-pill ai-pill-beta">Beta</span>
          <span className="ai-beta-sub">{beta.map((b) => b.label).join(' · ')}</span>
        </button>
        <p className="setting-note">
          They work, but are less exercised — the self-review/critic loop is tuned for Claude. Expand to configure or
          switch to one.
        </p>
      </section>
      {showBeta && beta.map(card)}
    </>
  );
}

function ProviderCard({
  meta,
  state,
  active,
  onChange,
  onActivate,
}: {
  meta: AiProviderMeta;
  state: AiProviderState;
  active: boolean;
  onChange: (c: AiConfig) => void;
  onActivate: (id: AiProviderId) => void;
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
        <StabilityPill stability={meta.stability} />
        <span className={`ai-pill${state.configured || state.fromEnv ? ' ai-pill-ok' : ''}`}>{status}</span>
        {active ? (
          <span className="ai-pill ai-pill-active ai-provider-active">Active</span>
        ) : (
          <button className="btn sm no-drag ai-provider-active" onClick={() => onActivate(meta.id)}>
            Use
          </button>
        )}
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
