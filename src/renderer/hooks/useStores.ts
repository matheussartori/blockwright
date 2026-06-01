// Thin React bindings over the framework-agnostic vanilla Zustand stores, so
// components subscribe to just the slice they render.
import { useStore } from 'zustand';
import { store, type AppState } from '../state/store';
import { settingsStore, type SettingsState } from '../state/settings';
import { windowsStore, type WindowsStore } from '../state/windows';

export function useApp<T>(selector: (s: AppState) => T): T {
  return useStore(store, selector);
}

export function useSettings<T>(selector: (s: SettingsState) => T): T {
  return useStore(settingsStore, selector);
}

export function useWindows<T>(selector: (s: WindowsStore) => T): T {
  return useStore(windowsStore, selector);
}
