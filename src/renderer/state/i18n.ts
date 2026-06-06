// Renderer-side language state. The main process owns the persisted preference
// (so the native menu can localize at startup, see main/language.ts); this store
// mirrors it: it reads the current language over IPC, re-reads on the
// `languageChanged` push (from the native Language menu), and writes back when the
// in-app picker changes it. `t` is rebuilt whenever the locale changes, so any
// component selecting it re-renders into the new language.
import { createStore } from 'zustand/vanilla';
import {
  DEFAULT_LOCALE,
  type LanguageInfo,
  type LanguagePref,
  type Locale,
  type TFunction,
  makeT,
  resolveLocale,
} from '@/shared/i18n';
import { api } from '../api';

export interface I18nState {
  pref: LanguagePref;
  locale: Locale;
  /** Translate a key in the current locale (new identity per locale change). */
  t: TFunction;
  /** Change the language preference (persists via main + updates this store). */
  setLanguage: (pref: LanguagePref) => void;
  /** Adopt a LanguageInfo coming from main (internal). */
  apply: (info: LanguageInfo) => void;
}

export const i18nStore = createStore<I18nState>((set) => ({
  pref: 'system',
  locale: DEFAULT_LOCALE,
  t: makeT(DEFAULT_LOCALE),
  setLanguage: (pref) => {
    void api.setLanguage(pref).then((info) => i18nStore.getState().apply(info));
  },
  apply: (info) => set({ pref: info.pref, locale: info.locale, t: makeT(info.locale) }),
}));

/** Seed the locale from the OS (so the first paint isn't English by default),
 *  then read the real preference from main and keep it in sync. */
export function initI18n(): void {
  i18nStore.getState().apply({ pref: 'system', locale: resolveLocale('system', navigator.language) });
  void api.getLanguage().then((info) => i18nStore.getState().apply(info));
  api.onLanguageChanged((info) => i18nStore.getState().apply(info));
}
