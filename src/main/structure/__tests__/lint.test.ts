import { describe, expect, it } from 'vitest';
import type { RawStructure } from '../io/raw';
import { lintStructure } from '../lint';

/** A dense 2×2×2 capture: every cell listed, stone by default. */
function dense(overrides: Partial<RawStructure> = {}): RawStructure {
  const blocks: RawStructure['blocks'] = [];
  for (let x = 0; x < 2; x++) for (let y = 0; y < 2; y++) for (let z = 0; z < 2; z++) {
    blocks.push({ state: 0, pos: [x, y, z] });
  }
  return {
    size: [2, 2, 2],
    palette: [{ Name: 'minecraft:stone' }],
    blocks,
    ...overrides,
  };
}

const codes = (findings: { code: string }[]) => findings.map((f) => f.code).sort();

describe('lintStructure', () => {
  it('is clean on a plain dense build', () => {
    expect(lintStructure(dense(), '1.21.1')).toEqual([]);
  });

  it('flags explicit boundary air in a dense capture (with a position to reveal)', () => {
    const s = dense();
    s.palette.push({ Name: 'minecraft:air' });
    s.blocks[0] = { state: 1, pos: [0, 0, 0] }; // boundary cell becomes explicit air
    const findings = lintStructure(s, null);
    expect(codes(findings)).toEqual(['suspect_air']);
    expect(findings[0].pos).toEqual([0, 0, 0]);
    expect(findings[0].detail).toBe('1');
  });

  it('does not flag air in a sparse structure (the honest empty space around a shape)', () => {
    const s = dense();
    s.palette.push({ Name: 'minecraft:air' });
    s.blocks = [
      { state: 0, pos: [0, 0, 0] },
      { state: 1, pos: [1, 1, 1] },
    ]; // 2 cells of 8 listed — sparse
    expect(lintStructure(s, null)).toEqual([]);
  });

  it('flags blocks the target version does not know, with the curated stand-in', () => {
    const s = dense({
      palette: [{ Name: 'minecraft:tuff_stairs', Properties: { facing: 'north' } }],
    });
    const findings = lintStructure(s, '1.20.4');
    expect(codes(findings)).toEqual(['block_out_of_range']);
    expect(findings[0].detail).toBe('minecraft:tuff_stairs → minecraft:andesite_stairs');
    // The same file is clean against a version that knows the block.
    expect(lintStructure(s, '1.21.1')).toEqual([]);
  });

  it('flags palette entries no block references', () => {
    const s = dense();
    s.palette.push({ Name: 'minecraft:diamond_block' });
    const findings = lintStructure(s, null);
    expect(codes(findings)).toEqual(['orphan_palette']);
    expect(findings[0].detail).toBe('minecraft:diamond_block');
  });

  it('flags a data-mode structure block with an empty metadata string', () => {
    const s = dense();
    s.palette.push({ Name: 'minecraft:structure_block', Properties: { mode: 'data' } });
    s.blocks[0] = { state: 1, pos: [0, 0, 0], nbt: { id: 'minecraft:structure_block', mode: 'DATA', metadata: '' } };
    const findings = lintStructure(s, null);
    expect(codes(findings)).toEqual(['bad_data_marker']);
    expect(findings[0].pos).toEqual([0, 0, 0]);
  });

  it('accepts a data marker that carries a payload', () => {
    const s = dense();
    s.palette.push({ Name: 'minecraft:structure_block', Properties: { mode: 'data' } });
    s.blocks[0] = { state: 1, pos: [0, 0, 0], nbt: { id: 'minecraft:structure_block', mode: 'DATA', metadata: 'spawn_boss' } };
    expect(lintStructure(s, null)).toEqual([]);
  });
});
