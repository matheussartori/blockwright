// Palette helpers: stable dedupe keys, the get-or-create "intern" factory used by
// op expansion and the connection pass, and the air/id name predicates.
import type { AuthoringPaletteEntry } from './types';

/** Strip the namespace from a block name (`minecraft:oak_stairs` → `oak_stairs`). */
export function bareId(name: string): string {
  return name.includes(':') ? name.slice(name.indexOf(':') + 1) : name;
}

/** Air block names that are placeholders, not geometry — omitted from output so
 *  ops can write them to carve holes (and stray air in `blocks` is harmless). */
export function isAir(name: string): boolean {
  const id = bareId(name);
  return id === 'air' || id === 'cave_air' || id === 'void_air';
}

/** Stable key for palette dedupe: name + sorted props. */
export function paletteKey(entry: AuthoringPaletteEntry): string {
  const props = entry.Properties ?? {};
  const parts = Object.keys(props).sort().map((k) => `${k}=${String(props[k])}`);
  return `${entry.Name}|${parts.join(',')}`;
}

/** A find-or-append accessor over a palette: returns the index of an entry with a
 *  matching (name, props) combo, appending it (mutating `palette`) if new. */
export type Intern = (entry: AuthoringPaletteEntry) => number;

/** Build an Intern bound to `palette` (which it mutates as new entries are appended). */
export function makeIntern(palette: AuthoringPaletteEntry[]): Intern {
  const index = new Map<string, number>();
  palette.forEach((p, i) => index.set(paletteKey(p), i));
  return (entry: AuthoringPaletteEntry): number => {
    const key = paletteKey(entry);
    const hit = index.get(key);
    if (hit !== undefined) return hit;
    const i = palette.push(entry) - 1;
    index.set(key, i);
    return i;
  };
}
