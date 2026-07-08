// Settings ▸ Appearance: the color-theme gallery and language picker. Theme
// mutates settingsStore (applied centrally in state/theme.ts); language goes
// through the i18n store (which persists via main, so the native menu stays in
// sync).
import { LOCALE_LABELS, type LanguagePref } from '@/shared/i18n';
import { useI18n, useSettings, useT } from '../../hooks/useStores';
import { i18nStore } from '../../state/i18n';
import { settingsStore } from '../../state/settings';
import { Segmented } from '../ui/Segmented';
import { SettingRow } from './rows';
import { ThemePicker } from './ThemePicker';

export function AppearanceTab() {
  const t = useT();
  const theme = useSettings((s) => s.theme);
  const langPref = useI18n((s) => s.pref);
  const set = settingsStore.getState().set;

  const languageOptions: { value: LanguagePref; label: string }[] = [
    { value: 'system', label: t('appearance.system') },
    { value: 'en', label: LOCALE_LABELS.en },
    { value: 'pt-BR', label: LOCALE_LABELS['pt-BR'] },
  ];

  return (
    <>
      <section className="settings-group">
        <div className="settings-group-name">{t('appearance.themeGroup')}</div>
        <ThemePicker ariaLabel={t('appearance.colorTheme')} value={theme} onChange={(v) => set('theme', v)} />
        <p className="setting-note">{t('appearance.themeNote')}</p>
      </section>
      <section className="settings-group">
        <div className="settings-group-name">{t('appearance.languageGroup')}</div>
        <SettingRow label={t('appearance.language')}>
          <Segmented<LanguagePref>
            ariaLabel={t('appearance.language')}
            value={langPref}
            onChange={(v) => i18nStore.getState().setLanguage(v)}
            options={languageOptions}
          />
        </SettingRow>
        <p className="setting-note">{t('appearance.languageNote')}</p>
      </section>
    </>
  );
}
