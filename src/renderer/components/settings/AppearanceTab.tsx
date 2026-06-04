// Settings ▸ Appearance: the color-theme picker. Mutates settingsStore only;
// applying the theme happens centrally (state/theme.ts) so it takes effect whether
// or not Settings is open.
import { useSettings } from '../../hooks/useStores';
import { settingsStore, type ThemePref } from '../../state/settings';
import { Segmented } from '../ui/Segmented';

const THEME_OPTIONS: { value: ThemePref; label: string }[] = [
  { value: 'system', label: 'System' },
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
];

export function AppearanceTab() {
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
