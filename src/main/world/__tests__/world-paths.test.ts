import { afterAll, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { availableDimensions, regionDir, regionForChunk } from '../anvil/world-paths';

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'bw-world-'));
afterAll(() => fs.rmSync(tmp, { recursive: true, force: true }));

/** Create a world folder with the given region-bearing dimension folders. */
function makeWorld(name: string, regionDirs: string[]): string {
  const root = path.join(tmp, name);
  fs.mkdirSync(root, { recursive: true });
  fs.writeFileSync(path.join(root, 'level.dat'), Buffer.alloc(4));
  for (const d of regionDirs) {
    const dir = path.join(root, d);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'r.0.0.mca'), Buffer.alloc(4));
  }
  return root;
}

describe('regionDir', () => {
  it('maps vanilla ids to classic folders and mod ids under dimensions/', () => {
    expect(regionDir('/w', 'minecraft:overworld')).toBe(path.join('/w', 'region'));
    expect(regionDir('/w', 'minecraft:the_nether')).toBe(path.join('/w', 'DIM-1', 'region'));
    expect(regionDir('/w', 'minecraft:the_end')).toBe(path.join('/w', 'DIM1', 'region'));
    expect(regionDir('/w', 'theplacebeyond:bleak_db599711')).toBe(
      path.join('/w', 'dimensions', 'theplacebeyond', 'bleak_db599711', 'region'),
    );
  });
});

describe('regionForChunk', () => {
  it('splits a chunk coord into region + local', () => {
    expect(regionForChunk(0, 0)).toEqual({ rx: 0, rz: 0, lx: 0, lz: 0 });
    expect(regionForChunk(33, -1)).toEqual({ rx: 1, rz: -1, lx: 1, lz: 31 });
  });
});

describe('availableDimensions', () => {
  it('lists the overworld always, vanilla dims only when generated, and mod dimensions', async () => {
    // Overworld + a generated mod dimension; nether/end NOT generated (no region files).
    const root = makeWorld('modworld', [
      'region',
      'dimensions/theplacebeyond/bleak_db599711/region',
      'dimensions/theplacebeyond/bleak_0b7d3287/region',
    ]);
    const dims = await availableDimensions(root);
    const ids = dims.map((d) => d.id);
    expect(ids).toContain('minecraft:overworld');
    expect(ids).not.toContain('minecraft:the_nether'); // never generated
    expect(ids).toContain('theplacebeyond:bleak_db599711');
    expect(ids).toContain('theplacebeyond:bleak_0b7d3287');
    // Mod dimension label is its path.
    expect(dims.find((d) => d.id === 'theplacebeyond:bleak_db599711')!.label).toBe('bleak_db599711');
  });

  it('includes the nether/end when their region folders hold data', async () => {
    const root = makeWorld('full', ['region', 'DIM-1/region', 'DIM1/region']);
    const ids = (await availableDimensions(root)).map((d) => d.id);
    expect(ids).toEqual(['minecraft:overworld', 'minecraft:the_nether', 'minecraft:the_end']);
  });
});
