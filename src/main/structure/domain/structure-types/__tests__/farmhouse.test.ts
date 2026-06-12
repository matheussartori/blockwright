// The farmhouse veranda's facade contract: the front colonnade is a REGULAR rhythm —
// no doubled posts, no 1-wide sliver bays (the "blocos de madeira à toa" defect) — and
// the ground windows sit centred in the open bays, never hidden behind a post.
import { describe, expect, it } from 'vitest';
import { resolveBlocks } from '../../../authoring/ops';
import type { AuthoringStructure } from '../../../authoring/types';

const PILLAR = 'minecraft:stripped_dark_oak_log';

function grid(size: [number, number, number], params: Record<string, unknown>) {
  const authoring: AuthoringStructure = {
    DataVersion: 3955,
    size,
    palette: [{ Name: 'minecraft:air' }],
    ops: [{ op: 'template', name: 'farmhouse', from: [0, 0, 0], to: [size[0] - 1, size[1] - 1, size[2] - 1], params }],
  };
  const resolved = resolveBlocks(authoring);
  const cells = new Map<string, string>();
  for (const b of resolved.blocks) cells.set(b.pos.join(','), resolved.palette[b.state]?.Name ?? '');
  return (x: number, y: number, z: number) => cells.get(`${x},${y},${z}`) ?? 'minecraft:air';
}

/** Colonnade x positions on the front plane: columns with the pillar block at ≥4 heights
 *  (rails/lintel share the block but only touch a column at 1–2 heights). */
function postColumns(at: ReturnType<typeof grid>, xMax: number, H: number): number[] {
  const posts: number[] = [];
  for (let x = 0; x <= xMax; x++) {
    let runs = 0;
    for (let y = 0; y < H; y++) if (at(x, y, 0) === PILLAR) runs++;
    if (runs >= 4) posts.push(x);
  }
  return posts;
}

describe('farmhouse front veranda', () => {
  // 22×21×11, floors 2, hip + cellar (the reported build): main wing x0..13, cx=6,
  // house base above the cellar vault at y4, ground storey y5..8 (see plan() math).
  const at = grid([22, 21, 11], { decoration: 'farmhouse', floors: 2, roof: 'hip', basement: 'cellar' });
  const posts = postColumns(at, 13, 21);

  it('lays a regular colonnade: every bay 2-4 cells, no doubled posts', () => {
    expect(posts.length).toBeGreaterThanOrEqual(4); // corners + portal jambs at least
    expect(posts[0]).toBe(0); // the host corner posts are the colonnade ends
    expect(posts[posts.length - 1]).toBe(13);
    for (let i = 0; i + 1 < posts.length; i++) {
      const bay = posts[i + 1] - posts[i] - 1;
      expect(bay, `bay after post x=${posts[i]}`).toBeGreaterThanOrEqual(2);
      expect(bay, `bay after post x=${posts[i]}`).toBeLessThanOrEqual(4);
    }
  });

  it('centres the ground windows in open bays, never behind a post', () => {
    const winXs: number[] = [];
    for (let x = 1; x < 13; x++) if (at(x, 5, 2).includes('pane')) winXs.push(x);
    expect(winXs.length).toBeGreaterThanOrEqual(2); // one per side bay
    for (const wx of winXs) expect(posts, `window at x=${wx} blocked by a post`).not.toContain(wx);
  });

  it('keeps the entry bay clear: an open portal in front of the door', () => {
    expect(at(6, 5, 2)).toBe('minecraft:oak_door');
    expect(at(6, 5, 0)).toBe('minecraft:air'); // the portal bay (rails skip it)
    expect(at(6, 5, 1)).toBe('minecraft:air'); // the porch cell before the door
  });
});
