// Settings ▸ Appearance: the color-theme and language pickers. Theme mutates
// settingsStore (applied centrally in state/theme.ts); language goes through the
// i18n store (which persists via main, so the native menu stays in sync).
import { LOCALE_LABELS, type LanguagePref } from '@/shared/i18n';
import { useI18n, useSettings, useT } from '../../hooks/useStores';
import { i18nStore } from '../../state/i18n';
import { settingsStore, type ThemePref } from '../../state/settings';
import { Segmented } from '../ui/Segmented';

export function AppearanceTab() {
  const t = useT();
  const theme = useSettings((s) => s.theme);
  const langPref = useI18n((s) => s.pref);
  const set = settingsStore.getState().set;

  const themeOptions: { value: ThemePref; label: string }[] = [
    { value: 'system', label: t('appearance.system') },
    { value: 'light', label: t('appearance.light') },
    { value: 'dark', label: t('appearance.dark') },
  ];
  const languageOptions: { value: LanguagePref; label: string }[] = [
    { value: 'system', label: t('appearance.system') },
    { value: 'en', label: LOCALE_LABELS.en },
    { value: 'pt-BR', label: LOCALE_LABELS['pt-BR'] },
  ];

  return (
    <>
      <section className="settings-group">
        <div className="settings-group-name">{t('appearance.themeGroup')}</div>
        <label className="setting-row">
          <span className="setting-label">{t('appearance.colorTheme')}</span>
          <Segmented<ThemePref> ariaLabel={t('appearance.colorTheme')} value={theme} onChange={(v) => set('theme', v)} options={themeOptions} />
        </label>
        <p className="setting-note">{t('appearance.themeNote')}</p>
      </section>
      <section className="settings-group">
        <div className="settings-group-name">{t('appearance.languageGroup')}</div>
        <label className="setting-row">
          <span className="setting-label">{t('appearance.language')}</span>
          <Segmented<LanguagePref>
            ariaLabel={t('appearance.language')}
            value={langPref}
            onChange={(v) => i18nStore.getState().setLanguage(v)}
            options={languageOptions}
          />
        </label>
        <p className="setting-note">{t('appearance.languageNote')}</p>
      </section>
    </>
  );
}
