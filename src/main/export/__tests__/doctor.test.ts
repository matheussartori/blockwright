import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Workspace } from '@/shared/types';
import { en } from '@/shared/i18n/en';
import { encodeStructure } from '../../structure/authoring/nbt-encode';
import { doctorWorkspace, DOCTOR_CODES } from '../doctor';

let root: string;
const NS = 'mymod';
const ws = (): Workspace => ({ name: 'MyMod', root, namespace: NS, minecraftVersion: '1.21.1' });

const write = (rel: string, content: unknown) => {
  const abs = path.join(root, rel);
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  const data = typeof content === 'string' || Buffer.isBuffer(content) ? content : JSON.stringify(content);
  fs.writeFileSync(abs, data);
};

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'bw-doctor-'));
});

afterEach(() => {
  fs.rmSync(root, { recursive: true, force: true });
});

const codes = (findings: { code: string }[]) => findings.map((f) => f.code).sort();

describe('doctorWorkspace', () => {
  it('is all clear on an empty (but valid) workspace', async () => {
    const report = await doctorWorkspace(ws());
    expect(report.findings).toEqual([]);
  });

  it('catches the missing spawn_overrides + dead start pool on a jigsaw def', async () => {
    write(`data/${NS}/worldgen/structure/tower.json`, {
      type: 'minecraft:jigsaw',
      start_pool: `${NS}:tower/start`,
      biomes: ['minecraft:plains'],
    });
    const report = await doctorWorkspace(ws());
    expect(codes(report.findings)).toEqual(['missing_pool', 'missing_spawn_overrides']);
    expect(report.findings.every((f) => f.level === 'error')).toBe(true);
  });

  it('accepts a complete jigsaw def whose pool + structure file exist', async () => {
    write(`data/${NS}/worldgen/structure/tower.json`, {
      type: 'minecraft:jigsaw',
      start_pool: `${NS}:tower/start`,
      spawn_overrides: {},
      biomes: ['minecraft:plains'],
    });
    write(`data/${NS}/worldgen/template_pool/tower/start.json`, {
      elements: [{ element: { location: `${NS}:tower` } }],
    });
    // A tiny valid gzipped .nbt is overkill here — put the referenced file at the
    // structure path so the existence check passes (content isn't decoded for pools).
    write(`data/${NS}/structure/tower.nbt`, 'placeholder');
    const report = await doctorWorkspace(ws());
    // The placeholder isn't a real NBT (the size check flags that separately) — the
    // point here is that NO worldgen rule fires on a complete def.
    const worldgen = report.findings.filter((f) => f.code !== 'invalid_nbt');
    expect(worldgen).toEqual([]);
  });

  it('catches terrain-adaptation distance past the 116 cap', async () => {
    write(`data/${NS}/worldgen/structure/big.json`, {
      type: 'minecraft:jigsaw',
      spawn_overrides: {},
      terrain_adaptation: 'beard_thin',
      max_distance_from_center: 128,
      biomes: ['minecraft:plains'],
    });
    const report = await doctorWorkspace(ws());
    expect(codes(report.findings)).toContain('distance_cap');
  });

  it('catches structure-set problems: empty set, bad spacing, dangling reference', async () => {
    write(`data/${NS}/worldgen/structure_set/empty.json`, { structures: [], placement: {} });
    write(`data/${NS}/worldgen/structure_set/bad.json`, {
      structures: [{ structure: `${NS}:ghost` }],
      placement: { spacing: 8, separation: 8 },
    });
    const report = await doctorWorkspace(ws());
    expect(codes(report.findings)).toEqual(['empty_set', 'missing_structure_def', 'separation_ge_spacing']);
  });

  it('catches empty biome tags, empty pools and invalid JSON', async () => {
    write(`data/${NS}/tags/worldgen/biome/has_structure/tower.json`, { values: [] });
    write(`data/${NS}/worldgen/template_pool/empty.json`, { elements: [] });
    write(`data/${NS}/worldgen/structure/broken.json`, '{not json');
    const report = await doctorWorkspace(ws());
    expect(codes(report.findings)).toEqual(['biome_tag_empty', 'invalid_json', 'pool_empty']);
  });

  it('flags .nbt files sitting in the folder this version does not read', async () => {
    write(`data/${NS}/structures/old.nbt`, 'x'); // 1.21.1 reads `structure/`, not `structures/`
    const report = await doctorWorkspace(ws());
    expect(codes(report.findings)).toEqual(['wrong_folder']);
  });

  it('flags a stale pack.mcmeta format for the workspace version', async () => {
    write('pack.mcmeta', { pack: { pack_format: 18 } });
    const report = await doctorWorkspace(ws());
    expect(codes(report.findings)).toEqual(['stale_format']);
    expect(report.findings[0].level).toBe('warning');
  });

  it('warns when a mob in a structure carries equipment (re-rolled on generation)', async () => {
    write(
      `data/${NS}/structure/guard.nbt`,
      encodeStructure({
        dataVersion: 3953,
        size: [1, 1, 1],
        palette: [{ Name: 'minecraft:stone' }],
        blocks: [{ pos: [0, 0, 0], state: 0 }],
        entities: [{
          pos: [0.5, 1, 0.5],
          blockPos: [0, 1, 0],
          nbt: { id: 'minecraft:zombie', HandItems: [{ id: 'minecraft:iron_sword', count: 1 }, {}] },
        }],
      }),
    );
    const report = await doctorWorkspace(ws());
    expect(codes(report.findings)).toEqual(['mob_equipment']);
    expect(report.findings[0].level).toBe('warning');
  });

  it('warns about waterloggable blocks in an aquatic-biome jigsaw structure', async () => {
    write(`data/${NS}/worldgen/structure/wreck.json`, {
      type: 'minecraft:jigsaw',
      spawn_overrides: {},
      start_pool: `${NS}:wreck/start`,
      biomes: [`#${NS}:has_structure/wreck`],
    });
    write(`data/${NS}/tags/worldgen/biome/has_structure/wreck.json`, { values: ['minecraft:deep_ocean'] });
    write(`data/${NS}/worldgen/template_pool/wreck/start.json`, {
      elements: [{ element: { location: `${NS}:wreck` } }],
    });
    write(
      `data/${NS}/structure/wreck.nbt`,
      encodeStructure({
        dataVersion: 3953,
        size: [1, 1, 1],
        palette: [{ Name: 'minecraft:oak_stairs', Properties: { waterlogged: 'false', facing: 'north' } }],
        blocks: [{ pos: [0, 0, 0], state: 0 }],
        entities: [],
      }),
    );
    const report = await doctorWorkspace(ws());
    expect(codes(report.findings)).toEqual(['waterlog_risk']);
    expect(report.findings[0].detail).toBe('minecraft:oak_stairs');
  });

  it('stays quiet about waterloggable blocks when no biome is aquatic', async () => {
    write(`data/${NS}/worldgen/structure/tower.json`, {
      type: 'minecraft:jigsaw',
      spawn_overrides: {},
      start_pool: `${NS}:tower/start`,
      biomes: ['minecraft:plains'],
    });
    write(`data/${NS}/worldgen/template_pool/tower/start.json`, {
      elements: [{ element: { location: `${NS}:tower` } }],
    });
    write(
      `data/${NS}/structure/tower.nbt`,
      encodeStructure({
        dataVersion: 3953,
        size: [1, 1, 1],
        palette: [{ Name: 'minecraft:oak_stairs', Properties: { waterlogged: 'false', facing: 'north' } }],
        blocks: [{ pos: [0, 0, 0], state: 0 }],
        entities: [],
      }),
    );
    const report = await doctorWorkspace(ws());
    expect(report.findings).toEqual([]);
  });

  it('every doctor code has a localized fix-it explanation', () => {
    // A code without its `doctor.issue.<code>` string would surface as a raw key in the
    // dialog (pt-BR parity is enforced separately by the i18n coverage test).
    for (const code of DOCTOR_CODES) {
      expect((en as Record<string, string>)[`doctor.issue.${code}`], `doctor.issue.${code}`).toBeTruthy();
    }
  });
});
