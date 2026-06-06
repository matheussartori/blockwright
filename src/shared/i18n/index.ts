// Tiny i18n core shared by both processes (the main process uses it for the
// native menu/dialogs; the renderer for the React UI). No framework, no deps —
// just locale resolution + a `translate` lookup with `{token}` interpolation.
import { en } from './en';
import { ptBR } from './pt-BR';

/** The locales the app actually ships strings for. */
export const SUPPORTED_LOCALES = ['en', 'pt-BR'] as const;
export type Locale = (typeof SUPPORTED_LOCALES)[number];

/** A user's language preference: an explicit locale, or follow the OS. */
export type LanguagePref = 'system' | Locale;

/** The full key space is whatever the English catalog defines. */
export type MessageKey = keyof typeof en;
export type Messages = Record<MessageKey, string>;

export const DEFAULT_LOCALE: Locale = 'en';

const CATALOGS: Record<Locale, Partial<Messages>> = {
  en,
  'pt-BR': ptBR,
};

/** Human-readable name for each locale (shown in the picker, untranslated). */
export const LOCALE_LABELS: Record<Locale, string> = {
  en: 'English',
  'pt-BR': 'Português (Brasil)',
};

/** The current language as known to both processes: the user's preference plus
 *  the concrete locale it resolves to (for `'system'`, what the OS reported). */
export interface LanguageInfo {
  pref: LanguagePref;
  locale: Locale;
}

/** Resolve a preference + the OS locale string (e.g. Electron's `app.getLocale()`
 *  or `navigator.language`) into one of the supported locales. */
export function resolveLocale(pref: LanguagePref, systemLocale: string | undefined): Locale {
  if (pref === 'en' || pref === 'pt-BR') return pref;
  const lc = (systemLocale ?? '').toLowerCase();
  if (lc.startsWith('pt')) return 'pt-BR';
  return DEFAULT_LOCALE;
}

/** Look up a message, falling back English → key, and interpolating `{token}`s. */
export function translate(
  locale: Locale,
  key: MessageKey,
  params?: Record<string, string | number>,
): string {
  let msg = CATALOGS[locale]?.[key] ?? en[key] ?? key;
  if (params) {
    for (const [token, value] of Object.entries(params)) {
      msg = msg.split(`{${token}}`).join(String(value));
    }
  }
  return msg;
}

export type TFunction = (key: MessageKey, params?: Record<string, string | number>) => string;

/** Bind `translate` to a locale → the `t(key, params?)` used everywhere. */
export function makeT(locale: Locale): TFunction {
  return (key, params) => translate(locale, key, params);
}
