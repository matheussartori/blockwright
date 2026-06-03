// Layout state for the inspector panels (Inspector / Jigsaw) and the keyboard
// shortcuts popover. The renderer owns this — it persists to localStorage (like
// `settings.ts`) and reports visibility/availability to main so the View menu's
// checkmarks track it.
//
// Each panel lives in the docked right sidebar by default (`floating: false`,
// shown as a tab) and can be torn off into a free-floating window
// (`floating: true`) positioned by `x/y`. `controls` is no longer a window — it
// only carries `.visible`, which drives the keyboard-shortcuts popover.
import { createStore } from 'zustand/vanilla';
import type { WindowId } from '@/shared/types';

/** The dockable panels (every WindowId except `controls`). */
export type PanelId = 'inspector' | 'jigsaw' | 'generate';

export interface WindowState {
  visible: boolean;
  /** false = docked in the sidebar as a tab; true = torn off as a window. */
  floating: boolean;
  minimized: boolean;
  /** Top-left position within the stage — used only while floating. */
  x: number;
  y: number;
}

/** Width of a panel when floating (matches the docked sidebar width in CSS). */
export const WINDOW_WIDTHS: Record<WindowId, number> = {
  controls: 200,
  inspector: 288,
  jigsaw: 288,
  generate: 380,
};

const TITLEBAR_H = 52;
const STATUS_H = 30;
const MARGIN = 12;
/** Approximate jigsaw height, only used to seed its floating home position. */
const JIGSAW_H = 360;

const STORAGE_KEY = 'blockwright.windows';

/** Current stage rect in px (window minus the titlebar and status bar). */
function stageSize(): { w: number; h: number } {
  return {
    w: window.innerWidth,
    h: Math.max(0, window.innerHeight - TITLEBAR_H - STATUS_H),
  };
}

/** A panel's home position when floating (recomputed from the live stage). */
export function homePosition(id: WindowId): { x: number; y: number } {
  const { w, h } = stageSize();
  switch (id) {
    case 'controls':
      return { x: MARGIN, y: MARGIN };
    case 'inspector':
      return { x: Math.max(MARGIN, w - WINDOW_WIDTHS.inspector - MARGIN), y: MARGIN };
    case 'jigsaw':
      return {
        x: Math.max(MARGIN, w - WINDOW_WIDTHS.inspector - WINDOW_WIDTHS.jigsaw - MARGIN * 2),
        y: Math.max(MARGIN, h - JIGSAW_H - MARGIN),
      };
    case 'generate':
      return { x: MARGIN, y: MARGIN };
  }
}

function freshWindow(id: WindowId): WindowState {
  return { visible: true, floating: false, minimized: false, ...homePosition(id) };
}

interface WindowsLayout {
  controls: WindowState;
  inspector: WindowState;
  jigsaw: WindowState;
  generate: WindowState;
  /** Which docked panel's tab is active. */
  activeTab: PanelId;
  /** When true the docked sidebar is collapsed to a thin rail. */
  sidebarCollapsed: boolean;
}

function defaults(): WindowsLayout {
  return {
    controls: { ...freshWindow('controls'), visible: false },
    inspector: freshWindow('inspector'),
    jigsaw: freshWindow('jigsaw'),
    // Generate starts hidden and floating: it's opened on demand (File ▸ New
    // Structure / View ▸ Generate) as a movable window the user can dock right.
    generate: { ...freshWindow('generate'), visible: false, floating: true },
    activeTab: 'inspector',
    sidebarCollapsed: false,
  };
}

/** Load persisted layout merged over fresh defaults (new keys are picked up). */
function load(): WindowsLayout {
  const base = defaults();
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return base;
    const saved = JSON.parse(raw) as Partial<WindowsLayout>;
    // `controls` is intentionally NOT restored — the shortcuts popover always
    // starts closed (it's an opt-in help affordance, not a persistent panel).
    for (const id of ['inspector', 'jigsaw'] as const) {
      base[id] = { ...base[id], ...saved[id] };
    }
    // Generate restores its float/position/minimized but always starts hidden —
    // like `controls`, it's an opt-in panel, not a persistent one.
    base.generate = { ...base.generate, ...saved.generate, visible: false };
    if (
      saved.activeTab === 'inspector' ||
      saved.activeTab === 'jigsaw' ||
      saved.activeTab === 'generate'
    ) {
      base.activeTab = saved.activeTab;
    }
    if (typeof saved.sidebarCollapsed === 'boolean') base.sidebarCollapsed = saved.sidebarCollapsed;
    return base;
  } catch {
    return base;
  }
}

export interface WindowsStore extends WindowsLayout {
  setPos: (id: WindowId, x: number, y: number) => void;
  toggleMinimized: (id: WindowId) => void;
  setVisible: (id: WindowId, visible: boolean) => void;
  /** Show a panel and surface it: un-minimize, and if docked make it the active
   *  tab with the sidebar expanded. */
  openPanel: (id: PanelId) => void;
  /** Tear a panel off into a window (true) or snap it back to the dock (false). */
  setFloating: (id: PanelId, floating: boolean) => void;
  setActiveTab: (id: PanelId) => void;
  setSidebarCollapsed: (collapsed: boolean) => void;
  /** Re-dock every panel, re-show the sidebar, and reset floating positions. */
  resetAll: () => void;
}

export const windowsStore = createStore<WindowsStore>((set) => ({
  ...load(),
  setPos: (id, x, y) => set((s) => ({ [id]: { ...s[id], x, y } }) as Partial<WindowsStore>),
  toggleMinimized: (id) =>
    set((s) => ({ [id]: { ...s[id], minimized: !s[id].minimized } }) as Partial<WindowsStore>),
  setVisible: (id, visible) =>
    set((s) => ({ [id]: { ...s[id], visible } }) as Partial<WindowsStore>),
  openPanel: (id) =>
    set((s) => ({
      [id]: { ...s[id], visible: true, minimized: false },
      ...(s[id].floating ? {} : { activeTab: id, sidebarCollapsed: false }),
    }) as Partial<WindowsStore>),
  setFloating: (id, floating) =>
    set((s) => ({
      [id]: { ...s[id], floating, ...(floating ? homePosition(id) : {}) },
    }) as Partial<WindowsStore>),
  setActiveTab: (id) => set({ activeTab: id }),
  setSidebarCollapsed: (collapsed) => set({ sidebarCollapsed: collapsed }),
  resetAll: () => set(defaults()),
}));

function snapshot(s: WindowsStore): WindowsLayout {
  return {
    controls: s.controls,
    inspector: s.inspector,
    jigsaw: s.jigsaw,
    generate: s.generate,
    activeTab: s.activeTab,
    sidebarCollapsed: s.sidebarCollapsed,
  };
}

// Persist on every change.
windowsStore.subscribe((state) => {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(snapshot(state)));
  } catch {
    /* storage unavailable — keep running with in-memory layout */
  }
});
