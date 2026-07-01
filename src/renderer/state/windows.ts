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
export type PanelId = 'inspector' | 'jigsaw' | 'generate' | 'versions';

export interface WindowState {
  visible: boolean;
  /** false = docked in the sidebar as a tab; true = torn off as a window. */
  floating: boolean;
  minimized: boolean;
  /** Top-left position within the stage — used only while floating. */
  x: number;
  y: number;
}

/** Width of a panel when floating (matches the docked sidebar width in CSS).
 *  `console` is a full-width bottom dock, so its width is unused (0). */
export const WINDOW_WIDTHS: Record<WindowId, number> = {
  controls: 200,
  inspector: 288,
  jigsaw: 288,
  generate: 380,
  versions: 240,
  console: 0,
  project: 0, // left dock — width comes from `leftWidth`, never floats
};

/** Default / minimum height of the bottom Console dock (px), persisted + resizable. */
export const DEFAULT_CONSOLE_H = 240;
export const MIN_CONSOLE_H = 120;

/** The left activity rail's fixed width (px) — keep in sync with --rail-w in CSS. */
export const RAIL_W = 46;
/** Width bounds for the two resizable side panels (Project / inspector dock). */
export const LEFT_PANEL = { default: 248, min: 200, max: 420 };
export const RIGHT_PANEL = { default: 360, min: 300, max: 560 };

const TITLEBAR_H = 36; // the single slim top bar (see .tabbar)
const STATUS_H = 30;
const MARGIN = 12;
/** Approximate jigsaw height, only used to seed its floating home position. */
const JIGSAW_H = 360;

const STORAGE_KEY = 'blockwright.windows';

/** Current stage rect in px (window minus the titlebar, status bar, and the
 *  left chrome — activity rail + the Project panel when it's open). */
function stageSize(): { w: number; h: number } {
  let chrome = RAIL_W;
  try {
    // The store is declared below; during module init (defaults()) it doesn't
    // exist yet — fall back to the rail alone.
    const s = windowsStore.getState();
    if (s.projectVisible) chrome += s.leftWidth;
  } catch {
    /* module still initializing */
  }
  return {
    w: Math.max(0, window.innerWidth - chrome),
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
    case 'versions':
      return {
        x: Math.max(MARGIN, w - WINDOW_WIDTHS.inspector - WINDOW_WIDTHS.versions - MARGIN * 2),
        y: MARGIN,
      };
    case 'console':
    case 'project':
      // Docked surfaces (bottom dock / left panel) — position is unused.
      return { x: MARGIN, y: MARGIN };
  }
}

function freshWindow(id: WindowId): WindowState {
  return { visible: true, floating: false, minimized: false, ...homePosition(id) };
}

/** Whether a floating panel at (x,y) still has at least its title bar on the
 *  visible stage. A panel whose persisted position is now off-screen (smaller
 *  window than last time, external monitor gone) would toggle "visible" yet show
 *  nothing — we use this to snap it home when it's opened. */
function onStage(x: number, y: number): boolean {
  const { w, h } = stageSize();
  return x >= 0 && y >= 0 && x <= Math.max(0, w - 40) && y <= Math.max(0, h - 24);
}

interface WindowsLayout {
  controls: WindowState;
  inspector: WindowState;
  jigsaw: WindowState;
  generate: WindowState;
  versions: WindowState;
  /** The bottom Console dock — like `controls`, only its `.visible` matters. */
  console: WindowState;
  /** Which docked panel's tab is active. */
  activeTab: PanelId;
  /** When true the docked sidebar is collapsed to a thin rail. */
  sidebarCollapsed: boolean;
  /** Height of the bottom Console dock in px (resizable, persisted). */
  consoleHeight: number;
  /** Whether the left Project panel (workspace / recents explorer) is open. */
  projectVisible: boolean;
  /** Width of the left Project panel in px (resizable, persisted). */
  leftWidth: number;
  /** Width of the right inspector dock in px (resizable, persisted). */
  rightWidth: number;
}

