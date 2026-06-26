// User preferences, owned entirely by the renderer and persisted to
// localStorage (no IPC — the only thing main does is ask us to open the panel).
// Kept separate from the main `store` (which mirrors main-owned state) since
// these are durable, renderer-local knobs. Uses Zustand's vanilla store to
// match the rest of the renderer.
import { createStore } from 'zustand/vanilla';
import { DEFAULT_NBT_SIZE_PREF, type NbtSizePref } from '@/shared/domain/split';

/** Color theme: follow the OS, or force light/dark. */
export type ThemePref = 'system' | 'light' | 'dark';

export interface Settings {
  /** Color theme. `system` follows the OS appearance (the default). */
  theme: ThemePref;
  /** Mouse-look multiplier in fly mode. */
  lookSensitivity: number;
  /** Invert the vertical look axis in fly mode. */
  invertY: boolean;
  /** Show the ground grid in the viewer. */
  showGrid: boolean;
  /** Render jigsaw blocks. Off by default — they're worldgen markers, not real
   *  geometry (vanilla replaces each with its `final_state` during generation). */
  showJigsaw: boolean;
  /** Hide each piece's outer shell — the blocks on the boundary of its occupied
   *  bounding box — so you can see inside enclosed pieces / a jigsaw assembly. */
  hideShell: boolean;
  /** Show each block's actual texture (not a flat color swatch) as its icon in
   *  the Info block list. On by default — textures are easier to recognize. */
  blockTextureIcons: boolean;
  /** The Structure Block size limit a `.nbt` must fit, or it won't load in-game.
   *  Above it, export cuts the structure into a jigsaw assembly. `auto` derives the
   *  limit from the workspace's Minecraft version (≥1.16 → 48, older → 32). */
  nbtSizeLimit: NbtSizePref;
}

export const SETTINGS_DEFAULTS: Settings = {
  theme: 'system',
  lookSensitivity: 1,
  invertY: false,
  showGrid: true,
  showJigsaw: false,
  hideShell: false,
  blockTextureIcons: true,
  nbtSizeLimit: DEFAULT_NBT_SIZE_PREF,
};

const STORAGE_KEY = 'blockwright.settings';

/** Load persisted settings, merged over defaults so new keys are picked up. */
function load(): Settings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...SETTINGS_DEFAULTS };
    return { ...SETTINGS_DEFAULTS, ...(JSON.parse(raw) as Partial<Settings>) };
  } catch {
    return { ...SETTINGS_DEFAULTS };
  }
}

export interface SettingsState extends Settings {
  /** Update one setting. */
  set: <K extends keyof Settings>(key: K, value: Settings[K]) => void;
  /** Restore every setting to its default. */
  reset: () => void;
}

export const settingsStore = createStore<SettingsState>((set) => ({
  ...load(),
  set: (key, value) => set({ [key]: value } as Partial<SettingsState>),
  reset: () => set({ ...SETTINGS_DEFAULTS }),
}));

/** Snapshot of just the persisted slice (drops the action methods). */
function snapshot(s: SettingsState): Settings {
  return {
    theme: s.theme,
    lookSensitivity: s.lookSensitivity,
    invertY: s.invertY,
    showGrid: s.showGrid,
    showJigsaw: s.showJigsaw,
    hideShell: s.hideShell,
    blockTextureIcons: s.blockTextureIcons,
    nbtSizeLimit: s.nbtSizeLimit,
  };
}

// Persist on every change.
settingsStore.subscribe((state) => {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(snapshot(state)));
  } catch {
    /* storage unavailable — keep running with in-memory settings */
  }
});

/** Subscribe to the persisted settings, invoking `run` immediately and on change. */
export function watchSettings(run: (settings: Settings) => void): () => void {
  run(snapshot(settingsStore.getState()));
  return settingsStore.subscribe((state) => run(snapshot(state)));
}
