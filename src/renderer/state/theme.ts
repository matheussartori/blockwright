// Applies the color-theme preference to the document. Under a strict CSP we
// can't run a no-FOUC inline script, so the CSS handles the *default* (system)
// theme via a `prefers-color-scheme` media query scoped to `:root:not([data-theme])`.
// This module only steps in for an EXPLICIT choice: it sets `data-theme` on the
// <html> element (which wins over the media query), or removes it to fall back to
// system. Kept tiny and framework-free so it can run at startup from index.tsx.
import { settingsStore, type ThemePref } from './settings';
import { api } from '../api';

/** Reflect a theme preference onto <html> AND the native window. Setting
 *  `data-theme` flips our CSS instantly; `setThemeSource` flips the macOS vibrancy
 *  material + traffic lights (and the OS-level prefers-color-scheme) so a forced
 *  light theme isn't dark text on a vibrancy backdrop stuck in dark mode. */
export function applyTheme(pref: ThemePref): void {
  const root = document.documentElement;
  if (pref === 'system') root.removeAttribute('data-theme');
  else root.setAttribute('data-theme', pref);
  void api.setThemeSource(pref);
}

/** Apply the persisted theme now and keep it in sync as the setting changes.
 *  Returns an unsubscribe (unused — the app lives for the process lifetime). */
export function initTheme(): () => void {
  applyTheme(settingsStore.getState().theme);
  let prev = settingsStore.getState().theme;
  return settingsStore.subscribe((s) => {
    if (s.theme !== prev) {
      prev = s.theme;
      applyTheme(s.theme);
    }
  });
}
