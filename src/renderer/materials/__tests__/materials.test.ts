import { describe, expect, it } from 'vitest';
import type { PaletteEntry, StructureData } from '@/shared/types';
import { buildMaterialList, materialsToCsv, materialsToJson } from '../materials';

function entry(name: string, properties?: Record<string, string>, air = false): PaletteEntry {
  return { name, properties, models: [], color: [0.5, 0.5, 0.5], air };
}

/** A minimal StructureData carrying only what the rollup reads. */
function structure(palette: PaletteEntry[], states: number[], entities: { id: string }[] = []): StructureData {
  return {
    palette,
    blocks: states.map((state, i) => ({ state, pos: [i, 0, 0] as [number, number, number] })),
    entities: entities.map((e, i) => ({
      id: e.id,
      pos: [i, 0, 0] as [number, number, number],
      color: [0.5, 0.5, 0.5] as [number, number, number],
    })),
  } as unknown as StructureData;
}

describe('buildMaterialList', () => {
  it('rolls block states up by item id with stack math', () => {
    const data = structure(
      [entry('minecraft:oak_stairs', { facing: 'north' }), entry('minecraft:oak_stairs', { facing: 'south' })],
      [...Array<number>(70).fill(0), ...Array<number>(10).fill(1)],
    );
    const list = buildMaterialList(data);
    expect(list.blocks).toHaveLength(1);
    const row = list.blocks[0];
    expect(row.id).toBe('minecraft:oak_stairs');
    expect(row.count).toBe(80);
    expect(row.stackSize).toBe(64);
    expect(row.stacks).toBe(1);
    expect(row.remainder).toBe(16);
    expect(row.shulkers).toBe(1);
    expect(list.totalItems).toBe(80);
  });

  it('skips air-like entries and technical blocks', () => {
    const data = structure(
      [entry('minecraft:air', undefined, true), entry('minecraft:structure_void', undefined, true), entry('minecraft:piston_head'), entry('minecraft:stone')],
      [0, 1, 2, 3],
    );
    const list = buildMaterialList(data);
    expect(list.blocks.map((r) => r.id)).toEqual(['minecraft:stone']);
  });

  it('counts multi-cell blocks once per item (door/bed second halves are free)', () => {
    const data = structure(
      [
        entry('minecraft:oak_door', { half: 'lower' }),
        entry('minecraft:oak_door', { half: 'upper' }),
        entry('minecraft:red_bed', { part: 'foot' }),
        entry('minecraft:red_bed', { part: 'head' }),
      ],
      [0, 1, 2, 3],
    );
    const list = buildMaterialList(data);
    expect(list.blocks).toEqual([
      expect.objectContaining({ id: 'minecraft:oak_door', count: 1 }),
      expect.objectContaining({ id: 'minecraft:red_bed', count: 1 }),
    ]);
  });

  it('counts double slabs as two items and prop-stacked blocks by their amount', () => {
    const data = structure(
      [
        entry('minecraft:oak_slab', { type: 'double' }),
        entry('minecraft:candle', { candles: '3' }),
        entry('minecraft:snow', { layers: '5' }),
      ],
      [0, 1, 2],
    );
    const list = buildMaterialList(data);
    expect(list.blocks).toEqual([
      expect.objectContaining({ id: 'minecraft:snow', count: 5 }),
      expect.objectContaining({ id: 'minecraft:candle', count: 3 }),
      expect.objectContaining({ id: 'minecraft:oak_slab', count: 2 }),
    ]);
  });

  it('counts source water as a bucket and skips flowing cells', () => {
    const data = structure(
      [entry('minecraft:water', { level: '0' }), entry('minecraft:water', { level: '3' }), entry('minecraft:lava')],
      [0, 1, 2],
    );
    const list = buildMaterialList(data);
    expect(list.blocks).toEqual([
      expect.objectContaining({ id: 'minecraft:lava_bucket', count: 1, stackSize: 1, paletteState: -1 }),
      expect.objectContaining({ id: 'minecraft:water_bucket', count: 1, stackSize: 1 }),
    ]);
  });

  it('applies the 16- and 1-stack exceptions', () => {
    const data = structure(
      [entry('minecraft:oak_sign'), entry('minecraft:red_banner'), entry('minecraft:shulker_box')],
      [...Array<number>(20).fill(0), 1, 2],
    );
    const rows = Object.fromEntries(buildMaterialList(data).blocks.map((r) => [r.id, r]));
    expect(rows['minecraft:oak_sign']).toMatchObject({ stackSize: 16, stacks: 1, remainder: 4 });
    expect(rows['minecraft:red_banner'].stackSize).toBe(16);
    expect(rows['minecraft:shulker_box'].stackSize).toBe(1);
  });

  it('groups entities by id', () => {
    const data = structure([entry('minecraft:stone')], [0], [
      { id: 'minecraft:armor_stand' },
      { id: 'minecraft:armor_stand' },
      { id: 'minecraft:item_frame' },
    ]);
    const list = buildMaterialList(data);
    expect(list.entities).toEqual([
      { id: 'minecraft:armor_stand', count: 2 },
      { id: 'minecraft:item_frame', count: 1 },
    ]);
  });
});

describe('serializers', () => {
  const data = structure(
    [entry('minecraft:stone'), entry('minecraft:oak_stairs', { facing: 'east' })],
    [0, 0, 1],
    [{ id: 'minecraft:armor_stand' }],
  );
  const list = buildMaterialList(data);

  it('materialsToCsv emits one row per material plus entity rows', () => {
    const csv = materialsToCsv(list);
    const lines = csv.trim().split('\n');
    expect(lines[0]).toBe('type,id,count,stack_size,stacks,remainder,shulker_boxes');
    expect(lines).toContain('block,minecraft:stone,2,64,0,2,0');
    expect(lines).toContain('block,minecraft:oak_stairs,1,64,0,1,0');
    expect(lines).toContain('entity,minecraft:armor_stand,1,,,,');
  });

  it('materialsToJson carries the structure identity and drops view-only fields', () => {
    const parsed = JSON.parse(materialsToJson(list, { name: 'test', size: [3, 1, 1] })) as {
      name: string;
      size: number[];
      totalItems: number;
      blocks: Record<string, unknown>[];
      entities: unknown[];
    };
    expect(parsed.name).toBe('test');
    expect(parsed.size).toEqual([3, 1, 1]);
    expect(parsed.totalItems).toBe(3);
    expect(parsed.blocks[0]).not.toHaveProperty('paletteState');
    expect(parsed.entities).toHaveLength(1);
  });
});
