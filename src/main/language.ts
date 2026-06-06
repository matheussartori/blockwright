// The app's language preference, owned by the main process so the native menu
// (built in main) can be localized at startup without waiting on the renderer.
// Persisted as JSON in userData; resolves `'system'` against Electron's
// `app.getLocale()`. The renderer mirrors this over IPC (see `state/i18n.ts`).
import { app } from 'electron';
import fs from 'node:fs';
import path from 'node:path';
import {
  type LanguageInfo,
  type LanguagePref,
  type Locale,
  type MessageKey,
  makeT,
  resolveLocale,
} from '@/shared/i18n';

let pref: LanguagePref | null = null;

function storeFile(): string {
  return path.join(app.getPath('userData'), 'language.json');
}

function load(): LanguagePref {
  if (pref) return pref;
  let loaded: LanguagePref = 'system';
  try {
    const data = JSON.parse(fs.readFileSync(storeFile(), 'utf8'));
    if (data?.pref === 'en' || data?.pref === 'pt-BR') loaded = data.pref;
  } catch {
    /* no stored preference yet — fall back to following the OS */
  }
  pref = loaded;
  return loaded;
}

/** The current preference + the concrete locale it resolves to right now. */
export function getLanguage(): LanguageInfo {
  const p = load();
  return { pref: p, locale: resolveLocale(p, app.getLocale()) };
}

/** Persist a new preference and return the resolved language info. */
export function setLanguage(next: LanguagePref): LanguageInfo {
  pref = next;
  try {
    fs.writeFileSync(storeFile(), JSON.stringify({ pref: next }, null, 2));
  } catch {
    // Best-effort: a failed write just means the choice won't survive a restart.
  }
  return getLanguage();
}

/** The locale to render main-process strings (menu/dialogs) in right now. */
export function currentLocale(): Locale {
  return getLanguage().locale;
}

/** A `t(key, params?)` bound to the current locale, for main-process strings. */
export function mt(key: MessageKey, params?: Record<string, string | number>): string {
  return makeT(currentLocale())(key, params);
}