function defaults(): WindowsLayout {
  return {
    controls: { ...freshWindow('controls'), visible: false },
    inspector: freshWindow('inspector'),
    jigsaw: freshWindow('jigsaw'),
    // Generate starts hidden and floating: it's opened on demand (File ▸ New
    // Structure / View ▸ Generate) as a movable window the user can dock right.
    generate: { ...freshWindow('generate'), visible: false, floating: true },
    // Versions docks as a sidebar tab and (like inspector/jigsaw) shows itself
    // whenever it's available — i.e. once the tab has a generated build.
    versions: freshWindow('versions'),
    // Console starts hidden; opened on demand from View ▸ Console.
    console: { ...freshWindow('console'), visible: false },
    activeTab: 'inspector',
    sidebarCollapsed: false,
    consoleHeight: DEFAULT_CONSOLE_H,
    projectVisible: true,
    leftWidth: LEFT_PANEL.default,
    rightWidth: RIGHT_PANEL.default,
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
    for (const id of ['inspector', 'jigsaw', 'versions'] as const) {
      base[id] = { ...base[id], ...saved[id] };
    }
    // Generate persists like the other panels: its visibility/float/position/
    // minimized are all restored, so leaving it open re-opens it next launch.
    base.generate = { ...base.generate, ...saved.generate };
    // Console persists its open state + height across launches.
    base.console = { ...base.console, ...saved.console };
    if (typeof saved.consoleHeight === 'number') {
      base.consoleHeight = Math.max(MIN_CONSOLE_H, saved.consoleHeight);
    }
    if (
      saved.activeTab === 'inspector' ||
      saved.activeTab === 'jigsaw' ||
      saved.activeTab === 'generate' ||
      saved.activeTab === 'versions'
    ) {
      base.activeTab = saved.activeTab;
    }
    if (typeof saved.sidebarCollapsed === 'boolean') base.sidebarCollapsed = saved.sidebarCollapsed;
    if (typeof saved.projectVisible === 'boolean') base.projectVisible = saved.projectVisible;
    if (typeof saved.leftWidth === 'number') {
      base.leftWidth = Math.min(LEFT_PANEL.max, Math.max(LEFT_PANEL.min, saved.leftWidth));
    }
    if (typeof saved.rightWidth === 'number') {
      base.rightWidth = Math.min(RIGHT_PANEL.max, Math.max(RIGHT_PANEL.min, saved.rightWidth));
    }
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
  /** Set the bottom Console dock's height (clamped to the minimum). */
  setConsoleHeight: (height: number) => void;
  /** Show/hide the left Project panel (the activity rail's Files toggle). */
  setProjectVisible: (visible: boolean) => void;
  /** Resize the left Project panel (clamped to LEFT_PANEL bounds). */
  setLeftWidth: (width: number) => void;
  /** Resize the right inspector dock (clamped to RIGHT_PANEL bounds). */
  setRightWidth: (width: number) => void;
  /** Re-dock every panel, re-show the sidebar, and reset floating positions. */
  resetAll: () => void;
}

export const windowsStore = createStore<WindowsStore>((set) => ({
  ...load(),
  setPos: (id, x, y) => {
    if (id === 'project') return; // docked-only, never positioned
    set((s) => ({ [id]: { ...s[id], x, y } }) as Partial<WindowsStore>);
  },
  toggleMinimized: (id) => {
    if (id === 'project') return;
    set((s) => ({ [id]: { ...s[id], minimized: !s[id].minimized } }) as Partial<WindowsStore>);
  },
  setVisible: (id, visible) => {
    // `project` carries visibility only (like the View menu expects); it lives
    // in its own flat flag rather than a WindowState.
    if (id === 'project') return set({ projectVisible: visible });
    set((s) => ({ [id]: { ...s[id], visible } }) as Partial<WindowsStore>);
  },
  openPanel: (id) =>
    set((s) => {
      const cur = s[id];
      // Rescue a floating panel whose persisted position is now off-screen, so
      // opening it (e.g. View ▸ Generate) always actually reveals it.
      const reposition = cur.floating && !onStage(cur.x, cur.y) ? homePosition(id) : null;
      return {
        [id]: { ...cur, visible: true, minimized: false, ...(reposition ?? {}) },
        ...(cur.floating ? {} : { activeTab: id, sidebarCollapsed: false }),
      } as Partial<WindowsStore>;
    }),
  setFloating: (id, floating) =>
    set((s) => ({
      [id]: { ...s[id], floating, ...(floating ? homePosition(id) : {}) },
    }) as Partial<WindowsStore>),
  setActiveTab: (id) => set({ activeTab: id }),
  setSidebarCollapsed: (collapsed) => set({ sidebarCollapsed: collapsed }),
  setConsoleHeight: (height) => set({ consoleHeight: Math.max(MIN_CONSOLE_H, height) }),
  setProjectVisible: (projectVisible) => set({ projectVisible }),
  setLeftWidth: (width) =>
    set({ leftWidth: Math.min(LEFT_PANEL.max, Math.max(LEFT_PANEL.min, width)) }),
  setRightWidth: (width) =>
    set({ rightWidth: Math.min(RIGHT_PANEL.max, Math.max(RIGHT_PANEL.min, width)) }),
  resetAll: () => set(defaults()),
}));

function snapshot(s: WindowsStore): WindowsLayout {
  return {
    controls: s.controls,
    inspector: s.inspector,
    jigsaw: s.jigsaw,
    generate: s.generate,
    versions: s.versions,
    console: s.console,
    activeTab: s.activeTab,
    sidebarCollapsed: s.sidebarCollapsed,
    consoleHeight: s.consoleHeight,
    projectVisible: s.projectVisible,
    leftWidth: s.leftWidth,
    rightWidth: s.rightWidth,
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
