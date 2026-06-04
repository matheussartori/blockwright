// Decoration-theme registry. Register a new theme here and it immediately composes
// with every structure type. The default theme is "abandoned" so a bare `template`
// op (no theme param) reproduces the old presets' ruined look.
import { abandoned } from './abandoned';
import { plain } from './plain';
import type { DecorationTheme } from './types';

export type { DecorationTheme } from './types';

const THEMES: Record<string, DecorationTheme> = {
  [abandoned.id]: abandoned,
  [plain.id]: plain,
};

/** The theme used when a `template` op doesn't name one. */
export const DEFAULT_THEME = abandoned.id;

/** Look up a theme by id (undefined if unknown). */
export function getTheme(id: string): DecorationTheme | undefined {
  return THEMES[id];
}

/** Every registered theme id (for validation / UI / prompts). */
export function themeIds(): string[] {
  return Object.keys(THEMES);
}

/** Every theme as `{ id, label }` (for the composer's decoration picker). */
export function listThemes(): { id: string; label: string }[] {
  return Object.values(THEMES).map((t) => ({ id: t.id, label: t.label }));
}
