// The tower keep OWNS its crown — and therefore its ROOF ACCESS. The stair core only links
// the interior storeys, so the type lays a dedicated hatch ladder up THROUGH the walkable
// deck. This guards that a way onto the crown always exists (even a single-storey keep) and
// survives the compile pipeline (the fix-circulation pass used to drop it as an
// "attic ladder to nowhere" on a big-yard build, where the ceiling heuristic collapses).
import { describe, expect, it } from 'vitest';
import { compileStructureReport } from '../../../authoring/compile';
import type { AuthoringBlock, AuthoringPaletteEntry } from '../../../authoring/types';

function compileTower(size: [number, number, number], floors: number, surroundings = 'none') {
  const corner: [number, number, number] = [size[0] - 1, size[1] - 1, size[2] - 1];
  const { report } = compileStructureReport(
    {
      DataVersion: 3955,
      size,
      palette: [{ Name: 'minecraft:air' }],
      ops: [{ op: 'template', name: 'tower-classic', from: [0, 0, 0], to: corner, params: { decoration: 'castle', surroundings, floors } }],
    },
    { structureType: 'tower-classic' },
  );
  return report;
}

/** The highest y that carries the keep's solid roof deck. Restricted to the UPPER part of
 *  the build so a surroundings yard's huge ground plane (which dwarfs the keep footprint)
 *  can't be mistaken for the deck. */
function deckY(blocks: AuthoringBlock[], palette: AuthoringPaletteEntry[]): number {
  const isAir = (s: number) => /:air$/.test(palette[s]?.Name ?? '');
  const perY = new Map<number, number>();
  let maxY = 0;
  for (const b of blocks) {
    if (isAir(b.state)) continue;
    perY.set(b.pos[1], (perY.get(b.pos[1]) ?? 0) + 1);
    if (b.pos[1] > maxY) maxY = b.pos[1];
  }
  const yMin = maxY * 0.25; // above the ground/yard plane
  let upperMax = 0;
  for (const [y, c] of perY) if (y >= yMin && c > upperMax) upperMax = c;
  let top = -Infinity;
  for (const [y, c] of perY) if (y >= yMin && c >= 0.4 * upperMax && y > top) top = y;
  return top;
}

/** Every ladder column (x,z → sorted ys). */
function ladderColumns(blocks: AuthoringBlock[], palette: AuthoringPaletteEntry[]): Map<string, number[]> {
  const cols = new Map<string, number[]>();
  for (const b of blocks) {
    if (!/ladder/.test(palette[b.state]?.Name ?? '')) continue;
    const k = `${b.pos[0]},${b.pos[2]}`;
    if (!cols.has(k)) cols.set(k, []);
    cols.get(k)!.push(b.pos[1]);
  }
  for (const ys of cols.values()) ys.sort((a, b) => a - b);
  return cols;
}

describe('tower-classic roof access', () => {
  for (const [label, size, floors, surroundings] of [
    ['a multi-storey keep', [11, 26, 11], 3, 'none'],
    ['a single-storey keep', [9, 14, 9], 1, 'none'],
    ['a keep inside a (large-yard) modern plot', [55, 40, 55], 3, 'modern'],
  ] as const) {
    it(`gives ${label} a ladder reaching the walkable deck`, () => {
      const r = compileTower(size as [number, number, number], floors, surroundings);
      const dy = deckY(r.blocks, r.palette);
      const cols = ladderColumns(r.blocks, r.palette);
      // Some ladder column tops out exactly at the deck plane (climbs onto the crown).
      const reaches = [...cols.values()].find((ys) => ys[ys.length - 1] === dy);
      expect(reaches, `a ladder must reach the deck at y=${dy} (cols: ${[...cols.keys()].join(' ')})`).toBeTruthy();
      // …and it is a continuous run (no gaps) from the top storey up through the deck.
      const top = reaches!;
      for (let i = 1; i < top.length; i++) expect(top[i]).toBe(top[i - 1] + 1);
      expect(top.length).toBeGreaterThanOrEqual(2);
    });
  }
});
