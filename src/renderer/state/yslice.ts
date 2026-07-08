// Per-document Y-slice memory (Settings ▸ Viewer ▸ "Remember Y-slice"): the world
// viewer's slice level and the structure viewer's isolated storey, keyed by world
// root / structure path in localStorage. Capped so the map can't grow unbounded.
const STORAGE_KEY = 'blockwright.yslice';
const CAP = 200;

interface SliceMemory {
  /** World Y-slice level (blocks), when one was active. */
  y?: number;
  /** Isolated storey index (structure viewer), when one was active. */
  storey?: number;
}

function load(): Record<string, SliceMemory> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as Record<string, SliceMemory>) : {};
  } catch {
    return {};
  }
}

function save(map: Record<string, SliceMemory>): void {
  try {
    const keys = Object.keys(map);
    // Drop oldest-inserted entries past the cap (object key order is insertion order).
    for (const k of keys.slice(0, Math.max(0, keys.length - CAP))) delete map[k];
    localStorage.setItem(STORAGE_KEY, JSON.stringify(map));
  } catch {
    // storage unavailable — the slice just won't be remembered
  }
}

export function recallSlice(key: string): SliceMemory | null {
  return load()[key] ?? null;
}

/** Remember (or forget, with null values) a document's slice. */
export function rememberSlice(key: string, memory: SliceMemory | null): void {
  const map = load();
  if (!memory || (memory.y === undefined && memory.storey === undefined)) delete map[key];
  else {
    delete map[key]; // re-insert at the end (freshest — survives the cap longest)
    map[key] = memory;
  }
  save(map);
}
