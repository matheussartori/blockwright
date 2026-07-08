import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Workspace } from '@/shared/types';
import { en } from '@/shared/i18n/en';
import { encodeStructure } from '../../structure/authoring/nbt-encode';
import { readAuthoring } from '../../structure/authoring';
import { applyDoctorFix, upgradeWorkspace, UPGRADE_CODES } from '../upgrade';
import { setActiveWorkspace } from '../../structure/assets/content-pack';

let root: string;
const NS = 'mymod';
const ws = (version: string | null = '1.21.1'): Workspace => ({ name: 'MyMod', root, namespace: NS, minecraftVersion: version });

const write = (rel: string, content: unknown) => {
  const abs = path.join(root, rel);
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(abs, typeof content === 'string' || Buffer.isBuffer(content) ? content : JSON.stringify(content));
};

/** A tiny REAL structure `.nbt` (one stone block) stamped with `dataVersion`. */
const tinyNbt = (dataVersion: number): Buffer =>
  encodeStructure({
    dataVersion,
    size: [1, 1, 1],
    palette: [{ Name: 'minecraft:stone' }],
    blocks: [{ pos: [0, 0, 0], state: 0 }],
    entities: [],
  });

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'bw-upgrade-'));
});

afterEach(() => {
  fs.rmSync(root, { recursive: true, force: true });
  setActiveWorkspace(null);
});

describe('upgradeWorkspace', () => {
  it('every entry code has an i18n string (en; pt-BR follows via the coverage test)', () => {
    for (const code of UPGRADE_CODES) {
      expect(en[`upgrade.entry.${code}` as keyof typeof en], `upgrade.entry.${code}`).toBeTruthy();
    }
  });

  it('reports a loss when the workspace has no target version', async () => {
    const report = await upgradeWorkspace(ws(null));
    expect(report.entries).toEqual([expect.objectContaining({ kind: 'loss', code: 'no_target_version' })]);
  });

  it('moves legacy structures/ into structure/ for a 1.21 target', async () => {
    write(`data/${NS}/structures/tower.nbt`, tinyNbt(3955));
    const report = await upgradeWorkspace(ws('1.21.1'));
    expect(report.entries).toContainEqual(expect.objectContaining({ kind: 'changed', code: 'folder_renamed' }));
    expect(fs.existsSync(path.join(root, `data/${NS}/structure/tower.nbt`))).toBe(true);
    expect(fs.existsSync(path.join(root, `data/${NS}/structures/tower.nbt`))).toBe(false);
  });

  it('re-stamps an older DataVersion to the target and leaves a NEWER one untouched (a loss)', async () => {
    write(`data/${NS}/structure/old.nbt`, tinyNbt(2975)); // 1.18.2
    write(`data/${NS}/structure/newer.nbt`, tinyNbt(99999));
    const report = await upgradeWorkspace(ws('1.21.1')); // target DataVersion 3955
    expect(report.entries).toContainEqual(
      expect.objectContaining({ kind: 'changed', code: 'dataversion_restamped', detail: '2975 → 3955' }),
    );
    expect(report.entries).toContainEqual(
      expect.objectContaining({ kind: 'loss', code: 'dataversion_newer', file: path.join('data', NS, 'structure', 'newer.nbt') }),
    );
    // The re-stamped file still reads as the SAME structure (only DataVersion moved).
    const upgraded = await readAuthoring(path.join(root, `data/${NS}/structure/old.nbt`));
    expect(upgraded.DataVersion).toBe(3955);
    expect(upgraded.size).toEqual([1, 1, 1]);
    expect(upgraded.blocks).toHaveLength(1);
    const untouched = await readAuthoring(path.join(root, `data/${NS}/structure/newer.nbt`));
    expect(untouched.DataVersion).toBe(99999);
  });

  it('re-stamps pack.mcmeta (classic pack_format AND the 26.x range fields)', async () => {
    write('pack.mcmeta', { pack: { pack_format: 15, max_format: 15, description: 'x' } });
    const report = await upgradeWorkspace(ws('1.21.1'));
    expect(report.entries).toContainEqual(expect.objectContaining({ kind: 'changed', code: 'meta_restamped' }));
    const meta = JSON.parse(fs.readFileSync(path.join(root, 'pack.mcmeta'), 'utf8')) as {
      pack: { pack_format: number; max_format: number; description: string };
    };
    expect(meta.pack.pack_format).toBe(48); // 1.21.1
    expect(meta.pack.max_format).toBe(48);
    expect(meta.pack.description).toBe('x'); // untouched fields survive
  });

  it('reports an unreadable .nbt as a loss and keeps going', async () => {
    write(`data/${NS}/structure/broken.nbt`, 'not an nbt');
    write(`data/${NS}/structure/fine.nbt`, tinyNbt(3955));
    const report = await upgradeWorkspace(ws('1.21.1'));
    expect(report.checkedFiles).toBe(2);
    expect(report.entries).toContainEqual(expect.objectContaining({ kind: 'loss', code: 'unreadable_nbt' }));
  });
});

describe('applyDoctorFix', () => {
  it('injects spawn_overrides: {} into a jigsaw def', async () => {
    write(`data/${NS}/worldgen/structure/tower.json`, { type: 'minecraft:jigsaw', biomes: ['minecraft:plains'] });
    setActiveWorkspace(ws());
    const result = await applyDoctorFix('missing_spawn_overrides', path.join('data', NS, 'worldgen', 'structure', 'tower.json'));
    expect(result.ok).toBe(true);
    const json = JSON.parse(fs.readFileSync(path.join(root, `data/${NS}/worldgen/structure/tower.json`), 'utf8')) as Record<string, unknown>;
    expect(json.spawn_overrides).toEqual({});
    expect(json.biomes).toEqual(['minecraft:plains']);
  });

  it('renames the legacy folder, keeping files that already exist at the destination', async () => {
    write(`data/${NS}/structures/a.nbt`, tinyNbt(3955));
    write(`data/${NS}/structures/b.nbt`, tinyNbt(3955));
    write(`data/${NS}/structure/b.nbt`, tinyNbt(3955)); // conflict — must not be overwritten
    setActiveWorkspace(ws());
    const result = await applyDoctorFix('wrong_folder', path.join('data', NS, 'structures'));
    expect(result).toEqual({ ok: true, detail: '1 moved, 1 kept (already exist)' });
    expect(fs.existsSync(path.join(root, `data/${NS}/structure/a.nbt`))).toBe(true);
    expect(fs.existsSync(path.join(root, `data/${NS}/structures/b.nbt`))).toBe(true);
  });

  it('refuses an unknown code and a missing workspace', async () => {
    setActiveWorkspace(ws());
    expect((await applyDoctorFix('biomes_empty', 'x')).ok).toBe(false);
    setActiveWorkspace(null);
    expect((await applyDoctorFix('stale_format', 'pack.mcmeta')).ok).toBe(false);
  });
});
