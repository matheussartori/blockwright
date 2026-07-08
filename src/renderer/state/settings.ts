// User preferences, owned entirely by the renderer and persisted to
// localStorage (no IPC — the only thing main does is ask us to open the panel).
// Kept separate from the main `store` (which mirrors main-owned state) since
// these are durable, renderer-local knobs. Uses Zustand's vanilla store to
// match the rest of the renderer.
import { createStore } from 'zustand/vanilla';
import { DEFAULT_NBT_SIZE_PREF, type NbtSizePref } from '@/shared/domain/split';
import type { MaterialsFormat } from '@/shared/types';
import { isThemePref, type ThemePref } from './themes';

export type { ThemePref } from './themes';

/** Overlay palette for the viewer's marks (diff/void/selection/waypoints):
 *  the default hues or a colorblind-safe set (see viewer/overlay-colors.ts). */
export type OverlayScheme = 'default' | 'colorblind';
/** How much the world cursor readout names: coords only, +block, +block+biome. */
export type CursorReadout = 'coords' | 'block' | 'biome';
/** What happens to unsaved block-editor changes on tab close / quit. */
export type UnsavedEditGuard = 'warn' | 'save' | 'discard';
/** "Export As…" default format (orders the save dialog's filters). */
export type ExportFormatPref = 'nbt' | 'schem' | 'litematic';

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
  /** World-editing master switch (Settings ▸ World). OFF by default — worlds open read-only
   *  until the user opts in; the deliberate safety latch of the v2.2 write path. */
  worldEditing: boolean;
  /** Backup sets kept per world (the enforced pre-save backups are NOT optional — only this
   *  retention is). 0 = keep all. */
  worldBackupRetention: number;
  /** Total backup size cap per world in MB (oldest sets pruned past it). 0 = no cap. */
  worldBackupSizeCapMb: number;
  /** Default render distance (chunks) a world opens with. */
  worldRenderDistance: number;
  /** Resident chunk cap for the world scene's LRU (the "never OOM" budget). */
  worldChunkCap: number;
  /** Mesh worker threads for world chunks. 0 = auto (cores − 2, clamped). */
  worldMeshWorkers: number;
  /** Dimension a world opens in: the last one used for it, or always the overworld. */
  worldDefaultDimension: 'last' | 'overworld';
  /** Overlay color scheme for the viewer marks (default / colorblind-safe). */
  overlayScheme: OverlayScheme;
  /** Remember the Y-slice level per world/structure (restored on reopen). */
  ySliceRemember: boolean;
  /** World cursor readout verbosity (coords / +block / +biome). */
  cursorReadout: CursorReadout;
  /** Tool the block editor starts on when entering edit mode. */
  editorDefaultTool: 'select' | 'paint';
  /** Whether paint/void strokes lock to the face's plane by default. */
  editorPlaneLock: boolean;
  /** Keep the symmetry setting across editing sessions (else reset to off). */
  editorSymmetryPersist: boolean;
  /** Undo snapshot stack cap (big builds trade memory for history). */
  editorUndoDepth: number;
  /** Unsaved-edit guard on tab close / app quit: warn, auto-save a version, or discard. */
  editorUnsavedGuard: UnsavedEditGuard;
  /** Max size (px) of the AI self-review screenshots (the token/quality lever). */
  aiReviewImageSize: number;
  /** Default format for "Export As…" (orders the dialog's filters). */
  defaultExportFormat: ExportFormatPref;
  /** Default material-list export format (orders the dialog's filters). */
  materialsFormat: MaterialsFormat;
  /** Reopen the last session's tabs + world on launch. */
  reopenSession: boolean;
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
  worldEditing: false,
  worldBackupRetention: 10,
  worldBackupSizeCapMb: 0,
  worldRenderDistance: 10,
  worldChunkCap: 1400,
  worldMeshWorkers: 0,
  worldDefaultDimension: 'last',
  overlayScheme: 'default',
  ySliceRemember: true,
  cursorReadout: 'biome',
  editorDefaultTool: 'select',
  editorPlaneLock: true,
  editorSymmetryPersist: false,
  editorUndoDepth: 60,
  editorUnsavedGuard: 'warn',
  aiReviewImageSize: 512,
  defaultExportFormat: 'nbt',
  materialsFormat: 'csv',
  reopenSession: false,
};

const STORAGE_KEY = 'blockwright.settings';

/** Load persisted settings, merged over defaults so new keys are picked up. */
function load(): Settings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...SETTINGS_DEFAULTS };
    const merged = { ...SETTINGS_DEFAULTS, ...(JSON.parse(raw) as Partial<Settings>) };
    // A stored theme id that no longer exists would leave `data-theme` pointing
    // at no CSS block (base dark tokens) — fall back to system instead.
    if (!isThemePref(merged.theme)) merged.theme = 'system';
    return merged;
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
    worldEditing: s.worldEditing,
    worldBackupRetention: s.worldBackupRetention,
    worldBackupSizeCapMb: s.worldBackupSizeCapMb,
    worldRenderDistance: s.worldRenderDistance,
    worldChunkCap: s.worldChunkCap,
    worldMeshWorkers: s.worldMeshWorkers,
    worldDefaultDimension: s.worldDefaultDimension,
    overlayScheme: s.overlayScheme,
    ySliceRemember: s.ySliceRemember,
    cursorReadout: s.cursorReadout,
    editorDefaultTool: s.editorDefaultTool,
    editorPlaneLock: s.editorPlaneLock,
    editorSymmetryPersist: s.editorSymmetryPersist,
    editorUndoDepth: s.editorUndoDepth,
    editorUnsavedGuard: s.editorUnsavedGuard,
    aiReviewImageSize: s.aiReviewImageSize,
    defaultExportFormat: s.defaultExportFormat,
    materialsFormat: s.materialsFormat,
    reopenSession: s.reopenSession,
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
