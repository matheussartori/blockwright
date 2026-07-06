import { describe, expect, it } from 'vitest';
import * as nbt from 'prismarine-nbt';
import { blockIndexAt, decodeChunk } from '../../anvil/chunk-decode';
import { chunkEditGate, MAX_KNOWN_DATA_VERSION, patchChunkNbt } from '../chunk-patch';
import { compoundItems, compoundOf, encodeTagRoot, numberOf, type Compound, type Tag } from '../nbt-tree';
import { chunkTag, sectionTag } from './fixtures';

/** Round-trip a patched tree through the REAL reader: encode → parse → simplify → decodeChunk. */
async function readBack(root: Tag) {
  const { parsed } = await nbt.parse(encodeTagRoot(root));
  const simplified = nbt.simplify(parsed) as Record<string, unknown>;
  return { simplified, column: decodeChunk(simplified) };
}

const stone = { Name: 'minecraft:stone' };
const diamond = { Name: 'minecraft:diamond_block' };

describe('chunkEditGate', () => {
  it('accepts a fully generated modern chunk (namespaced and bare Status)', () => {
    expect(chunkEditGate(chunkTag({ cx: 0, cz: 0, status: 'minecraft:full' }))).toBeNull();
    expect(chunkEditGate(chunkTag({ cx: 0, cz: 0, status: 'full' }))).toBeNull();
  });

  it('refuses proto chunks', () => {
    expect(chunkEditGate(chunkTag({ cx: 0, cz: 0, status: 'minecraft:features' }))).toMatch(/not fully generated/);
  });

  it('refuses pre-1.18 chunks', () => {
    expect(chunkEditGate(chunkTag({ cx: 0, cz: 0, dataVersion: 2586 }))).toMatch(/1\.18/);
  });

  it('refuses chunks newer than the known registry (never over-write the future)', () => {
    expect(chunkEditGate(chunkTag({ cx: 0, cz: 0, dataVersion: MAX_KNOWN_DATA_VERSION + 1 }))).toMatch(/newer/);
  });

  it('refuses a chunk with no sections', () => {
    expect(chunkEditGate(chunkTag({ cx: 0, cz: 0, sections: [] }))).toMatch(/no sections/);
  });
});

