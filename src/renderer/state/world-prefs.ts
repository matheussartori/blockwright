// Per-world renderer prefs (localStorage): the last dimension viewed, restored on
// reopen when Settings ▸ World's default dimension is "last used". Capped map keyed
// by world root, like the Y-slice memory.
import type { DimensionId } from '@/shared/types';

const STORAGE_KEY = 'blockwright.worldDims';
const CAP = 200;

function load(): Record<string, DimensionId> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as Record<string, DimensionId>) : {};
  } catch {
    return {};
  }
}

export function lastDimension(root: string): DimensionId | null {
  return load()[root] ?? null;
}

export function rememberDimension(root: string, dim: DimensionId): void {
  try {
    const map = load();
    delete map[root]; // re-insert freshest-last so the cap drops the stalest
    map[root] = dim;
    const keys = Object.keys(map);
    for (const k of keys.slice(0, Math.max(0, keys.length - CAP))) delete map[k];
    localStorage.setItem(STORAGE_KEY, JSON.stringify(map));
  } catch {
    // storage unavailable — the dimension just won't be remembered
  }
}
