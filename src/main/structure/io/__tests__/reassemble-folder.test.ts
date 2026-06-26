import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pieceName, splitManifest, splitPlan, SPLIT_MANIFEST_FILE, type Vec3 } from '@/shared/domain/split';
import { blockStateString, type RawStructure } from '../raw';
import { splitToJigsaw } from '../split-structure';
import { reassembleFolderToBuffer } from '../reassemble-folder';
import { readRaw } from '../convert';
import { DEFAULT_DATA_VERSION } from '../../mc-data-version';

const LIMIT = 48;
const WORLDGEN = { generate: true, terrainAdaptation: 'beard_thin' as const, biomes: ['minecraft:plains'], spacing: 32, separation: 8 };

/** Write a real split assembly to a temp folder, NESTING the pieces under a datapack-like
 *  `data/m/structure/big/` tree and the manifest at the root — exactly the on-disk shape an
 *  Export to World produces — so the folder discovery (manifest walk + nbt index) is exercised. */
function writeAssembly(raw: RawStructure): { dir: string; expected: Map<string, string> } {
  const plan = splitPlan(raw.size, LIMIT);
  const { files } = splitToJigsaw(raw, plan, { namespace: 'm', base: 'big', version: '1.21.1', worldgen: WORLDGEN, dataVersion: DEFAULT_DATA_VERSION });
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'bw-asm-'));
  const pieceDir = path.join(root, 'data', 'm', 'structure', 'big');
  fs.mkdirSync(pieceDir, { recursive: true });

  const pieceFiles = files.filter((f) => f.kind === 'piece');
  for (let i = 0; i < plan.slots.length; i++) {
    const file = pieceFiles[i];
    if (!('buffer' in file)) throw new Error('piece must be a buffer');
    fs.writeFileSync(path.join(pieceDir, `${pieceName(plan.slots[i])}.nbt`), file.buffer);
  }
  const manifest = splitManifest({ namespace: 'm', base: 'big', size: raw.size, limit: LIMIT, dataVersion: DEFAULT_DATA_VERSION });
  fs.writeFileSync(path.join(root, SPLIT_MANIFEST_FILE), JSON.stringify(manifest));

  const expected = new Map<string, string>();
  for (const b of raw.blocks) expected.set(b.pos.join(','), blockStateString(raw.palette[b.state]));
  return { dir: root, expected };
}

function denseBox(size: Vec3): RawStructure {
  const blocks: RawStructure['blocks'] = [];
  for (let x = 0; x < size[0]; x++) for (let y = 0; y < size[1]; y++) for (let z = 0; z < size[2]; z++) blocks.push({ state: (x + y + z) % 2, pos: [x, y, z] });
  return { size, palette: [{ Name: 'minecraft:stone' }, { Name: 'minecraft:cobblestone' }], blocks };
}

describe('reassembleFolderToBuffer', () => {
  it('discovers the manifest + nested pieces and reassembles voxel-perfectly', async () => {
    const raw = denseBox([60, 8, 60]);
    const { dir, expected } = writeAssembly(raw);

    const result = await reassembleFolderToBuffer(dir);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.missing).toBe(0);
    expect(result.name).toBe('big');

    const out = path.join(dir, 'merged.nbt');
    fs.writeFileSync(out, result.buffer);
    const merged = await readRaw(out);
    fs.rmSync(dir, { recursive: true, force: true });

    const got = new Map<string, string>();
    for (const b of merged.blocks) got.set(b.pos.join(','), blockStateString(merged.palette[b.state]));
    expect(got.size).toBe(expected.size);
    for (const [k, v] of expected) expect(got.get(k)).toBe(v);
  });

  it('errors when the folder has no manifest', async () => {
    const empty = fs.mkdtempSync(path.join(os.tmpdir(), 'bw-asm-empty-'));
    const result = await reassembleFolderToBuffer(empty);
    fs.rmSync(empty, { recursive: true, force: true });
    expect(result).toEqual({ ok: false, error: 'no_manifest' });
  });

  it('reports missing pieces but still reassembles the rest', async () => {
    const raw = denseBox([60, 8, 8]); // 2 pieces along X
    const { dir } = writeAssembly(raw);
    // Delete one piece file.
    const plan = splitPlan(raw.size, LIMIT);
    fs.rmSync(path.join(dir, 'data', 'm', 'structure', 'big', `${pieceName(plan.slots[1])}.nbt`));

    const result = await reassembleFolderToBuffer(dir);
    fs.rmSync(dir, { recursive: true, force: true });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.missing).toBe(1);
  });
});
