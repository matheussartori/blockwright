import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Workspace } from '@/shared/types';
import { validateStudioModel } from '@/shared/domain/worldgen-studio';
import { listDefs, readModel, writeModel } from '../worldgen-studio';

let root: string;
const NS = 'mymod';
const ws = (): Workspace => ({ name: 'MyMod', root, namespace: NS, minecraftVersion: '1.21.1' });

const write = (rel: string, json: unknown) => {
  const abs = path.join(root, rel);
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(abs, JSON.stringify(json, null, 2));
};
const read = (rel: string): Record<string, unknown> =>
  JSON.parse(fs.readFileSync(path.join(root, rel), 'utf8')) as Record<string, unknown>;

/** A full exported worldgen file set for `tower` (what runExport writes). */
function seedTower() {
  write(`data/${NS}/worldgen/structure/tower.json`, {
    type: 'minecraft:jigsaw',
    biomes: `#${NS}:has_structure/tower`,
    step: 'surface_structures',
    spawn_overrides: {},
    terrain_adaptation: 'beard_thin',
    start_pool: `${NS}:tower/start`,
    size: 1,
    start_height: { absolute: 0 },
    project_start_to_heightmap: 'WORLD_SURFACE_WG',
    max_distance_from_center: 80,
    use_expansion_hack: false,
  });
  write(`data/${NS}/worldgen/template_pool/tower/start.json`, {
    name: `${NS}:tower/start`,
    fallback: 'minecraft:empty',
    elements: [
      { weight: 1, element: { element_type: 'minecraft:single_pool_element', location: `${NS}:tower`, processors: 'minecraft:empty', projection: 'rigid' } },
      { weight: 3, element: { element_type: 'minecraft:empty_pool_element' } },
    ],
  });
  write(`data/${NS}/worldgen/structure_set/tower.json`, {
    structures: [{ structure: `${NS}:tower`, weight: 1 }],
    placement: { type: 'minecraft:random_spread', spacing: 32, separation: 8, salt: 12345 },
  });
  write(`data/${NS}/tags/worldgen/biome/has_structure/tower.json`, {
    values: ['minecraft:plains', 'minecraft:forest'],
  });
}

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'bw-studio-'));
});

afterEach(() => {
  fs.rmSync(root, { recursive: true, force: true });
});

describe('worldgen studio', () => {
  it('lists only jigsaw defs', () => {
    seedTower();
    write(`data/${NS}/worldgen/structure/plain.json`, { type: 'minecraft:mineshaft' });
    expect(listDefs(ws())).toEqual(['tower']);
  });

  it('reads the exported file set into the editable model', () => {
    seedTower();
    const m = readModel(ws(), 'tower');
    expect(m).not.toBeNull();
    expect(m!.terrainAdaptation).toBe('beard_thin');
    expect(m!.size).toBe(1);
    expect(m!.maxDistance).toBe(80);
    expect(m!.biomesInline).toBe(false);
    expect(m!.biomes).toEqual(['minecraft:plains', 'minecraft:forest']);
    expect(m!.set).toMatchObject({ spacing: 32, separation: 8 });
    // Only the template-referencing element is editable; the empty one is skipped
    // but its INDEX is preserved for surgical writes.
    expect(m!.pool!.elements).toEqual([{ index: 0, location: `${NS}:tower`, weight: 1 }]);
    expect(m!.pool!.fallback).toBe('minecraft:empty');
  });

  it('writes edits surgically — unmodeled fields survive untouched', () => {
    seedTower();
    const m = readModel(ws(), 'tower')!;
    m.terrainAdaptation = 'none';
    m.size = 3;
    m.maxDistance = 116;
    m.biomes = ['minecraft:desert'];
    m.set = { ...m.set!, spacing: 64, separation: 16 };
    m.pool = { ...m.pool!, fallback: `${NS}:tower/terminators`, elements: [{ index: 0, location: `${NS}:tower`, weight: 5 }] };
    expect(writeModel(ws(), m)).toEqual({ ok: true });

    const def = read(`data/${NS}/worldgen/structure/tower.json`);
    expect(def.terrain_adaptation).toBe('none');
    expect(def.size).toBe(3);
    expect(def.max_distance_from_center).toBe(116);
    // Untouched: the codec-critical fields the Studio doesn't model.
    expect(def.spawn_overrides).toEqual({});
    expect(def.project_start_to_heightmap).toBe('WORLD_SURFACE_WG');
    expect(def.biomes).toBe(`#${NS}:has_structure/tower`); // tag ref intact, tag file edited

    expect(read(`data/${NS}/tags/worldgen/biome/has_structure/tower.json`).values).toEqual(['minecraft:desert']);

    const set = read(`data/${NS}/worldgen/structure_set/tower.json`);
    expect((set.placement as Record<string, unknown>).spacing).toBe(64);
    expect((set.placement as Record<string, unknown>).salt).toBe(12345); // preserved

    const pool = read(`data/${NS}/worldgen/template_pool/tower/start.json`);
    const elements = pool.elements as Record<string, unknown>[];
    expect(elements[0].weight).toBe(5);
    expect(elements[1].weight).toBe(3); // the empty element was left alone
    expect(pool.fallback).toBe(`${NS}:tower/terminators`);
  });

  it('round-trips: a write then read returns the edited model', () => {
    seedTower();
    const m = readModel(ws(), 'tower')!;
    m.size = 5;
    writeModel(ws(), m);
    expect(readModel(ws(), 'tower')!.size).toBe(5);
  });
});

describe('validateStudioModel', () => {
  const base = () => {
    seedTower();
    return readModel(ws(), 'tower')!;
  };

  it('accepts the exported defaults', () => {
    expect(validateStudioModel(base())).toEqual([]);
  });

  it('catches the codec traps', () => {
    const m = base();
    m.biomes = [];
    m.size = 9;
    m.maxDistance = 120; // adaptation is beard_thin → 116 cap
    m.set = { ...m.set!, spacing: 8, separation: 8 };
    m.pool = { ...m.pool!, elements: [{ index: 0, location: 'x', weight: 0 }] };
    const codes = validateStudioModel(m).map((i) => i.code).sort();
    expect(codes).toEqual([
      'biomes_empty',
      'distance_cap',
      'separation_ge_spacing',
      'size_range',
      'weight_range',
    ]);
  });

  it('caps distance at 128 when adaptation is none', () => {
    const m = base();
    m.terrainAdaptation = 'none';
    m.maxDistance = 120;
    expect(validateStudioModel(m)).toEqual([]);
    m.maxDistance = 129;
    expect(validateStudioModel(m).map((i) => i.code)).toEqual(['distance_range']);
  });
});
