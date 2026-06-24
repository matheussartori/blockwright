import path from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// A tiny in-memory content pack: `loadJson` reads from `files` keyed by absolute path,
// `assetsDir` maps a namespace to its root — so the model/blockstate resolution runs
// without touching disk.
const { files } = vi.hoisted(() => ({ files: {} as Record<string, unknown> }));
vi.mock('../content-pack', () => ({
  assetsDir: (ns = 'minecraft') => path.join('/assets', ns),
  loadJson: (file: string) => (file in files ? files[file] : null),
  resolveTextureFile: () => null,
}));

import { buildResolvedModel, clearModelCache } from '../model-loader';
import { resolveBlock } from '../blockstate-resolver';

const modelFile = (ns: string, rel: string) => path.join('/assets', ns, 'models', `${rel}.json`);
const blockstateFile = (ns: string, key: string) => path.join('/assets', ns, 'blockstates', `${key}.json`);

// `theplacebeyond:closed_umbrella` — a 2-tall block. ALL geometry lives in the lower model
// (it overflows up into the cell above); the upper model is INTENTIONALLY empty (no elements,
// just a particle texture), the standard Minecraft "empty placeholder on top" convention.
files[modelFile('minecraft', 'block/block')] = {}; // the empty vanilla parent (no elements)
files[modelFile('theplacebeyond', 'block/closed_umbrella')] = {
  parent: 'block/block',
  textures: { '0': 'theplacebeyond:block/closed_umbrella' },
  elements: [{ from: [7, 2, 7], to: [9, 15, 9], faces: { up: { uv: [0, 0, 16, 16], texture: '#0' } } }],
};
files[modelFile('theplacebeyond', 'block/closed_umbrella_upper')] = {
  parent: 'block/block',
  textures: { particle: 'theplacebeyond:block/closed_umbrella' },
};
files[blockstateFile('theplacebeyond', 'closed_umbrella')] = {
  variants: {
    'facing=south,half=lower': { model: 'theplacebeyond:block/closed_umbrella' },
    'facing=south,half=upper': { model: 'theplacebeyond:block/closed_umbrella_upper' },
  },
};

beforeEach(() => clearModelCache());

describe('buildResolvedModel', () => {
  it('resolves an element-less model to an EMPTY model, not null (a tall block upper half)', () => {
    // The fix: a model that loaded but has no elements is intentional, not unresolved — so it
    // resolves to `{ elements: [] }`. Returning null here would make the renderer stamp a
    // fallback cube (the "corrupted second block").
    const m = buildResolvedModel('theplacebeyond:block/closed_umbrella_upper', {});
    expect(m).not.toBeNull();
    expect(m?.elements).toEqual([]);
  });

  it('returns null when the model file is missing (genuinely unresolved)', () => {
    expect(buildResolvedModel('theplacebeyond:block/does_not_exist', {})).toBeNull();
  });

  it('resolves a model with elements normally', () => {
    const m = buildResolvedModel('theplacebeyond:block/closed_umbrella', {});
    expect(m?.elements).toHaveLength(1);
    expect(m?.elements[0].faces.up?.texture).toBe('theplacebeyond/block/closed_umbrella');
  });
});

describe('resolveBlock — intentional empty model vs unknown block', () => {
  it('returns ONE empty-elements model for the matched upper variant (renders nothing, not a cube)', () => {
    // models.length === 1 keeps the mesh-builder out of the fallback-cube branch; the single
    // empty model then contributes no geometry → the cell renders nothing, as intended.
    const models = resolveBlock('theplacebeyond:closed_umbrella', { facing: 'south', half: 'upper' });
    expect(models).toHaveLength(1);
    expect(models[0].elements).toEqual([]);
  });

  it('returns the full geometry for the lower variant', () => {
    const models = resolveBlock('theplacebeyond:closed_umbrella', { facing: 'south', half: 'lower' });
    expect(models).toHaveLength(1);
    expect(models[0].elements).toHaveLength(1);
  });

  it('returns [] for a block with no blockstate file (the genuine fallback-cube case)', () => {
    expect(resolveBlock('theplacebeyond:unknown_block', {})).toEqual([]);
  });
});
