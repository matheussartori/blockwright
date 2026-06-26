import { describe, expect, it } from 'vitest';
import { preserveShell } from '../preserve-shell';
import { resolveBlocks } from '../../ops';
import type { PassContext, ShellLockCell } from '../types';
import type { AuthoringBlock, AuthoringPaletteEntry } from '../../types';

const AIR: AuthoringPaletteEntry = { Name: 'minecraft:air' };
const STONE: AuthoringPaletteEntry = { Name: 'minecraft:stone' };
const PLANKS: AuthoringPaletteEntry = { Name: 'minecraft:oak_planks' };
const BOOKSHELF: AuthoringPaletteEntry = { Name: 'minecraft:bookshelf' };

/** A 2×1×2 stone floor at y=0 — the protected shell deck. */
const floorCells: ShellLockCell[] = [
  { pos: [0, 0, 0], entry: STONE },
  { pos: [1, 0, 0], entry: STONE },
  { pos: [0, 0, 1], entry: STONE },
  { pos: [1, 0, 1], entry: STONE },
];

function ctx(lockCells?: ShellLockCell[]): PassContext {
  return { size: [2, 3, 2], lockCells };
}

describe('preserveShell', () => {
  it('restores a floor the model deleted (left as air)', () => {
    // The model emitted only a block up at y=1 and never laid the ground floor.
    const palette = [AIR, PLANKS];
    const blocks: AuthoringBlock[] = [{ state: 1, pos: [0, 1, 0] }];
    const r = preserveShell(blocks, palette, ctx(floorCells));
    // Every floor cell is now solid stone.
    for (const c of floorCells) {
      const b = r.blocks.find((x) => x.pos[0] === c.pos[0] && x.pos[1] === 0 && x.pos[2] === c.pos[2]);
      expect(b).toBeTruthy();
      expect(r.palette[b!.state].Name).toBe('minecraft:stone');
    }
    expect(r.fixes?.[0]).toMatch(/restored 4 shell block/);
  });

  it('keeps a cell the model redecorated (solid → different solid)', () => {
    // The model replaced one floor cell with planks — that is NOT a deletion, so it stays.
    const palette = [AIR, PLANKS];
    const blocks: AuthoringBlock[] = [{ state: 1, pos: [0, 0, 0] }];
    const r = preserveShell(blocks, palette, ctx(floorCells));
    const redecorated = r.blocks.find((b) => b.pos[0] === 0 && b.pos[1] === 0 && b.pos[2] === 0);
    expect(r.palette[redecorated!.state].Name).toBe('minecraft:oak_planks'); // kept
    // The other three deleted cells are restored.
    expect(r.fixes?.[0]).toMatch(/restored 3 shell block/);
  });

  it('restores a shell cell the model plugged with interior furniture (bookshelf)', () => {
    // The model walled a protected floor cell with a bookshelf — that is interior
    // furniture, never legitimate exterior skin, so it is restored to the shell block.
    const palette = [AIR, BOOKSHELF];
    const blocks: AuthoringBlock[] = [{ state: 1, pos: [0, 0, 0] }];
    const r = preserveShell(blocks, palette, ctx(floorCells));
    const restored = r.blocks.find((b) => b.pos[0] === 0 && b.pos[1] === 0 && b.pos[2] === 0);
    expect(r.palette[restored!.state].Name).toBe('minecraft:stone'); // shell restored
    expect(r.fixes?.[0]).toMatch(/interior furniture/);
  });

  it('restores a cell the model explicitly aired out (a hole)', () => {
    const palette = [AIR, PLANKS];
    const blocks: AuthoringBlock[] = [{ state: 0, pos: [0, 0, 0] }]; // explicit air at a floor cell
    const r = preserveShell(blocks, palette, ctx(floorCells));
    const hole = r.blocks.find((b) => b.pos[0] === 0 && b.pos[1] === 0 && b.pos[2] === 0);
    expect(r.palette[hole!.state].Name).toBe('minecraft:stone'); // refilled
  });

  it('is a no-op without lock cells (every other build is untouched)', () => {
    const palette = [AIR, PLANKS];
    const blocks: AuthoringBlock[] = [{ state: 1, pos: [0, 1, 0] }];
    const r = preserveShell(blocks, palette, ctx(undefined));
    expect(r.blocks).toBe(blocks);
    expect(r.fixes ?? []).toHaveLength(0);
  });

  it('skips lock cells outside the build bounds', () => {
    const palette = [AIR];
    const out: ShellLockCell[] = [{ pos: [9, 9, 9], entry: STONE }];
    const r = preserveShell([], palette, ctx(out));
    expect(r.blocks).toHaveLength(0);
  });

  it('restores the gothic shell ground floor when an emit deletes it (the real defect)', () => {
    const W = 20, H = 16, D = 14;
    const resolved = resolveBlocks({
      DataVersion: 3955,
      size: [W, H, D],
      palette: [{ Name: 'minecraft:air' }],
      ops: [{ op: 'template', name: 'gothic', from: [0, 0, 0], to: [W - 1, H - 1, D - 1], params: { decoration: 'gothic', floors: 2 } }],
    });
    const solid = (b: AuthoringBlock, pal: AuthoringPaletteEntry[]) => pal[b.state] && pal[b.state].Name !== 'minecraft:air';
    const lockCells: ShellLockCell[] = resolved.blocks
      .filter((b) => solid(b, resolved.palette))
      .map((b) => ({ pos: b.pos, entry: resolved.palette[b.state] }));
    // Simulate the model gutting the build: drop the entire ground floor (y = 0).
    const gutted = resolved.blocks.filter((b) => b.pos[1] !== 0);
    expect(gutted.filter((b) => b.pos[1] === 0 && solid(b, resolved.palette))).toHaveLength(0);

    const r = preserveShell(gutted, resolved.palette.slice(), { size: [W, H, D], lockCells });
    const ground = r.blocks.filter((b) => b.pos[1] === 0 && solid(b, r.palette)).length;
    expect(ground).toBeGreaterThan(W * D * 0.5); // a real ground-floor deck is back
  });
});
