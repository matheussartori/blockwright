// The color-theme registry — the single list every theme consumer derives from:
// settings (the valid ThemePref union + load-time sanitize), state/theme.ts (the
// native light/dark mapping for nativeTheme.themeSource) and the Settings ▸
// Appearance ThemePicker (each card's miniature preview colors). A theme is a
// `data-theme` attribute value backed by a token block in index.css; adding one
// here without its CSS block would fall back to the base dark tokens, so keep
// the two in sync. Pure data, no imports beyond the i18n key type.
import type { MessageKey } from '@/shared/i18n';

/** A concrete theme (an index.css `[data-theme=…]` token block). */
export type ThemeId = 'light' | 'dark' | 'minecraft-light' | 'minecraft-dark';

/** The persisted preference: follow the OS (default light/dark) or a concrete theme. */
export type ThemePref = 'system' | ThemeId;

/** The handful of tokens the picker needs to DRAW a theme without applying it. */
export interface ThemePreview {
  bg: string;
  chrome: string;
  elevated: string;
  border: string;
  text: string;
  accent: string;
}

export interface ThemeDef {
  id: ThemeId;
  /** Which side of light/dark this theme is — drives nativeTheme.themeSource
   *  (macOS traffic lights, native dialogs, the logo's prefers-color-scheme). */
  mode: 'light' | 'dark';
  labelKey: MessageKey;
  preview: ThemePreview;
}

/** Every selectable theme, in display order (default pair, then the skins). */
export const THEMES: ThemeDef[] = [
  {
    id: 'light',
    mode: 'light',
    labelKey: 'appearance.light',
    preview: { bg: '#f5f6f8', chrome: '#ebedf1', elevated: '#ffffff', border: 'rgba(0, 0, 0, 0.1)', text: '#1a1c20', accent: '#2f5fd6' },
  },
  {
    id: 'dark',
    mode: 'dark',
    labelKey: 'appearance.dark',
    preview: { bg: '#1a1d23', chrome: '#14161b', elevated: '#20232a', border: 'rgba(255, 255, 255, 0.09)', text: '#f4f5f7', accent: '#3b6fe5' },
  },
  {
    id: 'minecraft-light',
    mode: 'light',
    labelKey: 'appearance.minecraftLight',
    preview: { bg: '#f4f4f4', chrome: '#e8e8e6', elevated: '#ffffff', border: 'rgba(0, 0, 0, 0.11)', text: '#242425', accent: '#3c8527' },
  },
  {
    id: 'minecraft-dark',
    mode: 'dark',
    labelKey: 'appearance.minecraftDark',
    preview: { bg: '#1e1e1f', chrome: '#131314', elevated: '#2b2b2d', border: 'rgba(255, 255, 255, 0.1)', text: '#ececec', accent: '#3c8527' },
  },
];

const BY_ID = new Map(THEMES.map((t) => [t.id, t]));

/** True when `value` is a persistable theme preference (guards stale storage). */
export function isThemePref(value: unknown): value is ThemePref {
  return value === 'system' || BY_ID.has(value as ThemeId);
}

/** Map a preference to what nativeTheme.themeSource understands. */
export function nativeModeFor(pref: ThemePref): 'system' | 'light' | 'dark' {
  return pref === 'system' ? 'system' : BY_ID.get(pref)!.mode;
}
