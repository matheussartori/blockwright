// Thin React bindings over the framework-agnostic vanilla Zustand stores, so
// components subscribe to just the slice they render.
import { useStore } from 'zustand';
import type { Locale, TFunction } from '@/shared/i18n';
import { store, type AppState } from '../state/store';
import { settingsStore, type SettingsState } from '../state/settings';
import { i18nStore, type I18nState } from '../state/i18n';
import { windowsStore, type WindowsStore } from '../state/windows';
import { plannerStore, type PlannerStore } from '../state/planner';
import { editorStore, type EditorState } from '../state/editor';
import { worldEditStore, type WorldEditState } from '../state/world-edit';
import { logsStore, type LogsState } from '../state/logs';
import {
  documentsStore,
  activeDocument,
  type DocumentsState,
  type Document,
} from '../state/documents';

export function useApp<T>(selector: (s: AppState) => T): T {
  return useStore(store, selector);
}

export function useDocuments<T>(selector: (s: DocumentsState) => T): T {
  return useStore(documentsStore, selector);
}

/** The focused document (re-renders when the active tab or its contents change). */
export function useActiveDoc(): Document | null {
  return useStore(documentsStore, activeDocument);
}

export function useSettings<T>(selector: (s: SettingsState) => T): T {
  return useStore(settingsStore, selector);
}

export function useWindows<T>(selector: (s: WindowsStore) => T): T {
  return useStore(windowsStore, selector);
}

export function useLogs<T>(selector: (s: LogsState) => T): T {
  return useStore(logsStore, selector);
}

export function usePlanner<T>(selector: (s: PlannerStore) => T): T {
  return useStore(plannerStore, selector);
}

export function useEditor<T>(selector: (s: EditorState) => T): T {
  return useStore(editorStore, selector);
}

export function useWorldEdit<T>(selector: (s: WorldEditState) => T): T {
  return useStore(worldEditStore, selector);
}

export function useI18n<T>(selector: (s: I18nState) => T): T {
  return useStore(i18nStore, selector);
}

/** The translate function for the current locale (re-renders on language change). */
export function useT(): TFunction {
  return useStore(i18nStore, (s) => s.t);
}

/** The current locale (re-renders on language change) — for localizing registry
 *  data (module/provider labels) via `@/shared/i18n/registry`'s `localizeData`. */
export function useLocale(): Locale {
  return useStore(i18nStore, (s) => s.locale);
}
