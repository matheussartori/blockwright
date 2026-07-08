// Settings ▸ AI: pick the active provider backend, choose its model, and manage
// per-provider credentials. Secrets are stored (encrypted) in the main process;
// only a "configured?" flag, a masked hint, and the chosen model ever cross the
// bridge. Stable providers show first; beta ones (less-exercised backends) collapse
// behind a toggle.
import { useEffect, useState } from 'react';
import { api } from '../../api';
import { useSettings, useT, useLocale } from '../../hooks/useStores';
import { settingsStore } from '../../state/settings';
import { Select } from '../ui/Select';
import { Stepper } from '../ui/Stepper';
import { SettingRow, ToggleRow } from './rows';
import type { MessageKey } from '@/shared/i18n';
import { localizeData, aiProviderKey, aiPresetKey } from '@/shared/i18n/registry';
import {
  AI_PROVIDERS, GENERATION_LIMITS, GENERATION_PRESETS, presetIdFor, providerMeta,
  type AiConfig, type AiProviderId, type AiProviderMeta, type AiProviderState, type AiStability,
  type GenerationSettings, type ThinkingEffort,
} from '@/shared/ai';

/** A "Stable"/"Beta" maturity badge (reuses the `.ai-pill` chrome). */
function StabilityPill({ stability }: { stability: AiStability }) {
  const t = useT();
  return (
    <span className={`ai-pill ai-pill-${stability}`}>{stability === 'stable' ? t('ai.stable') : t('ai.beta')}</span>
  );
}

/** Human label for a provider's currently-selected model id. */
function modelLabel(meta: AiProviderMeta | undefined, modelId: string): string {
  return meta?.models.find((m) => m.id === modelId)?.label ?? modelId;
}

export function AiTab() {
  const t = useT();
  const locale = useLocale();
  const provLabel = (m: AiProviderMeta) => localizeData(locale, aiProviderKey(m.id).label, m.label);
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
        <span className="ai-active-label">{t('ai.generatingWith')}</span>
        <span className="ai-active-name">{activeMeta ? provLabel(activeMeta) : config.activeProvider}</span>
        {activeMeta && <StabilityPill stability={activeMeta.stability} />}
        <span className="ai-active-model">{modelLabel(activeMeta, stateOf(config.activeProvider).model)}</span>
      </section>

      <GenerationCard generation={config.generation} onChange={setConfig} />

      <ReviewLibraryCard libraryRetention={config.libraryRetention} onChange={setConfig} />

      {stable.map(card)}

      <section className="settings-group ai-beta-section">
        <button
          type="button"
          className="ai-beta-toggle no-drag"
          aria-expanded={showBeta}
          onClick={() => setShowBeta((v) => !v)}
        >
          <span className={`ai-beta-chevron${showBeta ? ' open' : ''}`} aria-hidden>›</span>
          <span className="settings-group-name">{t('ai.betaProviders')}</span>
          <span className="ai-pill ai-pill-beta">{t('ai.beta')}</span>
          <span className="ai-beta-sub">{beta.map(provLabel).join(' · ')}</span>
        </button>
        <p className="setting-note">{t('ai.betaNote')}</p>
      </section>
      {showBeta && beta.map(card)}
    </>
  );
}

/** Review-image + library housekeeping (the v2.2 knobs): the self-review screenshot
 *  size (renderer-side — the token/quality lever of the review loop) and the library
 *  retention (main-side pref — keep the last N versions per generated build). */
function ReviewLibraryCard({
  libraryRetention,
  onChange,
}: {
  libraryRetention: number;
  onChange: (config: AiConfig) => void;
}) {
  const t = useT();
  const reviewSize = useSettings((s) => s.aiReviewImageSize);
  return (
    <section className="settings-group">
      <div className="settings-group-name">{t('ai.reviewGroup')}</div>
      <SettingRow label={t('ai.reviewSize')}>
        <Select
          value={String(reviewSize)}
          options={[
            { value: '384', label: t('ai.reviewSizeSmall') },
            { value: '512', label: t('ai.reviewSizeMedium') },
            { value: '768', label: t('ai.reviewSizeLarge') },
          ]}
          onChange={(v) => settingsStore.getState().set('aiReviewImageSize', Number(v))}
          ariaLabel={t('ai.reviewSize')}
        />
      </SettingRow>
      <p className="setting-note">{t('ai.reviewSizeNote')}</p>
      <SettingRow label={t('ai.libraryRetention')}>
        <Stepper
          value={libraryRetention}
          onChange={(v) => void api.aiSetLibraryRetention(Math.max(0, Math.round(v))).then(onChange)}
          min={0}
          max={100}
          step={1}
          size="sm"
          ariaLabel={t('ai.libraryRetention')}
        />
      </SettingRow>
      <p className="setting-note">{t('ai.libraryRetentionNote')}</p>
    </section>
  );
}

/** Reasoning-effort steps for Claude's thinking, so the user picks Off/Low/Medium/High/…
 *  instead of raw token counts (the current models use adaptive thinking + effort). */
const THINKING_OPTS: { effort: ThinkingEffort; key: MessageKey }[] = [
  { effort: 'off', key: 'ai.thinkOff' },
  { effort: 'low', key: 'ai.thinkLow' },
  { effort: 'medium', key: 'ai.thinkMedium' },
  { effort: 'high', key: 'ai.thinkHigh' },
  { effort: 'xhigh', key: 'ai.thinkXhigh' },
  { effort: 'max', key: 'ai.thinkMax' },
];