describe('patchChunkNbt', () => {
  it('places a block, readable through the real chunk decoder', async () => {
    const root = chunkTag({ cx: 0, cz: 0, sections: [sectionTag(0, [stone]), sectionTag(1, [stone])] });
    const { editedSectionYs } = patchChunkNbt(root, [{ x: 1, y: 2, z: 3, state: diamond }]);
    expect(editedSectionYs).toEqual([0]);

    const { column } = await readBack(root);
    expect(column).not.toBeNull();
    const section = column?.sections.find((s) => s.sectionY === 0);
    expect(section).toBeDefined();
    if (!section) return;
    const idx = blockIndexAt(section, 1, 2, 3);
    expect(section.palette[idx].Name).toBe('minecraft:diamond_block');
    expect(section.palette[blockIndexAt(section, 0, 0, 0)].Name).toBe('minecraft:stone');
  });

  it('handles negative chunk coordinates (local cell math)', async () => {
    const root = chunkTag({ cx: -1, cz: -1, sections: [sectionTag(0, [stone])] });
    // Chunk -1,-1 covers x,z in [-16, -1]. Place at world (-1, 5, -16) → local (15, 5, 0).
    patchChunkNbt(root, [{ x: -1, y: 5, z: -16, state: diamond }]);
    const { column } = await readBack(root);
    const section = column?.sections.find((s) => s.sectionY === 0);
    if (!section) throw new Error('section missing');
    expect(section.palette[blockIndexAt(section, 15, 5, 0)].Name).toBe('minecraft:diamond_block');
  });

  it('strips light only from edited sections and flags the chunk for relight', () => {
    const root = chunkTag({ cx: 0, cz: 0, sections: [sectionTag(0, [stone]), sectionTag(1, [stone])] });
    patchChunkNbt(root, [{ x: 0, y: 0, z: 0, state: diamond }]);
    const value = compoundOf(root) as Compound;
    const sections = compoundItems(value.sections);
    const s0 = sections.find((s) => numberOf(s.Y) === 0) as Compound;
    const s1 = sections.find((s) => numberOf(s.Y) === 1) as Compound;
    expect(s0.BlockLight).toBeUndefined();
    expect(s0.SkyLight).toBeUndefined();
    expect(s1.BlockLight).toBeDefined(); // untouched section keeps its stored light
    expect(numberOf(value.isLightOn)).toBe(0);
    expect(value.Heightmaps).toBeUndefined();
  });

  it('preserves everything it does not own (mod tags, biomes, DataVersion)', () => {
    const root = chunkTag({ cx: 0, cz: 0, dataVersion: 3465 });
    const before = compoundOf(root) as Compound;
    const biomesBefore = JSON.stringify(compoundItems(before.sections)[0].biomes);
    patchChunkNbt(root, [{ x: 0, y: 0, z: 0, state: diamond }]);
    const value = compoundOf(root) as Compound;
    expect(numberOf(value.DataVersion)).toBe(3465); // never bumped
    expect(JSON.stringify(value['themod:custom'])).toContain('keep-me');
    expect(JSON.stringify(compoundItems(value.sections)[0].biomes)).toBe(biomesBefore);
  });

  it('adds a minimal block entity with ABSOLUTE coords and removes stale ones', async () => {
    const root = chunkTag({ cx: 2, cz: 3 }); // covers x 32..47, z 48..63
    patchChunkNbt(root, [
      { x: 33, y: 4, z: 50, state: { Name: 'minecraft:chest', Properties: { facing: 'north' } }, blockEntity: { id: 'minecraft:chest', Items: [] } },
    ]);
    const { simplified } = await readBack(root);
    const bes = simplified.block_entities as Record<string, unknown>[];
    expect(bes).toHaveLength(1);
    expect(bes[0]).toMatchObject({ id: 'minecraft:chest', x: 33, y: 4, z: 50, keepPacked: 0 });

    // Overwriting the cell with a plain block drops the record — no stale chest NBT.
    patchChunkNbt(root, [{ x: 33, y: 4, z: 50, state: stone }]);
    const after = await readBack(root);
    expect(after.simplified.block_entities).toEqual([]);
  });

  it('creates a missing section (with a cloned biome palette) inside the build range', async () => {
    const root = chunkTag({ cx: 0, cz: 0, sections: [sectionTag(0, [stone]), sectionTag(2, [stone])] });
    patchChunkNbt(root, [{ x: 5, y: 20, z: 5, state: diamond }]); // section 1 doesn't exist
    const value = compoundOf(root) as Compound;
    const sections = compoundItems(value.sections);
    expect(sections.map((s) => numberOf(s.Y))).toEqual([0, 1, 2]); // sorted insert
    const created = sections[1];
    expect(created.biomes).toBeDefined(); // cloned from a neighbor section

    const { column } = await readBack(root);
    const section = column?.sections.find((s) => s.sectionY === 1);
    if (!section) throw new Error('created section missing');
    expect(section.palette[blockIndexAt(section, 5, 4, 5)].Name).toBe('minecraft:diamond_block');
  });

  it('refuses edits outside the build range or outside the chunk', () => {
    const root = chunkTag({ cx: 0, cz: 0, sections: [sectionTag(0, [stone])] });
    expect(() => patchChunkNbt(root, [{ x: 0, y: 200, z: 0, state: diamond }])).toThrow(/build range/);
    expect(() => patchChunkNbt(root, [{ x: 99, y: 0, z: 0, state: diamond }])).toThrow(/outside chunk/);
  });

  it('placing air is an edit like any other (explicit air cell)', async () => {
    const root = chunkTag({ cx: 0, cz: 0, sections: [sectionTag(0, [stone])] });
    patchChunkNbt(root, [{ x: 0, y: 0, z: 0, state: { Name: 'minecraft:air' } }]);
    const { column } = await readBack(root);
    const section = column?.sections.find((s) => s.sectionY === 0);
    if (!section) throw new Error('section missing');
    expect(section.palette[blockIndexAt(section, 0, 0, 0)].Name).toBe('minecraft:air');
    expect(section.palette[blockIndexAt(section, 1, 0, 0)].Name).toBe('minecraft:stone');
  });
});
