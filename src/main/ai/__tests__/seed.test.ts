import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { buildSeed, editPreamble } from '../seed';
import type { Session } from '../session';

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bw-seed-'));
afterAll(() => fs.rmSync(tmpDir, { recursive: true, force: true }));

const session = (over: Partial<Session> = {}): Session => ({ sdkSessionId: null, version: 0, dir: tmpDir, ...over });

describe('editPreamble', () => {
  it('wraps the JSON as an edit instruction ending with the user request', () => {
    const p = editPreamble('{"size":[1,1,1]}');
    expect(p).toMatch(/EDITING an existing structure/);
    expect(p).toContain('{"size":[1,1,1]}');
    expect(p.trimEnd().endsWith('USER REQUEST:')).toBe(true);
  });
});

describe('buildSeed', () => {
  it('resumable + fresh session + no open file → no seed', async () => {
    expect(await buildSeed(true, session(), undefined)).toBe('');
  });

  it('resumable + established conversation → no seed (the server remembers)', async () => {
    expect(await buildSeed(true, session({ version: 2, sdkSessionId: 'abc' }), '/some/open.nbt')).toBe('');
  });

  it('stateless + a prior version → re-seeds from the latest version JSON', async () => {
    fs.writeFileSync(path.join(tmpDir, 'v2.json'), '{"size":[2,2,2],"palette":[]}');
    const seed = await buildSeed(false, session({ version: 2 }), undefined);
    expect(seed).toMatch(/EDITING an existing structure/);
    expect(seed).toContain('{"size":[2,2,2],"palette":[]}');
  });

  it('stateless + no prior version + no open file → no seed', async () => {
    expect(await buildSeed(false, session({ version: 0 }), undefined)).toBe('');
  });
});
