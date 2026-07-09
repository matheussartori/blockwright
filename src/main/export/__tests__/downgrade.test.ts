import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Workspace } from '@/shared/types';
import { en } from '@/shared/i18n/en';
import { encodeStructure } from '../../structure/authoring/nbt-encode';
import { readAuthoring } from '../../structure/authoring';
import { downgradeBlockId } from '../../structure/mc-block-versions';
import { DOWNGRADE_CODES, downgradeWorkspace } from '../downgrade';

let root: string;
const NS = 'mymod';
const ws = (): Workspace => ({ name: 'MyMod', root, namespace: NS, minecraftVersion: '26.2' });

const write = (rel: string, content: Buffer | string) => {
  const abs = path.join(root, rel);
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(abs, content);
};

/** A REAL structure `.nbt` with the given palette, stamped with `dataVersion`. */
const nbtWith = (dataVersion: number, palette: { Name: string; Properties?: Record<string, string> }[]): Buffer =>
  encodeStructure({
    dataVersion,
    size: [palette.length, 1, 1],
    palette,
    blocks: palette.map((_, i) => ({ pos: [i, 0, 0], state: i })),
    entities: [],
  });

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'bw-downgrade-'));
});

afterEach(() => {
  fs.rmSync(root, { recursive: true, force: true });
});

describe('downgradeBlockId', () => {
  it('keeps blocks the target knows (and every non-vanilla id)', () => {
    expect(downgradeBlockId('minecraft:stone', '1.18.2')).toEqual({ kind: 'keep' });
    expect(downgradeBlockId('minecraft:mud', '1.19.4')).toEqual({ kind: 'keep' });
    expect(downgradeBlockId('mymod:crafter', '1.18.2')).toEqual({ kind: 'keep' });
  });

  it('undoes the 1.20.3 grass rename below the rename version only', () => {
    expect(downgradeBlockId('minecraft:short_grass', '1.19.4')).toEqual({ kind: 'rename', to: 'minecraft:grass' });
    expect(downgradeBlockId('minecraft:short_grass', '1.20.4')).toEqual({ kind: 'keep' });
  });

  it('substitutes a same-shape stand-in (properties survive) below the introduction', () => {
    expect(downgradeBlockId('minecraft:tuff_stairs', '1.20.4')).toEqual({
      kind: 'substitute',
      to: 'minecraft:andesite_stairs',
      keepProps: true,
    });
    expect(downgradeBlockId('minecraft:tuff_stairs', '1.21')).toEqual({ kind: 'keep' });
  });

  it('drops properties across families and falls back to structure_void without a stand-in', () => {
    expect(downgradeBlockId('minecraft:crafter', '1.20.4')).toEqual({
      kind: 'substitute',
      to: 'minecraft:dispenser',
      keepProps: false,
    });
    expect(downgradeBlockId('minecraft:frogspawn', '1.18.2')).toEqual({
      kind: 'substitute',
      to: 'minecraft:structure_void',
      keepProps: false,
    });
  });

  it('walks substitute chains until a block the target knows (hanging sign → sign)', () => {
    // cherry_hanging_sign (1.20) → birch_sign for a 1.19 target — two table hops.
    expect(downgradeBlockId('minecraft:cherry_hanging_sign', '1.19.4')).toEqual({
      kind: 'substitute',
      to: 'minecraft:birch_sign',
      keepProps: false,
    });
  });
});

