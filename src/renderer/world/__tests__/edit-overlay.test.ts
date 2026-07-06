import { describe, expect, it } from 'vitest';
import type { ChunkRenderPayload, PaletteEntry } from '@/shared/types';
import { chunkKeyOf, compositePayload, stateKeyOf, type ResolvedWorldBlock } from '../edit-overlay';

const entry = (name: string, air = false): PaletteEntry => ({ name, models: [], color: [0.5, 0.5, 0.5], air });

function payload(overrides: Partial<ChunkRenderPayload> = {}): ChunkRenderPayload {
  return {
    cx: 0,
    cz: 0,
    palette: [entry('minecraft:air', true), entry('minecraft:stone')],
    sections: [{ sectionY: 0, blocks: null, uniform: true, fill: 1 }],
    textureKeys: ['minecraft/block/stone'],
    heightmap: null,
    grassTint: null,
    entities: [],
    empty: false,
    ...overrides,
  };
}

const resolvedDiamond: Record<string, ResolvedWorldBlock> = {
  [stateKeyOf('minecraft:diamond_block')]: {
    entry: entry('minecraft:diamond_block'),
    textures: ['minecraft/block/diamond_block'],
  },
};

describe('chunkKeyOf / stateKeyOf', () => {
  it('floors negative coords into the right chunk', () => {
    expect(chunkKeyOf(-1, -1)).toBe('-1,-1');
    expect(chunkKeyOf(0, 15)).toBe('0,0');
    expect(chunkKeyOf(16, -16)).toBe('1,-1');
  });

  it('sorts properties for a canonical key', () => {
    expect(stateKeyOf('a:b', { z: '1', a: '2' })).toBe('a:b[a=2,z=1]');
    expect(stateKeyOf('a:b')).toBe('a:b');
  });
});

describe('compositePayload', () => {
  it('returns the SAME payload when there are no edits (mesh fast path)', () => {
    const p = payload();
    expect(compositePayload(p, [], {})).toBe(p);
  });

  it('never mutates the original payload', () => {
    const p = payload();
    const before = JSON.stringify({ palette: p.palette.map((e) => e.name), sections: p.sections.map((s) => s.uniform) });
    compositePayload(p, [{ x: 1, y: 2, z: 3, name: 'minecraft:diamond_block' }], resolvedDiamond);
    expect(p.sections[0].uniform).toBe(true);
    expect(p.sections[0].blocks).toBeNull();
    expect(JSON.stringify({ palette: p.palette.map((e) => e.name), sections: p.sections.map((s) => s.uniform) })).toBe(before);
  });

  it('expands a uniform section and places the edit at the YZX cell', () => {
    const out = compositePayload(payload(), [{ x: 1, y: 2, z: 3, name: 'minecraft:diamond_block' }], resolvedDiamond);
    const section = out.sections.find((s) => s.sectionY === 0)!;
    expect(section.uniform).toBe(false);
    const idx = section.blocks![2 * 256 + 3 * 16 + 1];
    expect(out.palette[idx].name).toBe('minecraft:diamond_block');
    // Every other cell kept the stone fill.
    expect(out.palette[section.blocks![0]].name).toBe('minecraft:stone');
    expect(out.textureKeys).toContain('minecraft/block/diamond_block');
  });

  it('handles negative world coords (local cell math)', () => {
    const p = payload({ cx: -1, cz: -1 });
    const out = compositePayload(p, [{ x: -1, y: 5, z: -16, name: 'minecraft:diamond_block' }], resolvedDiamond);
    const section = out.sections.find((s) => s.sectionY === 0)!;
    const idx = section.blocks![5 * 256 + 0 * 16 + 15];
    expect(out.palette[idx].name).toBe('minecraft:diamond_block');
  });

  it('erase writes an air cell (reuses the existing air palette entry)', () => {
    const out = compositePayload(payload(), [{ x: 0, y: 0, z: 0, name: 'minecraft:air' }], {});
    const section = out.sections.find((s) => s.sectionY === 0)!;
    expect(out.palette[section.blocks![0]].air).toBe(true);
    expect(out.palette).toHaveLength(2); // no duplicate air entry appended
  });

  it('creates a section that does not exist yet (placing into empty sky)', () => {
    const out = compositePayload(payload(), [{ x: 0, y: 40, z: 0, name: 'minecraft:diamond_block' }], resolvedDiamond);
    const section = out.sections.find((s) => s.sectionY === 2)!;
    expect(section).toBeDefined();
    const idx = section.blocks![8 * 256];
    expect(out.palette[idx].name).toBe('minecraft:diamond_block');
    // The rest of the fresh section is air.
    expect(out.palette[section.blocks![0]].air).toBe(true);
    // Sections stay sorted by Y.
    expect(out.sections.map((s) => s.sectionY)).toEqual([0, 2]);
  });

  it('skips edits whose state is not resolved yet (composites on the next re-mesh)', () => {
    const p = payload();
    const out = compositePayload(p, [{ x: 0, y: 0, z: 0, name: 'minecraft:unresolved_block' }], {});
    expect(out).toBe(p);
  });
});
