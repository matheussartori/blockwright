// Settings ▸ Appearance: the theme gallery. One card per theme, each drawn as a
// miniature of the workbench (top bar + activity rail + a floating panel + the
// voxel cube mark) in that theme's ACTUAL palette — the colors come from the
// registry (state/themes.ts), not the live tokens, so every card shows its own
// theme regardless of the one applied. "System" is a diagonal light/dark split
// of the default pair. A radiogroup of radio buttons, so it reads to a keyboard
// / screen reader exactly like the Segmented it replaced. (Everything inside
// the <button> is spans — phrasing content — so the markup stays valid.)
import type { ReactNode } from 'react';
import { Check } from 'lucide-react';
import { THEMES, type ThemePref, type ThemePreview } from '../../state/themes';
import { useT } from '../../hooks/useStores';

/** A tiny isometric voxel cube — the app's mark, tinted by the theme accent. */
function MiniCube({ accent }: { accent: string }) {
  const top = '12,3 21,8 12,13 3,8';
  const left = '3,8 12,13 12,23 3,18';
  const right = '21,8 12,13 12,23 21,18';
  return (
    <svg className="theme-mini-cube" viewBox="0 0 24 26" aria-hidden="true">
      {/* base color, then white/black overlays so the three faces shade on any bg */}
      <polygon points={top} fill={accent} />
      <polygon points={top} fill="#fff" fillOpacity={0.3} />
      <polygon points={left} fill={accent} />
      <polygon points={left} fill="#000" fillOpacity={0.18} />
      <polygon points={right} fill={accent} />
      <polygon points={right} fill="#000" fillOpacity={0.4} />
    </svg>
  );
}

/** The miniature workbench a card previews: chrome frame around a lit stage. */
function MiniWorkbench({ p }: { p: ThemePreview }) {
  return (
    <span className="theme-mini" style={{ background: p.bg }}>
      <span className="theme-mini-top" style={{ background: p.chrome, borderBottom: `1px solid ${p.border}` }} />
      <span className="theme-mini-rail" style={{ background: p.chrome, borderRight: `1px solid ${p.border}` }} />
      <MiniCube accent={p.accent} />
      <span className="theme-mini-panel" style={{ background: p.elevated, border: `1px solid ${p.border}` }}>
        <i style={{ background: p.text, opacity: 0.7 }} />
        <i style={{ background: p.text, opacity: 0.3 }} />
        <i className="theme-mini-btn" style={{ background: p.accent }} />
      </span>
    </span>
  );
}

const LIGHT = THEMES.find((t) => t.id === 'light')!;
const DARK = THEMES.find((t) => t.id === 'dark')!;

interface ThemePickerProps {
  value: ThemePref;
  onChange: (value: ThemePref) => void;
  ariaLabel: string;
}

export function ThemePicker({ value, onChange, ariaLabel }: ThemePickerProps) {
  const t = useT();
  const card = (pref: ThemePref, name: string, preview: ReactNode) => {
    const active = value === pref;
    return (
      <button
        key={pref}
        type="button"
        role="radio"
        aria-checked={active}
        className={`theme-card${active ? ' active' : ''}`}
        onClick={() => onChange(pref)}
      >
        <span className="theme-card-preview">
          {preview}
          {active && (
            <span className="theme-card-check">
              <Check size={11} strokeWidth={3.2} />
            </span>
          )}
        </span>
        <span className="theme-card-name">{name}</span>
      </button>
    );
  };

  return (
    <div className="theme-picker" role="radiogroup" aria-label={ariaLabel}>
      {card(
        'system',
        t('appearance.system'),
        <>
          <MiniWorkbench p={LIGHT.preview} />
          <span className="theme-mini-split">
            <MiniWorkbench p={DARK.preview} />
          </span>
        </>,
      )}
      {THEMES.map((theme) => card(theme.id, t(theme.labelKey), <MiniWorkbench p={theme.preview} />))}
    </div>
  );
}