describe('downgradeWorkspace', () => {
  it('every entry code has an i18n string (en; pt-BR follows via the coverage test)', () => {
    for (const code of DOWNGRADE_CODES) {
      expect(en[`downgrade.entry.${code}` as keyof typeof en], `downgrade.entry.${code}`).toBeTruthy();
    }
  });

  it('refuses an unsupported target (below the 1.18.2 registry floor / unparseable)', async () => {
    expect((await downgradeWorkspace(ws(), '1.16.5')).entries).toEqual([
      expect.objectContaining({ kind: 'loss', code: 'target_unsupported' }),
    ]);
    expect((await downgradeWorkspace(ws(), 'banana')).entries).toEqual([
      expect.objectContaining({ kind: 'loss', code: 'target_unsupported' }),
    ]);
  });

  it('writes a suffixed copy with remapped blocks and NEVER touches the original', async () => {
    const original = nbtWith(4903, [
      { Name: 'minecraft:short_grass' },
      { Name: 'minecraft:tuff_stairs', Properties: { facing: 'east', half: 'bottom' } },
      { Name: 'minecraft:crafter', Properties: { orientation: 'north_up' } },
      { Name: 'minecraft:pink_petals' },
      { Name: 'minecraft:stone' },
    ]);
    write(`data/${NS}/structure/tower.nbt`, original);

    const report = await downgradeWorkspace(ws(), '1.19.4');
    expect(report.checkedFiles).toBe(1);
    expect(report.written).toBe(1);
    expect(report.entries).toContainEqual(expect.objectContaining({ kind: 'changed', code: 'id_renamed', detail: 'minecraft:short_grass → minecraft:grass' }));
    expect(report.entries).toContainEqual(expect.objectContaining({ kind: 'loss', code: 'block_substituted', detail: 'minecraft:tuff_stairs → minecraft:andesite_stairs' }));
    expect(report.entries).toContainEqual(expect.objectContaining({ kind: 'loss', code: 'block_substituted', detail: 'minecraft:crafter → minecraft:dispenser' }));
    expect(report.entries).toContainEqual(expect.objectContaining({ kind: 'loss', code: 'block_voided', detail: 'minecraft:pink_petals' }));
    expect(report.entries).toContainEqual(expect.objectContaining({ kind: 'changed', code: 'dataversion_restamped', detail: '4903 → 3337' }));

    // The original is byte-identical.
    expect(fs.readFileSync(path.join(root, `data/${NS}/structure/tower.nbt`)).equals(original)).toBe(true);

    // The copy: restamped, renamed, substituted (props kept for same-shape, dropped across families).
    const copy = await readAuthoring(path.join(root, `data/${NS}/structure/tower.1.19.4.nbt`));
    expect(copy.DataVersion).toBe(3337);
    const palette = copy.palette ?? [];
    expect(palette.map((p) => p.Name)).toEqual([
      'minecraft:grass',
      'minecraft:andesite_stairs',
      'minecraft:dispenser',
      'minecraft:structure_void',
      'minecraft:stone',
    ]);
    expect(palette[1].Properties).toMatchObject({ facing: 'east', half: 'bottom' });
    expect(palette[2].Properties ?? {}).toEqual({});
  });

  it('skips files already at/below the target and previous downgrade copies', async () => {
    write(`data/${NS}/structure/old.nbt`, nbtWith(3337, [{ Name: 'minecraft:stone' }]));
    write(`data/${NS}/structure/tower.1.19.4.nbt`, nbtWith(4903, [{ Name: 'minecraft:stone' }]));
    const report = await downgradeWorkspace(ws(), '1.19.4');
    expect(report.checkedFiles).toBe(1); // the copy is not an input
    expect(report.written).toBe(0);
    expect(report.entries).toHaveLength(0);
  });

  it('reports an unreadable .nbt as a loss and keeps going', async () => {
    write(`data/${NS}/structure/broken.nbt`, 'not an nbt');
    write(`data/${NS}/structure/fine.nbt`, nbtWith(4903, [{ Name: 'minecraft:stone' }]));
    const report = await downgradeWorkspace(ws(), '1.21.1');
    expect(report.checkedFiles).toBe(2);
    expect(report.written).toBe(1);
    expect(report.entries).toContainEqual(expect.objectContaining({ kind: 'loss', code: 'unreadable_nbt' }));
  });

  it('scans both structure/ and structures/ folder spellings', async () => {
    write(`data/${NS}/structures/legacy.nbt`, nbtWith(4903, [{ Name: 'minecraft:stone' }]));
    const report = await downgradeWorkspace(ws(), '1.21.1');
    expect(report.written).toBe(1);
    expect(fs.existsSync(path.join(root, `data/${NS}/structures/legacy.1.21.1.nbt`))).toBe(true);
  });
});
