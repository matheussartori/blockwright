// Layout state for the standardized floating windows (Controls / Inspector /
// Jigsaw). The renderer owns this — it persists to localStorage (like
// `settings.ts`) and reports visibility/availability to main so the View menu's
// checkmarks track it. Positions are stage-local (top-left origin), in px.
import { createStore } from 'zustand/vanilla';
import type { WindowId } from '@/shared/types';

export interface WindowState {
  visible: boolean;
  minimized: boolean;
  /** Top-left position within the stage (the area between titlebar and statusbar). */
  x: number;
  y: number;
}

export type WindowsState = Record<WindowId, WindowState>;

/** Default widths — shared by the home-position math and the window chrome so a
 *  freshly-reset window sits flush in its corner. */
export const WINDOW_WIDTHS: Record<WindowId, number> = {
  controls: 200,
  inspector: 264,
  jigsaw: 288,
};

const TITLEBAR_H = 52;
const STATUS_H = 30;
const MARGIN = 12;
/** Approximate jigsaw height, only used to seed its bottom-right home position. */
const JIGSAW_H = 360;

const STORAGE_KEY = 'blockwright.windows';

/** Current stage rect in px (window minus the titlebar and status bar). */
function stageSize(): { w: number; h: number } {
  return {
    w: window.innerWidth,
    h: Math.max(0, window.innerHeight - TITLEBAR_H - STATUS_H),
  };
}

/** Each window's home corner, recomputed from the live stage size. */
export function homePosition(id: WindowId): { x: number; y: number } {
  const { w, h } = stageSize();
  switch (id) {
    case 'controls':
      return { x: MARGIN, y: MARGIN };
    case 'inspector':
      return { x: Math.max(MARGIN, w - WINDOW_WIDTHS.inspector - MARGIN), y: MARGIN };
    case 'jigsaw':
      // Sits just left of the inspector column (its original relationship), so
      // the two right-side windows don't overlap at their home positions.
      return {
        x: Math.max(MARGIN, w - WINDOW_WIDTHS.inspector - WINDOW_WIDTHS.jigsaw - MARGIN * 2),
        y: Math.max(MARGIN, h - JIGSAW_H - MARGIN),
      };
  }
}

function freshWindow(id: WindowId): WindowState {
  return { visible: true, minimized: false, ...homePosition(id) };
}

function defaults(): WindowsState {
  return {
    controls: freshWindow('controls'),
    inspector: freshWindow('inspector'),
    jigsaw: freshWindow('jigsaw'),
  };
}

/** Load persisted layout merged over fresh defaults (new keys are picked up). */
function load(): WindowsState {
  const base = defaults();
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return base;
    const saved = JSON.parse(raw) as Partial<Record<WindowId, Partial<WindowState>>>;
    for (const id of Object.keys(base) as WindowId[]) {
      base[id] = { ...base[id], ...saved[id] };
    }
    return base;
  } catch {
    return base;
  }
}

export interface WindowsStore extends WindowsState {
  setPos: (id: WindowId, x: number, y: number) => void;
  toggleMinimized: (id: WindowId) => void;
  setVisible: (id: WindowId, visible: boolean) => void;
  /** Snap every window back to its home position and re-show it. */
  resetAll: () => void;
}

export const windowsStore = createStore<WindowsStore>((set) => ({
  ...load(),
  setPos: (id, x, y) => set((s) => ({ [id]: { ...s[id], x, y } }) as Partial<WindowsStore>),
  toggleMinimized: (id) =>
    set((s) => ({ [id]: { ...s[id], minimized: !s[id].minimized } }) as Partial<WindowsStore>),
  setVisible: (id, visible) =>
    set((s) => ({ [id]: { ...s[id], visible } }) as Partial<WindowsStore>),
  resetAll: () => set(defaults()),
}));

function snapshot(s: WindowsStore): WindowsState {
  return { controls: s.controls, inspector: s.inspector, jigsaw: s.jigsaw };
}

// Persist on every change.
windowsStore.subscribe((state) => {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(snapshot(state)));
  } catch {
    /* storage unavailable — keep running with in-memory layout */
  }
});
