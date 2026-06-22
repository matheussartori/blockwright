import { describe, it, expect } from 'vitest';
import { DEFAULT_WORLDGEN } from '@/shared/domain/worldgen';
import {
  biomeTagJson,
  saltFor,
  structureJson,
  structureSetJson,
  templatePoolJson,
} from '../worldgen-json';

describe('structureJson', () => {
  it('is a jigsaw structure referencing the biome tag + start pool', () => {
    const json = structureJson('mymod', 'tower', { ...DEFAULT_WORLDGEN, terrainAdaptation: 'beard_box' }) as Record<string, unknown>;
    expect(json.type).toBe('minecraft:jigsaw');
    expect(json.biomes).toBe('#mymod:has_structure/tower');
    expect(json.start_pool).toBe('mymod:tower/start');
    expect(json.terrain_adaptation).toBe('beard_box');
    // spawn_overrides is required by the 1.21 codec even when empty.
    expect(json.spawn_overrides).toEqual({});
  });
});

describe('templatePoolJson', () => {
  it('has one rigid single-element pool pointing at the structure', () => {
    const json = templatePoolJson('mymod', 'tower') as { name: string; elements: { element: { location: string; projection: string } }[] };
    expect(json.name).toBe('mymod:tower/start');
    expect(json.elements).toHaveLength(1);
    expect(json.elements[0].element.location).toBe('mymod:tower');
    expect(json.elements[0].element.projection).toBe('rigid');
  });
});

describe('structureSetJson', () => {
  it('carries the spacing/separation and a deterministic salt', () => {
    const json = structureSetJson('mymod', 'tower', { ...DEFAULT_WORLDGEN, spacing: 24, separation: 5 }) as {
      placement: { spacing: number; separation: number; salt: number };
    };
    expect(json.placement.spacing).toBe(24);
    expect(json.placement.separation).toBe(5);
    expect(json.placement.salt).toBe(saltFor('mymod:tower'));
  });
});

describe('saltFor', () => {
  it('is deterministic and non-negative', () => {
    expect(saltFor('mymod:tower')).toBe(saltFor('mymod:tower'));
    expect(saltFor('mymod:tower')).toBeGreaterThanOrEqual(0);
    expect(saltFor('a')).not.toBe(saltFor('b'));
  });
});

describe('biomeTagJson', () => {
  it('lists the chosen biomes as tag values', () => {
    const json = biomeTagJson({ ...DEFAULT_WORLDGEN, biomes: ['minecraft:plains'] }) as { values: string[] };
    expect(json.values).toEqual(['minecraft:plains']);
  });
});