/** The global generation cost/quality control: a one-click preset row (Balanced /
 *  Thorough / Saver) over the three underlying knobs, plus a "Fine-tune"
 *  disclosure to set rounds / thinking / critic directly (which flips the preset
 *  highlight to "Custom"). Defaults are cheap. */
function GenerationCard({
  generation,
  onChange,
}: {
  generation: GenerationSettings;
  onChange: (c: AiConfig) => void;
}) {
  const t = useT();
  const locale = useLocale();
  const [advanced, setAdvanced] = useState(false);
  const g = generation;
  const active = presetIdFor(g);
  const set = (patch: Partial<GenerationSettings>): void => void api.aiSetGeneration(patch).then(onChange);
  const activePreset = GENERATION_PRESETS.find((p) => p.id === active);
  const activeBlurb = activePreset && localizeData(locale, aiPresetKey(activePreset.id).blurb, activePreset.blurb);

  return (
    <section className="settings-group ai-generation">
      <div className="ai-provider-head">
        <span className="settings-group-name">{t('ai.genTitle')}</span>
      </div>
      <p className="setting-note">{t('ai.genNote')}</p>

      <div className="ai-preset-row no-drag">
        {GENERATION_PRESETS.map((p) => (
          <button
            key={p.id}
            type="button"
            className={`ai-preset${active === p.id ? ' selected' : ''}`}
            onClick={() => set(p.settings)}
          >
            {localizeData(locale, aiPresetKey(p.id).label, p.label)}
          </button>
        ))}
        {active === 'custom' && (
          <span className="ai-preset selected ai-preset-custom">{t('ai.presetCustom')}</span>
        )}
      </div>
      {activeBlurb && <p className="setting-note">{activeBlurb}</p>}

      <button
        type="button"
        className="ai-beta-toggle no-drag"
        aria-expanded={advanced}
        onClick={() => setAdvanced((v) => !v)}
      >
        <span className={`ai-beta-chevron${advanced ? ' open' : ''}`} aria-hidden>›</span>
        <span className="settings-group-name">{t('ai.genAdvanced')}</span>
      </button>

      {advanced && (
        <>
          <SettingRow label={t('ai.genRounds')}>
            <Select
              value={String(g.maxRounds)}
              options={[
                { value: '0', label: t('ai.genRoundsAuto') },
                ...Array.from({ length: GENERATION_LIMITS.maxRounds - GENERATION_LIMITS.minRounds + 1 }, (_, i) => {
                  const n = GENERATION_LIMITS.minRounds + i;
                  return { value: String(n), label: String(n) };
                }),
              ]}
              onChange={(v) => set({ maxRounds: Number(v) })}
              ariaLabel={t('ai.genRounds')}
            />
          </SettingRow>
          <p className="setting-note">{t('ai.genRoundsNote')}</p>

          <SettingRow label={t('ai.genThinking')}>
            <Select
              value={g.thinkingEffort}
              options={THINKING_OPTS.map((o) => ({ value: o.effort, label: t(o.key) }))}
              onChange={(v) => set({ thinkingEffort: v as ThinkingEffort })}
              ariaLabel={t('ai.genThinking')}
            />
          </SettingRow>
          <p className="setting-note">{t('ai.genThinkingNote')}</p>

          <ToggleRow label={t('ai.genCritic')} checked={g.critic} onChange={(v) => set({ critic: v })} />
          <p className="setting-note">{t('ai.genCriticNote')}</p>
        </>
      )}
    </section>
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
  const t = useT();
  const locale = useLocale();
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
    ? t('ai.fromEnv')
    : state.configured
      ? t('ai.configured', { hint: state.hint ?? '' })
      : meta.authKind === 'subscription'
        ? t('ai.cliLogin')
        : t('ai.notSet');

  return (
    <section className="settings-group ai-provider">
      <div className="ai-provider-head">
        <span className="settings-group-name">{localizeData(locale, aiProviderKey(meta.id).label, meta.label)}</span>
        <StabilityPill stability={meta.stability} />
        <span className={`ai-pill${state.configured || state.fromEnv ? ' ai-pill-ok' : ''}`}>{status}</span>
        {active ? (
          <span className="ai-pill ai-pill-active ai-provider-active">{t('ai.active')}</span>
        ) : (
          <button className="btn sm no-drag ai-provider-active" onClick={() => onActivate(meta.id)}>
            {t('ai.use')}
          </button>
        )}
      </div>
      <p className="setting-note">{localizeData(locale, aiProviderKey(meta.id).blurb, meta.blurb)}</p>

      <SettingRow label={t('ai.model')}>
        <Select
          value={state.model}
          options={meta.models.map((m) => ({ value: m.id, label: m.label }))}
          onChange={(v) => void api.aiSetModel(meta.id, v).then(onChange)}
          ariaLabel={t('ai.model')}
        />
      </SettingRow>

      {state.fromEnv ? (
        <p className="setting-note">
          {t('ai.pinnedPre')}<code>{meta.envVars.join('</code> / <code>')}</code>{t('ai.pinnedPost')}
        </p>
      ) : (
        <>
          {meta.authKind === 'subscription' && (
            <p className="setting-note">
              {t('ai.subscriptionNotePre')}<code>codex login</code>{t('ai.subscriptionNotePost')}
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
              {t('ai.save')}
            </button>
            {state.configured && (
              <button className="btn sm" onClick={() => void remove()} disabled={busy}>
                {t('ai.remove')}
              </button>
            )}
          </div>
        </>
      )}
    </section>
  );
}
