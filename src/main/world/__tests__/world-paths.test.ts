import { afterAll, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { availableDimensions, listRegions, regionDirs, regionForChunk } from '../anvil/world-paths';

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

describe('regionDirs', () => {
  it('maps vanilla ids to the 26.x dimensions/ layout + the classic folder, mod ids to dimensions/ only', () => {
    expect(regionDirs('/w', 'minecraft:overworld')).toEqual([
      path.join('/w', 'dimensions', 'minecraft', 'overworld', 'region'),
      path.join('/w', 'region'),
    ]);
    expect(regionDirs('/w', 'minecraft:the_nether')).toEqual([
      path.join('/w', 'dimensions', 'minecraft', 'the_nether', 'region'),
      path.join('/w', 'DIM-1', 'region'),
      path.join('/w_nether', 'DIM-1', 'region'),
    ]);
    expect(regionDirs('/w', 'minecraft:the_end')).toEqual([
      path.join('/w', 'dimensions', 'minecraft', 'the_end', 'region'),
      path.join('/w', 'DIM1', 'region'),
      path.join('/w_the_end', 'DIM1', 'region'),
    ]);
    expect(regionDirs('/w', 'theplacebeyond:bleak_db599711')).toEqual([
      path.join('/w', 'dimensions', 'theplacebeyond', 'bleak_db599711', 'region'),
    ]);
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

  it('resolves Bukkit-style server saves (sibling <world>_nether / <world>_the_end folders)', async () => {
    const root = makeWorld('srv', ['region']);
    // The server siblings live BESIDE the main world folder, each a world of its own.
    for (const [folder, classic] of [
      ['srv_nether', 'DIM-1'],
      ['srv_the_end', 'DIM1'],
    ] as const) {
      const dir = path.join(tmp, folder, classic, 'region');
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(path.join(tmp, folder, 'level.dat'), Buffer.alloc(4));
      fs.writeFileSync(path.join(dir, 'r.0.0.mca'), Buffer.alloc(4));
    }
    const ids = (await availableDimensions(root)).map((d) => d.id);
    expect(ids).toEqual(['minecraft:overworld', 'minecraft:the_nether', 'minecraft:the_end']);
    expect(await listRegions(root, 'minecraft:the_nether')).toEqual([{ rx: 0, rz: 0 }]);
    // The sibling folder is the LAST candidate — the in-root layouts stay authoritative.
    expect(regionDirs(root, 'minecraft:the_nether')[2]).toBe(path.join(tmp, 'srv_nether', 'DIM-1', 'region'));
  });

  it('resolves the 26.x layout (vanilla dims under dimensions/minecraft/) without double-listing', async () => {
    const root = makeWorld('modern', [
      'dimensions/minecraft/overworld/region',
      'dimensions/minecraft/the_nether/region',
    ]);
    const ids = (await availableDimensions(root)).map((d) => d.id);
    expect(ids).toEqual(['minecraft:overworld', 'minecraft:the_nether']);
    // listRegions finds the modern folder through the vanilla id.
    expect(await listRegions(root, 'minecraft:overworld')).toEqual([{ rx: 0, rz: 0 }]);
    expect(await listRegions(root, 'minecraft:the_end')).toEqual([]);
  });
});
